import { cookies } from "next/headers";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export function cognitoConfig() {
  const {
    COGNITO_DOMAIN: domain,
    COGNITO_CLIENT_ID: clientId,
    APP_URL: appUrl,
  } = process.env;
  if (!domain || !clientId || !appUrl)
    throw new Error("Cognito sign-in is not configured.");
  return { domain, clientId, appUrl, redirectUri: `${appUrl}/auth/callback` };
}
export async function isSignedIn() {
  return Boolean((await cookies()).get("access_token")?.value);
}
