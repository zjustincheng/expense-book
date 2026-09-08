/** Archived people remain eligible for payments that settle existing balances. */
export function eligibleMemberIds(
  kind: string,
  members: { id: string; archivedAt: Date | null }[],
): string[] {
  const closingActivity = ["transfer", "settlement", "adjustment"].includes(
    kind,
  );
  return members
    .filter((member) => closingActivity || member.archivedAt === null)
    .map((member) => member.id);
}
