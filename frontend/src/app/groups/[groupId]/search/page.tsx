import { redirect } from "next/navigation";
export default async function SearchRoute({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(`/groups/${encodeURIComponent(groupId)}/reports`);
}
