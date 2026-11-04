import { Dashboard } from "@/components/dashboard";
import { isAuthConfigured, isSignedIn } from "@/lib/auth";
export default async function Page() {
  return (
    <Dashboard
      authConfigured={isAuthConfigured()}
      signedIn={await isSignedIn()}
    />
  );
}
