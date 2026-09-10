import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  drafts,
  draftRevisions,
  effects,
  entries,
  financialRequests,
  groups,
  members,
  previews,
} from "../db/schema.js";
import {
  entryInput,
  outstanding,
  postEntry,
  type PostedEntry,
} from "../domain/ledger.js";
import {
  combineEffects,
  refundEntry,
  reverseEffects,
  type FinancialCommand,
} from "../domain/lifecycle.js";
import { fail, validateDomain } from "../lib/errors.js";
import { requestHash } from "../lib/json.js";
import { lockGroup, type Transaction } from "./access.js";
import { eligibleMemberIds } from "./participants.js";

type Entry = typeof entries.$inferSelect;
type PlannedEntry = PostedEntry &
  Pick<Entry, "kind" | "description" | "date" | "input"> &
  Partial<
    Pick<Entry, "reverses" | "refundOf" | "corrects" | "correctionReason">
  >;
type Plan = { records: PlannedEntry[]; draft?: typeof drafts.$inferSelect };
export const PREVIEW_LIFETIME_MS = 10 * 60 * 1000;

async function findEntry(tx: Transaction, groupId: string, id: string) {
  const [entry] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.groupId, groupId), eq(entries.id, id)));
  if (!entry) fail("Entry not found.", 404);
  return entry;
}
async function entryEffects(tx: Transaction, groupId: string, id: string) {
  return tx
    .select()
    .from(effects)
    .where(and(eq(effects.groupId, groupId), eq(effects.entryId, id)));
}
async function activeRefunds(
  tx: Transaction,
  groupId: string,
  entryId: string,
) {
  return tx
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.groupId, groupId),
        eq(entries.refundOf, entryId),
        sql`not exists (select 1 from entries reversal where reversal."reverses" = ${entries.id} and reversal."groupId" = ${entries.groupId})`,
      ),
    );
}
async function buildPlan(
  tx: Transaction,
  groupId: string,
  command: FinancialCommand,
): Promise<Plan> {
  const groupMembers = await tx
    .select({ id: members.id, archivedAt: members.archivedAt })
    .from(members)
    .where(eq(members.groupId, groupId));
  const ids = groupMembers.map((member) => member.id);
  const ordinary = (
    input: ReturnType<typeof entryInput.parse>,
  ): PlannedEntry => ({
    ...input,
    input,
    ...validateDomain(() =>
      postEntry(input, eligibleMemberIds(input.kind, groupMembers)),
    ),
  });
  if (command.action === "post") return { records: [ordinary(command.input)] };
  if (command.action === "postDraft") {
    const [draft] = await tx
      .select()
      .from(drafts)
      .where(and(eq(drafts.groupId, groupId), eq(drafts.id, command.draftId)));
    if (!draft) fail("Draft not found.", 404);
    if (draft.state !== "draft" || draft.version !== command.version)
      fail(
        "This draft changed or was already posted. Reload it before continuing.",
        409,
      );
    return { records: [ordinary(entryInput.parse(draft.input))], draft };
  }
  const original = await findEntry(tx, groupId, command.entryId);
  const [reversal] = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(eq(entries.groupId, groupId), eq(entries.reverses, original.id)),
    );
  if (original.kind === "reversal")
    fail("A reversal cannot be changed. Create a new record instead.", 400);
  if (reversal) fail("This entry has already been reversed.", 409);
  const originalEffects = await entryEffects(tx, groupId, original.id);
  const refunds = await activeRefunds(tx, groupId, original.id);
  if (command.action === "refund") {
    if (original.kind !== "income" && original.kind !== "expense")
      fail("Only income or expense records can be refunded.", 400);
    if (command.input.date < original.date)
      fail("A refund cannot be dated before its original record.", 400);
    const refundEffects = refunds.length
      ? await tx
          .select()
          .from(effects)
          .where(
            and(
              eq(effects.groupId, groupId),
              inArray(
                effects.entryId,
                refunds.map((row) => row.id),
              ),
            ),
          )
      : [];
    const previous = refunds.map((row) => ({
      amount: row.amount,
      effects: refundEffects.filter((effect) => effect.entryId === row.id),
    }));
    const posted = validateDomain(() =>
      refundEntry(
        command.input,
        {
          kind: original.kind as "income" | "expense",
          amount: original.amount,
          effects: originalEffects,
        },
        previous,
        ids,
      ),
    );
    return {
      records: [
        {
          kind: "refund",
          ...command.input,
          input: command.input,
          refundOf: original.id,
          ...posted,
        },
      ],
    };
  }
  if (refunds.length)
    fail(
      "Reverse the linked refunds before reversing or correcting this record.",
      409,
    );
  const reversed: PlannedEntry = {
    kind: "reversal",
    description: command.reason,
    // A correction voids the erroneous record at its original date, then posts the replacement at its own date.
    date: command.action === "correct" ? original.date : command.date,
    input: { reverses: original.id, reason: command.reason },
    reverses: original.id,
    amount: original.amount,
    effects: reverseEffects(originalEffects),
  };
  if (command.action === "reverse") {
    if (command.date < original.date)
      fail("A reversal cannot be dated before its original record.", 400);
    return { records: [reversed] };
  }
  if (original.kind === "refund")
    fail("Reverse an incorrect refund, then record a new linked refund.", 400);
  return {
    records: [
      reversed,
      {
        ...ordinary(command.replacement),
        corrects: original.id,
        correctionReason: command.reason,
      },
    ],
  };
}

