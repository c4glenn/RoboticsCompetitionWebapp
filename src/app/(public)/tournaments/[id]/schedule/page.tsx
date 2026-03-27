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
      scores: true,
    },
    orderBy: [asc(matches.roundNumber), asc(matches.scheduledAt)],
  });

  // Split standard vs elimination matches
  const standardByRound = new Map<number, typeof scheduleMatches>();
  const elimByRound = new Map<number | null, typeof scheduleMatches>();
  const unscheduled: typeof scheduleMatches = [];

  for (const m of scheduleMatches) {
    if (m.matchType === "ELIMINATION") {
      const key = m.roundNumber ?? null;
      if (!elimByRound.has(key)) elimByRound.set(key, []);
      elimByRound.get(key)!.push(m);
    } else if (m.roundNumber != null) {
      if (!standardByRound.has(m.roundNumber)) standardByRound.set(m.roundNumber, []);
      standardByRound.get(m.roundNumber)!.push(m);
    } else {
      unscheduled.push(m);
    }
  }

  // Classify standard rounds as active (has pending/in-progress) or played
  const activeRounds: number[] = [];
  const playedRounds: number[] = [];
  for (const [rn, ms] of standardByRound) {
    const hasActive = ms.some((m) => m.status === "PENDING" || m.status === "IN_PROGRESS");
    (hasActive ? activeRounds : playedRounds).push(rn);
  }
  activeRounds.sort((a, b) => a - b);
  playedRounds.sort((a, b) => a - b);

  const nextRound = activeRounds[0] ?? null;
  const subsequentRounds = activeRounds.slice(1);

  // Ordered elim round keys
  const elimRoundKeys = [...elimByRound.keys()].sort((a, b) => (a ?? 999) - (b ?? 999));

  // Final ordered sections: [next, ...subsequent, ...elim, ...played, unscheduled]
  type Section = { title: string; tag?: string; matches: typeof scheduleMatches };
  const sections: Section[] = [];

  if (nextRound != null) {
    sections.push({ title: `Round ${nextRound}`, tag: "Next Round", matches: standardByRound.get(nextRound)! });
  }
  for (const rn of subsequentRounds) {
    sections.push({ title: `Round ${rn}`, matches: standardByRound.get(rn)! });
  }
  for (const rn of elimRoundKeys) {
    const label = rn != null ? `Elimination Round ${rn}` : "Elimination";
    sections.push({ title: label, matches: elimByRound.get(rn)! });
  }
  for (const rn of playedRounds) {
    sections.push({ title: `Round ${rn}`, tag: "Played", matches: standardByRound.get(rn)! });
  }
  if (unscheduled.length > 0) {
    sections.push({ title: "Unscheduled", matches: unscheduled });
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
          {sections.map((section) => (
            <section key={section.title}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {section.title}
                </h2>
                {section.tag && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    {section.tag}
                  </span>
                )}
              </div>
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
                    {section.matches.map((match) => {
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
                                : match.matchTeams.map((mt) => {
                                    const score = match.scores.find((s) => s.teamId === mt.teamId);
                                    return (
                                      <span key={mt.teamId} className="flex items-baseline gap-1.5">
                                        {mt.team.name}
                                        {mt.field && (
                                          <span className="text-xs text-zinc-400">
                                            @ {mt.field.name}
                                          </span>
                                        )}
                                        {score != null && (
                                          <span className="text-xs font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                                            {score.calculatedScore} pts
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {fieldNames || "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            
                            {match.scheduledAt
                              ? new Date(match.scheduledAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: tournament.timezone,
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
