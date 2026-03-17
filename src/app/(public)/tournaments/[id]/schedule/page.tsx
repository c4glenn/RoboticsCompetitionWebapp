import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { tournaments, matches } from "@/db/schema";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SchedulePage({ params }: Props) {
  const { id: tournamentId } = await params;

  const tournament = await db.query.tournaments.findFirst({
    where: eq(tournaments.id, tournamentId),
  });

  if (!tournament) notFound();

  const scheduleMatches = await db.query.matches.findMany({
    where: eq(matches.tournamentId, tournamentId),
    with: {
      matchTeams: { with: { team: true, field: true } },
    },
    orderBy: [asc(matches.roundNumber), asc(matches.scheduledAt)],
  });

  // Group by round number (null rounds go last as "Unscheduled")
  const grouped = new Map<string, typeof scheduleMatches>();
  for (const match of scheduleMatches) {
    const key =
      match.matchType === "ELIMINATION"
        ? `Elimination Round ${match.roundNumber ?? "?"}`
        : match.roundNumber != null
          ? `Round ${match.roundNumber}`
          : "Unscheduled";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(match);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Back
        </Link>
        <h1 className="text-3xl font-bold text-violet-700 dark:text-violet-500">
          {tournament.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Match Schedule</p>
      </div>

      {scheduleMatches.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No matches scheduled yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Array.from(grouped.entries()).map(([round, roundMatches]) => (
            <section key={round}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {round}
              </h2>
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        #
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Teams
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Field
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {roundMatches.map((match) => {
                      const fieldNames = [
                        ...new Set(
                          match.matchTeams
                            .map((mt) => mt.field?.name)
                            .filter(Boolean)
                        ),
                      ].join(" / ");
                      return (
                        <tr key={match.id}>
                          <td className="px-4 py-3 tabular-nums text-zinc-400">
                            {match.matchNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                            <div className="flex flex-col gap-0.5">
                              {match.matchTeams.length === 0
                                ? "—"
                                : match.matchTeams.map((mt) => (
                                    <span key={mt.teamId}>
                                      {mt.team.name}
                                      {mt.field && (
                                        <span className="ml-1 text-xs text-zinc-400">
                                          @ {mt.field.name}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {fieldNames || "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {match.scheduledAt
                              ? match.scheduledAt.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={match.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    IN_PROGRESS:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    COMPLETE:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    CANCELLED:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels: Record<string, string> = {
    PENDING: "Pending",
    IN_PROGRESS: "In Progress",
    COMPLETE: "Complete",
    CANCELLED: "Cancelled",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.PENDING}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
