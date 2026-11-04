import { InvitationPage } from "@/components/invitation-page";
import { isAuthConfigured, isSignedIn } from "@/lib/auth";
export default async function Page({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return (
    <InvitationPage
      invitationId={invitationId}
      canReview={!isAuthConfigured() || (await isSignedIn())}
    />
  );
}
