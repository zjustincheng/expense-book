import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Expense Book — Shared money, made clear",
  description:
    "Track shared income, expenses, and the story behind every balance.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
