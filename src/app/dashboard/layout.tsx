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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Robotics Manager
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
