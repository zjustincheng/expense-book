import { GroupSettings } from "@/components/group-settings";
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupSettings groupId={groupId} />;
}
