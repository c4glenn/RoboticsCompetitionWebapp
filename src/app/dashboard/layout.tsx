import Link from "next/link";
import { auth, signOut } from "@/server/auth";
import { UserDropdown } from "./UserDropdown";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  const signOutAction = session?.user
    ? async () => {
        "use server";
        await signOut();
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="text-sm font-bold tracking-tight text-violet-600 dark:text-violet-400"
          >
            Aeonix
          </Link>
          <UserDropdown
            userName={session?.user?.name ?? session?.user?.email ?? null}
            signOutAction={signOutAction}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
