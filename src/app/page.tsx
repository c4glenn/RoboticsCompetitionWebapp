import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { ThemeToggle } from "@/components/theme-toggle";

export const revalidate = 60;

export default async function Home() {
  const [session, activeTournaments] = await Promise.all([
    auth(),
    db.query.tournaments.findMany({
      where: eq(tournaments.isActive, true),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Robotics Manager
          </span>
          <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <ThemeToggle />
            {session?.user ? (
              <Link
                href="/dashboard"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Active Tournaments
        </h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          Select a tournament to view the scoreboard, schedule, or apply to
          volunteer.
        </p>

        {activeTournaments.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No active tournaments at this time.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {activeTournaments.map((tournament) => (
              <div
                key={tournament.id}
                className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {tournament.name}
                </h2>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/tournaments/${tournament.id}/leaderboard`}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    See Scoreboard
                  </Link>
                  <Link
                    href={`/tournaments/${tournament.id}/schedule`}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    See Schedule
                  </Link>
                  <Link
                    href={`/tournaments/${tournament.id}/apply`}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Apply to Volunteer
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
