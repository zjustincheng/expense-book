import { Dashboard } from "@/components/dashboard";
import { isSignedIn } from "@/lib/auth";
export default async function Page() {
  return (
    <Dashboard
      authConfigured={Boolean(process.env.COGNITO_CLIENT_ID)}
      signedIn={await isSignedIn()}
    />
  );
}
