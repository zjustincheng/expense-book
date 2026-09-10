import { MemberStatement } from "@/components/member-statement";
export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string; memberId: string }>;
}) {
  return <MemberStatement {...await params} />;
}
