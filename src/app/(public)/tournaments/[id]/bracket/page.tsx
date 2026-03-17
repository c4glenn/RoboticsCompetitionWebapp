import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments, matches } from "@/db/schema";
import { BracketVisualization } from "@/components/bracket/BracketVisualization";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BracketPage({ params }: Props) {
  const { id: tournamentId } = await params;

  const tournament = await db.query.tournaments.findFirst({
    where: eq(tournaments.id, tournamentId),
  });

  if (!tournament) notFound();

  const elimMatches = await db.query.matches.findMany({
    where: eq(matches.tournamentId, tournamentId),
    with: {
      matchTeams: { with: { team: true } },
      scores: true,
    },
  });

  const bracketMatches = elimMatches.filter((m) => m.matchType === "ELIMINATION");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            {tournament.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Elimination Bracket</p>
        </div>
        <Link
          href={`/tournaments/${tournamentId}/leaderboard`}
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          Leaderboard →
        </Link>
      </div>

      {bracketMatches.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-400">No elimination bracket has been generated yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <BracketVisualization matches={bracketMatches} />
        </div>
      )}
    </div>
  );
}

// Revalidate every 30s so bracket reflects recent score submissions
export const revalidate = 30;
