import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  scores,
  inspections,
  judgingScores,
  matches,
  tournaments,
  matchTeams,
} from "@/db/schema";
import { hasRole } from "@/db/queries/auth";
import { calculateScore } from "@/server/scoring/calculator";

// ── helpers ────────────────────────────────────────────────────────────────────

async function assertReferee(userId: string, tournamentId: string) {
  const ok = await hasRole(userId, tournamentId, "REFEREE", "DIRECTOR");
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only referees or directors can submit match scores.",
    });
  }
}

async function assertInspector(userId: string, tournamentId: string) {
  const ok = await hasRole(userId, tournamentId, "REFEREE", "DIRECTOR");
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only referees or directors can submit inspections.",
    });
  }
}

async function assertJudge(userId: string, tournamentId: string) {
  const ok = await hasRole(userId, tournamentId, "JUDGE", "DIRECTOR");
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only judges or directors can submit judging scores.",
    });
  }
}

// ── router ─────────────────────────────────────────────────────────────────────

export const scoringRouter = router({
  /**
   * Return all matches for a tournament that the referee can score.
   * Includes team assignments and any existing scores.
   */
  listMatches: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ok = await hasRole(
        ctx.user.id,
        input.tournamentId,
        "REFEREE",
        "DIRECTOR"
      );
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.db.query.matches.findMany({
        where: eq(matches.tournamentId, input.tournamentId),
        with: {
          matchTeams: { with: { team: true } },
          scores: true,
          field: true,
        },
        orderBy: (m, { asc }) => [asc(m.scheduledAt)],
      });
    }),

  /**
   * Submit a score for one team in a match.
   * Prevents duplicates — if a score already exists for (matchId, teamId)
   * this throws CONFLICT before hitting the DB unique constraint.
   */
  submitMatchScore: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        teamId: z.string(),
        tournamentId: z.string(),
        formData: z.record(z.string(), z.unknown()),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertReferee(ctx.user.id, input.tournamentId);

      // Verify the team is actually in this match
      const assignment = await ctx.db.query.matchTeams.findFirst({
        where: and(
          eq(matchTeams.matchId, input.matchId),
          eq(matchTeams.teamId, input.teamId)
        ),
      });
      if (!assignment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Team is not assigned to this match.",
        });
      }

      // Duplicate guard
      const existing = await ctx.db.query.scores.findFirst({
        where: and(
          eq(scores.matchId, input.matchId),
          eq(scores.teamId, input.teamId)
        ),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A score has already been submitted for this team in this match.",
        });
      }

      // Fetch scoring logic via tournament → competition type
      const tournament = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, input.tournamentId),
        with: { competitionType: true },
      });
      if (!tournament?.competitionType) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tournament or competition type not found." });
      }

      const calculatedScore = calculateScore(
        input.formData,
        tournament.competitionType.scoringLogic
      );

      const [score] = await ctx.db
        .insert(scores)
        .values({
          matchId: input.matchId,
          teamId: input.teamId,
          refereeUserId: ctx.user.id,
          formData: input.formData,
          calculatedScore,
          notes: input.notes,
        })
        .returning();

      return score;
    }),

  /** Get all scores for a specific match. */
  getMatchScores: protectedProcedure
    .input(z.object({ matchId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.scores.findMany({
        where: eq(scores.matchId, input.matchId),
        with: { team: true, referee: true },
      });
    }),

  // ── Inspections ──────────────────────────────────────────────────────────────

  /** Submit (or replace) an inspection result for a team. */
  submitInspection: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        tournamentId: z.string(),
        formData: z.record(z.string(), z.unknown()),
        passed: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertInspector(ctx.user.id, input.tournamentId);

      const [inspection] = await ctx.db
        .insert(inspections)
        .values({
          teamId: input.teamId,
          tournamentId: input.tournamentId,
          inspectorUserId: ctx.user.id,
          formData: input.formData,
          passed: input.passed,
        })
        .returning();

      return inspection;
    }),

  /** Get all inspections for a team in a tournament. */
  getTeamInspections: protectedProcedure
    .input(z.object({ teamId: z.string(), tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.inspections.findMany({
        where: and(
          eq(inspections.teamId, input.teamId),
          eq(inspections.tournamentId, input.tournamentId)
        ),
        with: { inspector: true },
        orderBy: (i, { desc }) => [desc(i.completedAt)],
      });
    }),

  // ── Judging ──────────────────────────────────────────────────────────────────

  /**
   * Submit a judging score for a team.
   * Gated on the competition type having a judgingFormSchema defined.
   */
  submitJudgingScore: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        tournamentId: z.string(),
        formData: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertJudge(ctx.user.id, input.tournamentId);

      const tournament = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, input.tournamentId),
        with: { competitionType: true },
      });
      if (!tournament?.competitionType) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tournament or competition type not found." });
      }
      if (!tournament.competitionType.judgingFormSchema) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Judging is not configured for this competition type.",
        });
      }

      // Judging uses the same scoringLogic as match scoring
      const calculatedScore = calculateScore(
        input.formData,
        tournament.competitionType.scoringLogic
      );

      const [judging] = await ctx.db
        .insert(judgingScores)
        .values({
          teamId: input.teamId,
          tournamentId: input.tournamentId,
          judgeUserId: ctx.user.id,
          formData: input.formData,
          calculatedScore,
        })
        .returning();

      return judging;
    }),

  /** Get all judging scores for a team in a tournament. */
  getTeamJudgingScores: protectedProcedure
    .input(z.object({ teamId: z.string(), tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.judgingScores.findMany({
        where: and(
          eq(judgingScores.teamId, input.teamId),
          eq(judgingScores.tournamentId, input.tournamentId)
        ),
        with: { judge: true },
        orderBy: (j, { desc }) => [desc(j.submittedAt)],
      });
    }),
});
