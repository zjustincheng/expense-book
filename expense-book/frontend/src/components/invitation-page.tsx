"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
type Invitation = {
  groupId: string;
  groupName: string;
  memberName?: string;
  role: string;
  accepted: boolean;
};

export function InvitationPage({
  invitationId,
  canReview,
}: {
  invitationId: string;
  canReview: boolean;
}) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!canReview) return;
    let active = true;
    api<Invitation>(`/invitations/${invitationId}`)
      .then((result) => {
        if (active) setInvitation(result);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [invitationId, canReview]);
  async function accept() {
    setPending(true);
    setError("");
    try {
      setInvitation(
        await api<Invitation>(`/invitations/${invitationId}/accept`, {}),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to accept invitation.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <a href="/" className="text-sm text-emerald-800">
        Expense Book
      </a>
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-8">
        <h1 className="text-2xl font-semibold">
          {invitation?.accepted
            ? "You’re part of the group."
            : "You’re invited."}
        </h1>
        {!canReview && (
          <p className="my-5 text-stone-600">
            Sign in or create an account using the email address that received
            this invitation. Your email must be verified.
          </p>
        )}
        {canReview && !invitation && !error && (
          <p role="status" className="my-5">
            Checking your invitation…
          </p>
        )}
        {invitation && (
          <>
            <p className="my-5 leading-7 text-stone-600">
              {invitation.accepted ? "You have access to" : "Join"}{" "}
              <strong>{invitation.groupName}</strong> as{" "}
              {invitation.role === "admin" ? "an" : "a"} {invitation.role}.
              {invitation.memberName &&
                ` Your account will be linked to ${invitation.memberName}. Existing shares and balances are preserved.`}
            </p>
            {invitation.accepted ? (
              <Button asChild>
                <a href={`/?group=${invitation.groupId}`}>Open group</a>
              </Button>
            ) : (
              <Button onClick={() => void accept()} disabled={pending}>
                {pending ? "Joining…" : "Accept invitation"}
              </Button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="my-5 text-sm text-red-700">
            {error}
          </p>
        )}
        {(!canReview || error) && (
          <Button asChild variant="outline">
            <a
              href={`/auth/login?returnTo=${encodeURIComponent(`/invitations/${invitationId}`)}`}
            >
              Sign in with invited email
            </a>
          </Button>
        )}
      </section>
    </main>
  );
}
