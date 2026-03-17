import Link from "next/link";
import { auth, signOut } from "@/server/auth";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

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
          <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span>{session.user.name ?? session.user.email}</span>
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
