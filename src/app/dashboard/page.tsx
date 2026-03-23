import Link from "next/link";
import { auth } from "@/server/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { userTournamentRoles, tournaments } from "@/db/schema";

export default async function DashboardPage() {
  const [session, activeTournaments] = await Promise.all([
    auth(),
    db.query.tournaments.findMany({
      where: eq(tournaments.isActive, true),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  const myTournamentRows = session?.user?.id
    ? await db.query.userTournamentRoles.findMany({
        where: eq(userTournamentRoles.userId, session.user.id),
        with: { tournament: { with: { competitionType: true } } },
      })
    : null;

  const myTournaments = myTournamentRows?.map((r) => ({
    ...r.tournament,
    role: r.role,
  }));

  return (
    <div className="space-y-16">
      {/* ── Active Tournaments ──────────────────────────────────── */}
      <section>
        <h2 className="mb-1 border-l-2 border-violet-400 pl-3 text-xl font-semibold text-zinc-900 dark:border-violet-600 dark:text-zinc-50">
          Active Tournaments
        </h2>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
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
                <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {tournament.name}
                </h3>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/tournaments/${tournament.id}/leaderboard`}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-700 transition-colors hover:border-violet-300 hover:text-violet-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-700 dark:hover:text-violet-400"
                  >
                    See Scoreboard
                  </Link>
                  <Link
                    href={`/tournaments/${tournament.id}/schedule`}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-700 transition-colors hover:border-violet-300 hover:text-violet-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-700 dark:hover:text-violet-400"
                  >
                    See Schedule
                  </Link>
                  <Link
                    href={`/tournaments/${tournament.id}/practice`}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-700 transition-colors hover:border-violet-300 hover:text-violet-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-700 dark:hover:text-violet-400"
                  >
                    See Practice Table Slots
                  </Link>

                  <Link
                    href={`/tournaments/${tournament.id}/apply`}
                    className="rounded-lg bg-violet-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-violet-600"
                  >
                    Apply to Volunteer
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── My Tournaments ──────────────────────────────────────── */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="border-l-2 border-violet-400 pl-3 text-xl font-semibold text-zinc-900 dark:border-violet-600 dark:text-zinc-50">
            My Tournaments
          </h2>
          
        </div>

        {!session?.user ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Sign in to see your tournaments.
            </p>
            <Link
              href="/login"
              className="mt-2 inline-block text-sm font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
            >
              Sign in
            </Link>
          </div>
        ) : myTournaments!.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500">No tournaments yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myTournaments!.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Link
                  href={`/dashboard/tournaments/${t.id}`}
                  className="group block"
                >
                  <p className="font-semibold text-zinc-900 underline-offset-4 transition-colors group-hover:text-violet-700 dark:text-zinc-50 dark:group-hover:text-violet-400">
                    {t.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t.competitionType?.name}
                  </p>
                </Link>
                <span className="mt-3 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                  {t.role}
                </span>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  {[
                    { label: "Practice Fields", path: "practice-fields" },
                    ...(t.role === "DIRECTOR"
                      ? [
                          { label: "Teams", path: "teams" },
                          { label: "Matches", path: "matches" },
                          { label: "Fields", path: "fields" },
                          { label: "Settings", path: "settings" },
                          { label: "Volunteers", path: "volunteers" },
                        ]
                      : []),
                  ].map(({ label, path }) => (
                    <Link
                      key={path}
                      href={`/dashboard/tournaments/${t.id}/${path}`}
                      className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-violet-100 hover:text-violet-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-violet-900/40 dark:hover:text-violet-400"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
