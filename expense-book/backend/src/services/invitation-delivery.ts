import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export type InvitationDelivery = {
  appUrl: string;
  send?: (message: {
    email: string;
    groupName: string;
    url: string;
  }) => Promise<void>;
};

export function createInvitationDelivery(
  env: NodeJS.ProcessEnv,
): InvitationDelivery {
  const appUrl =
    env.APP_URL ??
    (env.AUTH_MODE === "development" ? "http://localhost:3000" : "");
  if (!appUrl) throw new Error("APP_URL is required for invitation links.");
  const origin = new URL(appUrl);
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error("APP_URL must be a website origin.");
  if (env.AUTH_MODE !== "development" && origin.protocol !== "https:")
    throw new Error("Production invitation links require HTTPS.");
  if (!env.INVITATION_FROM_EMAIL) return { appUrl: origin.origin };
  const client = new SESv2Client({ region: env.AWS_REGION, maxAttempts: 1 });
  return {
    appUrl: origin.origin,
    async send({ email, groupName, url }) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: env.INVITATION_FROM_EMAIL,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: {
                Data: "Your Expense Book invitation",
                Charset: "UTF-8",
              },
              Body: {
                Text: {
                  Charset: "UTF-8",
                  Data: `You have been invited to ${groupName} in Expense Book.\n\nSign in using this email address to review and accept your invitation:\n${url}\n\nThe invitation expires after seven days. Accepting it grants access to the group's financial activity.`,
                },
              },
            },
          },
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
    },
  };
}
