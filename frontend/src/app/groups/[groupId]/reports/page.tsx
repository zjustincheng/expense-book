import { ReportPage } from "@/components/report-page";

export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <ReportPage groupId={groupId} />;
}
