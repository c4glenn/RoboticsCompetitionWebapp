import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  publicProcedure,
  assertDirector,
} from "../init";
import {
  tournaments,
  tournamentClasses,
  userTournamentRoles,
} from "@/db/schema";
import type { ScoreAggregation } from "@/db/schema";

export const tournamentsRouter = router({
  /** Public — all tournaments marked as active. */
  listActive: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.tournaments.findMany({
      where: eq(tournaments.isActive, true),
      with: { competitionType: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }),

  /** All tournaments where the current user has any role. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.userTournamentRoles.findMany({
      where: eq(userTournamentRoles.userId, ctx.user.id),
      with: { tournament: { with: { competitionType: true } } },
    });
    return rows.map((r) => r.tournament);
  }),

  /** Public — used for leaderboard / bracket pages. */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, input.id),
        with: {
          competitionType: true,
          classes: true,
          fields: true,
          userRoles: { with: { user: true } },
        },
      });
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND" });
      return tournament;
    }),

  /**
   * Create a new tournament. The creating user is automatically assigned
   * the DIRECTOR role.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        competitionTypeId: z.string(),
        logoUrl: z.string().url().optional(),
        classes: z.array(z.string().min(1)).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { classes, ...tournamentData } = input;

      const [tournament] = await ctx.db
        .insert(tournaments)
        .values(tournamentData)
        .returning();

      // Insert classes
      await ctx.db.insert(tournamentClasses).values(
        classes.map((name) => ({ tournamentId: tournament.id, name }))
      );

      // Auto-assign the creator as DIRECTOR
      await ctx.db.insert(userTournamentRoles).values({
        userId: ctx.user.id,
        tournamentId: tournament.id,
        role: "DIRECTOR",
      });

      return tournament;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        logoUrl: z.string().url().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertDirector(ctx.user.id, id);

      const existing = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(tournaments)
        .set(data)
        .where(eq(tournaments.id, id))
        .returning();
      return updated;
    }),

  addClass: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      const [cls] = await ctx.db
        .insert(tournamentClasses)
        .values({ tournamentId: input.tournamentId, name: input.name })
        .returning();
      return cls;
    }),

  removeClass: protectedProcedure
    .input(z.object({ classId: z.string(), tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      await ctx.db
        .delete(tournamentClasses)
        .where(eq(tournamentClasses.id, input.classId));
    }),

  /** Toggle tournament public visibility. Director only. */
  toggleActive: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.id);
      const [updated] = await ctx.db
        .update(tournaments)
        .set({ isActive: input.isActive })
        .where(eq(tournaments.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Update the per-tournament side labels. Director only. */
  updateMatchSides: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        /** Pass null to disable sides entirely, or an array of label strings. */
        matchSides: z.array(z.string().min(1).max(50)).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.id);
      const [updated] = await ctx.db
        .update(tournaments)
        .set({ matchSides: input.matchSides })
        .where(eq(tournaments.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Update match scheduling settings. Director only. */
  updateSettings: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        matchesPerTeam: z.number().int().min(1).max(20).optional(),
        scoreAggregation: z
          .object({
            method: z.enum(["best_n", "average", "sum"]),
            n: z.number().int().min(1).max(20).optional(),
          })
          .optional(),
        showJudgingScores: z.boolean().optional(),
        practiceSlotDurationMinutes: z.number().int().min(5).max(120).optional(),
        maxFuturePracticeSlots: z.number().int().min(1).max(10).optional(),
        timezone: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertDirector(ctx.user.id, id);

      const existing = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: {
        matchesPerTeam?: number;
        scoreAggregation?: ScoreAggregation;
        showJudgingScores?: boolean;
        practiceSlotDurationMinutes?: number;
        maxFuturePracticeSlots?: number;
        timezone?: string;
      } = {};
      if (data.matchesPerTeam !== undefined)
        updateData.matchesPerTeam = data.matchesPerTeam;
      if (data.scoreAggregation !== undefined)
        updateData.scoreAggregation = data.scoreAggregation;
      if (data.showJudgingScores !== undefined)
        updateData.showJudgingScores = data.showJudgingScores;
      if (data.practiceSlotDurationMinutes !== undefined)
        updateData.practiceSlotDurationMinutes = data.practiceSlotDurationMinutes;
      if (data.maxFuturePracticeSlots !== undefined)
        updateData.maxFuturePracticeSlots = data.maxFuturePracticeSlots;
      if (data.timezone !== undefined)
        updateData.timezone = data.timezone;

      const [updated] = await ctx.db
        .update(tournaments)
        .set(updateData)
        .where(eq(tournaments.id, id))
        .returning();
      return updated;
    }),
});
