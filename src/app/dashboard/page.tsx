import Link from "next/link";
import { auth } from "@/server/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { userTournamentRoles } from "@/db/schema";
import { redirect } from "next/navigation";
import { CompetitionTypesClient } from "./competition-types/CompetitionTypesClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rows = await db.query.userTournamentRoles.findMany({
    where: eq(userTournamentRoles.userId, session.user.id),
    with: { tournament: { with: { competitionType: true } } },
  });

  const tournaments = rows.map((r) => ({ ...r.tournament, role: r.role }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          My Tournaments
        </h1>
        <Link
          href="/dashboard/tournaments/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">No tournaments yet.</p>
          <Link
            href="/dashboard/tournaments/new"
            className="mt-2 inline-block text-sm font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Create your first tournament
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Link href={`/dashboard/tournaments/${t.id}`} className="group block">
                <p className="font-semibold text-zinc-900 group-hover:underline underline-offset-4 dark:text-zinc-50">
                  {t.name}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {t.competitionType?.name}
                </p>
              </Link>
              <span className="mt-3 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {t.role}
              </span>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                {[
                  { label: "Teams", path: "teams" },
                  { label: "Matches", path: "matches" },
                  { label: "Fields", path: "fields" },
                  ...(t.role === "DIRECTOR"
                    ? [
                        { label: "Settings", path: "settings" },
                        { label: "Volunteers", path: "volunteers" },
                      ]
                    : []),
                ].map(({ label, path }) => (
                  <Link
                    key={path}
                    href={`/dashboard/tournaments/${t.id}/${path}`}
                    className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12">
        <CompetitionTypesClient currentUserId={session.user.id} />
      </div>
    </div>
  );
}
