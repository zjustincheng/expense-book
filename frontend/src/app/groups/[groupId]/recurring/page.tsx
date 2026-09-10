import { RecurringPage } from "@/components/recurring-page";

export default async function RecurringRoute({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <RecurringPage groupId={groupId} />;
}
