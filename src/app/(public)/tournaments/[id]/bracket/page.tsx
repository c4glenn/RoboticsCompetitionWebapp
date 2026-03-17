import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments, matches } from "@/db/schema";
import { BracketStream } from "@/components/bracket/BracketStream";

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
          className="text-sm text-zinc-500 underline-offset-4 hover:underline hover:text-violet-700 dark:hover:text-violet-400"
        >
          Leaderboard →
        </Link>
      </div>

      <BracketStream
        tournamentId={tournamentId}
        initialMatches={bracketMatches}
      />
    </div>
  );
}
