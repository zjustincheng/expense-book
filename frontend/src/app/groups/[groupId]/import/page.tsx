import { ImportPage } from "@/components/import-page";

export default async function ImportRoute({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <ImportPage groupId={groupId} />;
}
