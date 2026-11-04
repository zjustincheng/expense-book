import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo = "/" } = await searchParams;
  return <LoginForm returnTo={returnTo} />;
}