async function saveRecord(
  tx: Transaction,
  groupId: string,
  actor: string,
  record: PlannedEntry,
  hash: string,
) {
  const { effects: rows } = record;
  const [saved] = await tx
    .insert(entries)
    .values({
      groupId,
      kind: record.kind,
      description: record.description,
      date: record.date,
      amount: record.amount,
      input: record.input,
      actor,
      idempotencyKey: randomUUID(),
      requestHash: hash,
      reverses: record.reverses,
      refundOf: record.refundOf,
      corrects: record.corrects,
      correctionReason: record.correctionReason,
    })
    .returning();
  if (!saved) throw new Error("Journal insert returned no record.");
  await tx
    .insert(effects)
    .values(rows.map((effect) => ({ ...effect, groupId, entryId: saved.id })));
  return saved.id;
}

export function financialService(db: Database) {
  return {
    async preview(groupId: string, actor: string, command: FinancialCommand) {
      return db.transaction(async (tx) => {
        const group = await lockGroup(tx, groupId, actor);
        const plan = await buildPlan(tx, groupId, command);
        const now = new Date();
        await tx
          .delete(previews)
          .where(
            and(eq(previews.groupId, groupId), lt(previews.expiresAt, now)),
          );
        const [preview] = await tx
          .insert(previews)
          .values({
            groupId,
            actor,
            requestHash: requestHash(command),
            ledgerVersion: group.ledgerVersion,
            expiresAt: new Date(now.getTime() + PREVIEW_LIFETIME_MS),
          })
          .returning();
        const combined = combineEffects(
          plan.records.flatMap((record) => record.effects),
        );
        return {
          previewId: preview!.id,
          ledgerVersion: group.ledgerVersion,
          expiresAt: preview!.expiresAt,
          amount: plan.records.at(-1)!.amount,
          records: plan.records.map((record) => ({
            kind: record.kind,
            amount: record.amount,
            description: record.description,
            date: record.date,
          })),
          effects: combined.map((effect) => ({
            ...effect,
            outstanding: outstanding(effect),
          })),
        };
      });
    },
    async post(
      groupId: string,
      actor: string,
      command: FinancialCommand,
      previewId: string,
      key: string,
    ) {
      const hash = requestHash(command);
      return db.transaction(async (tx) => {
        const group = await lockGroup(tx, groupId, actor);
        const [retry] = await tx
          .select()
          .from(financialRequests)
          .where(
            and(
              eq(financialRequests.groupId, groupId),
              eq(financialRequests.key, key),
            ),
          );
        if (retry) {
          if (retry.requestHash !== hash || retry.actor !== actor)
            fail(
              "This request key was already used for a different operation.",
              409,
            );
          // A successful retry remains valid even after its preview expires or the ledger changes.
          return { entryIds: retry.entryIds };
        }
        const [preview] = await tx
          .select()
          .from(previews)
          .where(
            and(
              eq(previews.groupId, groupId),
              eq(previews.id, previewId),
              eq(previews.actor, actor),
            ),
          );
        if (!preview || preview.requestHash !== hash)
          fail("Preview this exact operation before posting.", 409);
        if (
          preview.expiresAt.getTime() <= Date.now() ||
          preview.ledgerVersion !== group.ledgerVersion
        )
          fail(
            "The preview expired or the group changed. Review a fresh preview before posting.",
            409,
          );
        // Revalidate limits and draft revision under the same lock as the financial write.
        const plan = await buildPlan(tx, groupId, command);
        const entryIds: string[] = [];
        for (const record of plan.records)
          entryIds.push(await saveRecord(tx, groupId, actor, record, hash));
        if (plan.draft) {
          const version = plan.draft.version + 1;
          await tx
            .update(drafts)
            .set({
              state: "posted",
              postedEntryId: entryIds[0],
              version,
              updatedBy: actor,
              updatedAt: new Date(),
            })
            .where(
              and(eq(drafts.groupId, groupId), eq(drafts.id, plan.draft.id)),
            );
          await tx.insert(draftRevisions).values({
            groupId,
            draftId: plan.draft.id,
            version,
            input: plan.draft.input,
            state: "posted",
            actor,
          });
        }
        await tx
          .insert(financialRequests)
          .values({ groupId, actor, key, requestHash: hash, entryIds });
        // Any posting invalidates every open preview in this group. Balance
        // effects shown before someone else's entry landed no longer describe
        // what confirming would do, so the next confirm is refused as stale.
        await tx
          .update(groups)
          .set({ ledgerVersion: sql`${groups.ledgerVersion} + 1` })
          .where(eq(groups.id, groupId));
        return { entryIds };
      });
    },
  };
}
