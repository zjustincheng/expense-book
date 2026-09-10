import { HistoricalReports } from "@/components/historical-reports";

export default async function HistoricalPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <HistoricalReports groupId={groupId} />;
}
