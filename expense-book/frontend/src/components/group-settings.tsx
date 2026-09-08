"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type Settings = {
  version: number;
  currentSubject: string;
  emailEnabled: boolean;
  members: {
    id: string;
    name: string;
    archivedAt: string | null;
    linkedSubject: string | null;
  }[];
  grants: { subject: string; email: string | null; role: string }[];
  invitations: {
    id: string;
    memberId: string;
    email: string;
    role: string;
    state: string;
    delivery: string;
    expiresAt: string;
  }[];
  events: { id: string; action: string; actor: string; createdAt: string }[];
};
type Command = Record<string, unknown> & { action: string };
const roles = ["admin", "editor", "viewer"];
const panel = "rounded-2xl border border-stone-200 bg-white p-6";

export function GroupSettings({ groupId }: { groupId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [labels, setLabels] = useState<{
    projects: { id: string; name: string; archivedAt: string | null }[];
    categories: { id: string; name: string; archivedAt: string | null }[];
    defaultSplitMethod?: "equal" | "weights" | "percentages" | "exact";
  }>({ projects: [], categories: [] });
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const load = useCallback(
    async () => setSettings(await api<Settings>(`/groups/${groupId}/settings`)),
    [groupId],
  );
  useEffect(() => {
    let active = true;
    api<Settings>(`/groups/${groupId}/settings`)
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [groupId]);
  useEffect(() => {
    api<typeof labels>(`/groups/${groupId}/labels`)
      .then(setLabels)
      .catch(() => undefined);
  }, [groupId]);
  async function addLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(
        `/groups/${groupId}/labels`,
        { kind: form.get("kind"), name: form.get("name") },
        crypto.randomUUID(),
      );
      setLabels(await api<typeof labels>(`/groups/${groupId}/labels`));
      event.currentTarget.reset();
      setNotice("Label created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create label.");
    }
  }
  async function saveDefaultSplit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = String(new FormData(event.currentTarget).get("method"));
    try {
      await api(
        `/groups/${groupId}/default-split`,
        { method },
        crypto.randomUUID(),
      );
      setLabels({
        ...labels,
        defaultSplitMethod: method as typeof labels.defaultSplitMethod,
      });
      setNotice("Default split rule saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save default split rule.",
      );
    }
  }
  async function change(command: Command) {
    if (!settings || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    const body = { version: settings.version, command };
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const result = await api<{ invitationPath?: string; delivery?: string }>(
        `/groups/${groupId}/settings`,
        body,
        attempt.current.key,
      );
      attempt.current = null;
      if (
        command.subject === settings.currentSubject &&
        (command.action === "removeAccess" ||
          (command.action === "setRole" && command.role !== "admin"))
      ) {
        window.location.assign(`/?group=${groupId}`);
        return;
      }
      if (result.invitationPath) {
        setInvitationLink(`${window.location.origin}${result.invitationPath}`);
        setNotice(
          result.delivery === "sent"
            ? "Invitation emailed. You can also copy the link below."
            : result.delivery === "failed"
              ? "Email delivery failed. Copy the link below or use Resend email."
              : "Invitation created. Share this link with the invited email address.",
        );
      } else setNotice("Changes saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save settings.");
    } finally {
      setPending(false);
    }
  }
  const ownLink = settings?.members.find(
    (member) => member.linkedSubject === settings.currentSubject,
  );
  const adminCount = settings?.grants.filter(
    (grant) => grant.role === "admin",
  ).length;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <a href={`/?group=${groupId}`} className="text-sm text-emerald-800">
        ← Back to group
      </a>
      <header>
        <h1 className="text-3xl font-semibold">Members & access</h1>
        <p className="mt-3 text-sm text-stone-500">
          Manage the people you share with and who can access the group.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setError("");
              void load().catch((e: Error) => setError(e.message));
            }}
          >
            Reload settings
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {invitationLink && (
        <label>
          Invitation link
          <input
            readOnly
            value={invitationLink}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      {!settings && !error && <p role="status">Loading group settings…</p>}
      {settings && (
        <fieldset disabled={pending} className="space-y-6">
          <section className={panel}>
            <h2 className="text-xl font-semibold">Projects & categories</h2>
            <p className="my-3 text-sm text-stone-500">
              Create reusable labels for consistent reports. Archived labels
              remain visible on historical records.
            </p>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={addLabel}
            >
              <label className="min-w-0 flex-1">
                Label name
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Summer trip"
                />
              </label>
              <label>
                Type
                <select name="kind">
                  <option value="project">Project</option>
                  <option value="category">Category</option>
                </select>
              </label>
              <Button>Create label</Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {[
                ...labels.projects.map((label) => `Project: ${label.name}`),
                ...labels.categories.map((label) => `Category: ${label.name}`),
              ].map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-stone-100 px-3 py-1"
                >
                  {label}
                </span>
              ))}
            </div>
            <form
              className="mt-5 flex flex-wrap items-end gap-3"
              onSubmit={saveDefaultSplit}
            >
              <label>
                Default split method
                <select
                  name="method"
                  defaultValue={labels.defaultSplitMethod ?? "equal"}
                >
                  <option value="equal">Equal shares</option>
                  <option value="weights">Weights</option>
                  <option value="percentages">Percentages</option>
                  <option value="exact">Exact amounts</option>
                </select>
              </label>
              <Button variant="outline">Save default split</Button>
            </form>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Members</h2>
            <p className="my-3 text-sm leading-6 text-stone-500">
              Archiving removes a member from new income and expense entries.
              Their history, balances, and account access remain; they can still
              settle outstanding amounts.
            </p>
            <div className="divide-y divide-stone-100">
              {settings.members.map((member) => (
                <div key={`${member.id}-${settings.version}`} className="py-4">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void change({
                        action: "renameMember",
                        memberId: member.id,
                        name: String(new FormData(e.currentTarget).get("name")),
                      });
                    }}
                  >
                    <label className="min-w-0 flex-1">
                      Member name
                      <input
                        aria-label={`Name for ${member.name}`}
                        name="name"
                        defaultValue={member.name}
                        required
                        maxLength={100}
                      />
                    </label>
                    <Button variant="outline" type="submit">
                      Save name
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        void change({
                          action: "archiveMember",
                          memberId: member.id,
                          archived: !member.archivedAt,
                        })
                      }
                    >
                      {member.archivedAt ? "Restore member" : "Archive member"}
                    </Button>
                  </form>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                    <span>
                      {member.archivedAt ? "Archived" : "Active"} ·{" "}
                      {member.linkedSubject
                        ? member.linkedSubject === settings.currentSubject
                          ? "Linked to your account"
                          : "Account linked"
                        : "No linked account"}
                    </span>
                    {!member.linkedSubject &&
                      !member.archivedAt &&
                      !ownLink && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void change({
                              action: "linkSelf",
                              memberId: member.id,
                            })
                          }
                        >
                          Link my account
                        </Button>
                      )}
                    {member.linkedSubject && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void change({
                            action: "unlinkMember",
                            memberId: member.id,
                          })
                        }
                      >
                        Unlink account
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form
              className="mt-5 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void change({
                  action: "addMember",
                  name: String(new FormData(e.currentTarget).get("name")),
                });
              }}
            >
              <label className="min-w-0 flex-1">
                New member
                <input
                  name="name"
                  placeholder="Member name"
                  required
                  maxLength={100}
                />
              </label>
              <Button>Add member</Button>
            </form>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Invite someone</h2>
            <p className="my-3 text-sm leading-6 text-stone-500">
              The recipient must sign in with the invited, verified email.
              Accepting links their account to an existing member and grants
              access to all group financial activity. Invitations expire in
              seven days.
            </p>
            {!settings.emailEnabled && (
              <p className="mb-4 text-sm text-stone-500">
                Email delivery is not configured for this environment. Create
                and share an invitation link.
              </p>
            )}
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void change({
                  action: "invite",
                  memberId: form.get("memberId"),
                  email: form.get("email"),
                  role: form.get("role"),
                });
              }}
            >
              <label>
                Link invitation to member
                <select name="memberId" required>
                  <option value="">Choose a member</option>
                  {settings.members
                    .filter(
                      (member) => !member.archivedAt && !member.linkedSubject,
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  placeholder="person@example.com"
                />
              </label>
              <label>
                Invitation role
                <select name="role" defaultValue="viewer">
                  {roles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button>
                  {settings.emailEnabled
                    ? "Send invitation"
                    : "Create invitation link"}
                </Button>
              </div>
            </form>
            <p className="mt-4 text-xs leading-5 text-stone-500">
              Admin: manage people and finances. Editor: manage financial
              records. Viewer: read and export.
            </p>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Account access</h2>
            <p className="my-3 text-sm text-stone-500">
              Unlinking an account keeps its group access. Use Remove access
              below to revoke it. Keep at least one admin.
            </p>
            {settings.grants.map((grant) => {
              const member = settings.members.find(
                (item) => item.linkedSubject === grant.subject,
              );
              const lastAdmin = grant.role === "admin" && adminCount === 1;
              return (
                <form
                  key={`${grant.subject}-${settings.version}`}
                  className="flex flex-wrap items-end gap-3 border-t border-stone-100 py-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change({
                      action: "setRole",
                      subject: grant.subject,
                      role: new FormData(e.currentTarget).get("role"),
                    });
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium">
                      {grant.subject === settings.currentSubject
                        ? "You"
                        : (member?.name ?? grant.email ?? "Unlinked account")}
                    </p>
                    <p className="break-all text-xs text-stone-500">
                      {grant.email ?? grant.subject}
                    </p>
                    {lastAdmin && (
                      <p className="mt-1 text-xs text-stone-500">Last admin</p>
                    )}
                  </div>
                  <label>
                    Role
                    <select
                      name="role"
                      defaultValue={grant.role}
                      disabled={lastAdmin}
                    >
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <Button variant="outline" disabled={lastAdmin}>
                    Save role
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={lastAdmin}
                    onClick={() =>
                      void change({
                        action: "removeAccess",
                        subject: grant.subject,
                      })
                    }
                  >
                    Remove access
                  </Button>
                </form>
              );
            })}
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Invitations</h2>
            <p className="mt-2 text-xs text-stone-500">
              Latest 100 invitations
            </p>
            {!settings.invitations.length && (
              <p className="mt-4 text-sm text-stone-500">No invitations yet.</p>
            )}
            {settings.invitations.map((invitation) => {
              const expired =
                invitation.state === "pending" &&
                new Date(invitation.expiresAt).getTime() <= Date.now();
              return (
                <div
                  key={invitation.id}
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4"
                >
                  <div>
                    <p className="break-all text-sm font-medium">
                      {invitation.email}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {invitation.role} ·{" "}
                      {expired ? "expired" : invitation.state} ·{" "}
                      {invitation.delivery === "link"
                        ? "link available"
                        : `email ${invitation.delivery}`}
                    </p>
                  </div>
                  {invitation.state === "pending" && (
                    <div className="flex flex-wrap gap-2">
                      {!expired && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setInvitationLink(
                              `${window.location.origin}/invitations/${invitation.id}`,
                            )
                          }
                        >
                          Show link
                        </Button>
                      )}
                      {!expired && settings.emailEnabled && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void change({
                              action: "resendInvitation",
                              invitationId: invitation.id,
                            })
                          }
                        >
                          Resend email
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void change({
                            action: "revokeInvitation",
                            invitationId: invitation.id,
                          })
                        }
                      >
                        Revoke invitation
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Access history</h2>
            <p className="mt-2 text-xs text-stone-500">Latest 50 changes</p>
            {settings.events.map((event) => (
              <p
                className="mt-3 break-words text-xs text-stone-500"
                key={event.id}
              >
                {event.action.replace(/([A-Z])/g, " $1")} ·{" "}
                {event.actor === settings.currentSubject
                  ? "You"
                  : (settings.members.find(
                      (member) => member.linkedSubject === event.actor,
                    )?.name ?? "Group account")}{" "}
                · {new Date(event.createdAt).toLocaleString()}
              </p>
            ))}
          </section>
        </fieldset>
      )}
    </main>
  );
}
