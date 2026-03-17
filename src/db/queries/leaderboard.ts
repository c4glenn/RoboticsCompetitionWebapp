import { sql, eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import type { DB } from "@/db";
import {
  teams,
  tournamentClasses,
  matches,
  scores,
  judgingScores,
  tournaments,
} from "@/db/schema";
import type { ScoreAggregation } from "@/db/schema";

export interface LeaderboardRow {
  teamId: string;
  teamName: string;
  pitNumber: number | null;
  schoolOrOrg: string | null;
  classId: string | null;
  className: string | null;
  matchScore: number;
  judgingScore: number;
  totalScore: number;
  matchesPlayed: number;
}

/**
 * Apply the scoreAggregation rule to a list of match scores for one team.
 * Scores are expected as raw numbers from the DB.
 */
function aggregateScores(
  rawScores: number[],
  aggregation: ScoreAggregation
): number {
  if (rawScores.length === 0) return 0;
  const { method, n = 1 } = aggregation;
  const sorted = [...rawScores].sort((a, b) => b - a);

  if (method === "best_n") {
    return sorted.slice(0, n).reduce((sum, s) => sum + s, 0);
  }
  if (method === "average") {
    return Math.round(rawScores.reduce((sum, s) => sum + s, 0) / rawScores.length);
  }
  // sum
  return rawScores.reduce((sum, s) => sum + s, 0);
}

/**
 * Aggregate scores for all teams in a tournament.
 * Respects the tournament's scoreAggregation setting for match scores.
 * Judging scores are always summed.
 * Results ordered by totalScore descending.
 *
 * Accepts an optional db instance so tests can inject their own connection.
 */
export async function getLeaderboard(
  tournamentId: string,
  dbInstance: DB = defaultDb
): Promise<LeaderboardRow[]> {
  // Fetch tournament config
  const tournament = await dbInstance.query.tournaments.findFirst({
    where: eq(tournaments.id, tournamentId),
    columns: { scoreAggregation: true },
  });

  const aggregation: ScoreAggregation = tournament?.scoreAggregation ?? {
    method: "best_n",
    n: 2,
  };

  // Fetch all match scores for this tournament (one row per team per match)
  const matchScoreRows = await dbInstance
    .select({
      teamId: scores.teamId,
      calculatedScore: scores.calculatedScore,
    })
    .from(scores)
    .innerJoin(
      matches,
      and(eq(matches.id, scores.matchId), eq(matches.tournamentId, tournamentId))
    );

  // Group match scores by teamId
  const matchScoresByTeam = new Map<string, number[]>();
  for (const row of matchScoreRows) {
    const existing = matchScoresByTeam.get(row.teamId) ?? [];
    existing.push(row.calculatedScore ?? 0);
    matchScoresByTeam.set(row.teamId, existing);
  }

  // Subquery: total judging score per team for this tournament (always summed)
  const judgingTotals = await dbInstance
    .select({
      teamId: judgingScores.teamId,
      total: sql<number>`COALESCE(SUM(${judgingScores.calculatedScore}), 0)::int`.as("total"),
    })
    .from(judgingScores)
    .where(eq(judgingScores.tournamentId, tournamentId))
    .groupBy(judgingScores.teamId);

  const judgingByTeam = new Map(judgingTotals.map((r) => [r.teamId, r.total]));

  // Fetch all teams with class info
  const teamRows = await dbInstance
    .select({
      teamId: teams.id,
      teamName: teams.name,
      pitNumber: teams.pitNumber,
      schoolOrOrg: teams.schoolOrOrg,
      classId: tournamentClasses.id,
      className: tournamentClasses.name,
    })
    .from(teams)
    .leftJoin(tournamentClasses, eq(tournamentClasses.id, teams.classId))
    .where(eq(teams.tournamentId, tournamentId));

  // Assemble rows
  const rows: LeaderboardRow[] = teamRows.map((t) => {
    const rawScores = matchScoresByTeam.get(t.teamId) ?? [];
    const matchScore = aggregateScores(rawScores, aggregation);
    const judgingScore = judgingByTeam.get(t.teamId) ?? 0;
    return {
      ...t,
      matchScore,
      judgingScore,
      totalScore: matchScore + judgingScore,
      matchesPlayed: rawScores.length,
    };
  });

  return rows.sort((a, b) => b.totalScore - a.totalScore);
}
