import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { getLeaderboard } from "@/db/queries/leaderboard";
import { LeaderboardStream } from "@/components/leaderboard/LeaderboardStream";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LeaderboardPage({ params }: Props) {
  const { id: tournamentId } = await params;

  const tournament = await db.query.tournaments.findFirst({
    where: eq(tournaments.id, tournamentId),
    with: {
      competitionType: true,
      classes: true,
    },
  });

  if (!tournament) notFound();

  const initialRows = await getLeaderboard(tournamentId);
  const showJudging = !!tournament.competitionType?.judgingFormSchema;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
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
      />
    </div>
  );
}

// Revalidate every 60s so the SSR snapshot stays reasonably fresh
// (the SSE stream handles sub-second live updates on the client)
export const revalidate = 60;
