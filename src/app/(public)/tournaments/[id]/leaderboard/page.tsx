import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { tournaments, matches } from "@/db/schema";
import { getLeaderboard } from "@/db/queries/leaderboard";
import { LeaderboardStream } from "@/components/leaderboard/LeaderboardStream";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LeaderboardPage({ params }: Props) {
  const { id: tournamentId } = await params;

  const [tournament, initialRows, eliminationMatch] = await Promise.all([
    db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
      with: {
        competitionType: true,
        classes: true,
      },
    }),
    getLeaderboard(tournamentId),
    db.query.matches.findFirst({
      where: and(
        eq(matches.tournamentId, tournamentId),
        eq(matches.matchType, "ELIMINATION")
      ),
      columns: { id: true },
    }),
  ]);

  if (!tournament) notFound();

  const showJudging =
    tournament.showJudgingScores &&
    !!tournament.competitionType?.judgingFormSchema;

  const scoreAggregation = tournament.scoreAggregation ?? { method: "best_n", n: 2 };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {tournament.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Live Leaderboard</p>
      </div>

      <LeaderboardStream
        tournamentId={tournamentId}
        initialRows={initialRows}
        classes={tournament.classes}
        showJudging={showJudging}
        matchesPerTeam={tournament.matchesPerTeam}
        scoreAggregation={scoreAggregation}
        hasElimination={!!eliminationMatch}
      />
    </div>
  );
}

// Revalidate every 60s so the SSR snapshot stays reasonably fresh
// (the SSE stream handles sub-second live updates on the client)
export const revalidate = 60;
