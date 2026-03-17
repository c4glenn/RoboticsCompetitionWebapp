import { sql, eq, and, desc, asc } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import type { DB } from "@/db";
import {
  teams,
  tournamentClasses,
  matches,
  matchTeams,
  scores,
  judgingScores,
  tournaments,
} from "@/db/schema";
import type { ScoreAggregation } from "@/db/schema";

export interface LastMatchTeam {
  teamId: string;
  teamName: string;
  side: string | null;
  score: number | null;
}

export interface LastMatch {
  matchId: string;
  matchNumber: number | null;
  roundNumber: number | null;
  completedAt: string;
  teams: LastMatchTeam[];
}

export interface LiveMatchTeam {
  teamId: string;
  teamName: string;
  side: string | null;
  fieldName: string | null;
}

export interface LiveMatch {
  matchId: string;
  matchNumber: number | null;
  roundNumber: number | null;
  teams: LiveMatchTeam[];
}

export interface LeaderboardRow {
  teamId: string;
  teamName: string;
  pitNumber: number | null;
  logoUrl: string | null;
  schoolOrOrg: string | null;
  classId: string | null;
  className: string | null;
  /** Individual match scores ordered by matchNumber, length = matchesPerTeam, null = not yet played. */
  individualScores: (number | null)[];
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
    columns: { scoreAggregation: true, matchesPerTeam: true },
  });

  const aggregation: ScoreAggregation = tournament?.scoreAggregation ?? {
    method: "best_n",
    n: 2,
  };
  const matchesPerTeam = tournament?.matchesPerTeam ?? 3;

  // Fetch all match scores for this tournament with match number for ordering
  const matchScoreRows = await dbInstance
    .select({
      teamId: scores.teamId,
      matchNumber: matches.matchNumber,
      calculatedScore: scores.calculatedScore,
    })
    .from(scores)
    .innerJoin(
      matches,
      and(
        eq(matches.id, scores.matchId),
        eq(matches.tournamentId, tournamentId),
        eq(matches.matchType, "STANDARD")
      )
    );

  // Group match scores by teamId, keeping matchNumber for ordering
  const matchScoresByTeam = new Map<string, { matchNumber: number | null; score: number }[]>();
  for (const row of matchScoreRows) {
    const existing = matchScoresByTeam.get(row.teamId) ?? [];
    existing.push({ matchNumber: row.matchNumber, score: row.calculatedScore ?? 0 });
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

  // Fetch all teams with class info and logo
  const teamRows = await dbInstance
    .select({
      teamId: teams.id,
      teamName: teams.name,
      pitNumber: teams.pitNumber,
      logoUrl: teams.logoUrl,
      schoolOrOrg: teams.schoolOrOrg,
      classId: tournamentClasses.id,
      className: tournamentClasses.name,
    })
    .from(teams)
    .leftJoin(tournamentClasses, eq(tournamentClasses.id, teams.classId))
    .where(eq(teams.tournamentId, tournamentId));

  // Assemble rows
  const rows: LeaderboardRow[] = teamRows.map((t) => {
    const pairs = (matchScoresByTeam.get(t.teamId) ?? []).sort(
      (a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0)
    );
    const rawScores = pairs.map((p) => p.score);
    const matchScore = aggregateScores(rawScores, aggregation);
    const judgingScore = judgingByTeam.get(t.teamId) ?? 0;

    // Build per-slot individual scores (null = not yet played)
    const individualScores: (number | null)[] = Array.from(
      { length: matchesPerTeam },
      (_, i) => pairs[i]?.score ?? null
    );

    return {
      ...t,
      individualScores,
      matchScore,
      judgingScore,
      totalScore: matchScore + judgingScore,
      matchesPlayed: rawScores.length,
    };
  });

  return rows.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Returns the most recently completed match for a tournament, with team names and scores.
 * Returns null if no completed match exists.
 */
export async function getLastCompletedMatch(
  tournamentId: string,
  dbInstance: DB = defaultDb
): Promise<LastMatch | null> {
  const match = await dbInstance.query.matches.findFirst({
    where: and(
      eq(matches.tournamentId, tournamentId),
      eq(matches.status, "COMPLETE")
    ),
    orderBy: [desc(matches.completedAt)],
    with: {
      matchTeams: { with: { team: true } },
    },
  });

  if (!match || !match.completedAt) return null;

  // Fetch scores for this match
  const scoreRows = await dbInstance
    .select({ teamId: scores.teamId, calculatedScore: scores.calculatedScore })
    .from(scores)
    .where(eq(scores.matchId, match.id));

  const scoreByTeam = new Map(scoreRows.map((s) => [s.teamId, s.calculatedScore]));

  return {
    matchId: match.id,
    matchNumber: match.matchNumber,
    roundNumber: match.roundNumber,
    completedAt: match.completedAt.toISOString(),
    teams: match.matchTeams.map((mt) => ({
      teamId: mt.teamId,
      teamName: mt.team.name,
      side: mt.side,
      score: scoreByTeam.get(mt.teamId) ?? null,
    })),
  };
}

function matchToLive(match: {
  id: string;
  matchNumber: number | null;
  roundNumber: number | null;
  matchTeams: { teamId: string; side: string | null; team: { name: string }; field: { name: string } | null }[];
}): LiveMatch {
  return {
    matchId: match.id,
    matchNumber: match.matchNumber,
    roundNumber: match.roundNumber,
    teams: match.matchTeams.map((mt) => ({
      teamId: mt.teamId,
      teamName: mt.team.name,
      side: mt.side,
      fieldName: mt.field?.name ?? null,
    })),
  };
}

/** All currently IN_PROGRESS matches for a tournament. */
export async function getInProgressMatches(
  tournamentId: string,
  dbInstance: DB = defaultDb
): Promise<LiveMatch[]> {
  const rows = await dbInstance.query.matches.findMany({
    where: and(
      eq(matches.tournamentId, tournamentId),
      eq(matches.status, "IN_PROGRESS")
    ),
    orderBy: [asc(matches.matchNumber), asc(matches.scheduledAt)],
    with: { matchTeams: { with: { team: true, field: true } } },
  });
  return rows.map(matchToLive);
}

/**
 * The next PENDING match (lowest matchNumber, then scheduledAt).
 * If `maxAheadMs` is provided, matches with a scheduledAt further than
 * that many milliseconds in the future are suppressed (returns null).
 * Matches with no scheduledAt are always returned regardless of the cutoff.
 */
export async function getNextQueuedMatch(
  tournamentId: string,
  dbInstance: DB = defaultDb,
  options?: { maxAheadMs?: number }
): Promise<LiveMatch | null> {
  const match = await dbInstance.query.matches.findFirst({
    where: and(
      eq(matches.tournamentId, tournamentId),
      eq(matches.status, "PENDING")
    ),
    orderBy: [asc(matches.matchNumber), asc(matches.scheduledAt)],
    with: { matchTeams: { with: { team: true, field: true } } },
  });

  if (!match) return null;

  if (options?.maxAheadMs != null && match.scheduledAt != null) {
    const cutoff = Date.now() + options.maxAheadMs;
    if (match.scheduledAt.getTime() > cutoff) return null;
  }

  return matchToLive(match);
}
