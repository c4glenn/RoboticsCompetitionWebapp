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
      } = {};
      if (data.matchesPerTeam !== undefined)
        updateData.matchesPerTeam = data.matchesPerTeam;
      if (data.scoreAggregation !== undefined)
        updateData.scoreAggregation = data.scoreAggregation;

      const [updated] = await ctx.db
        .update(tournaments)
        .set(updateData)
        .where(eq(tournaments.id, id))
        .returning();
      return updated;
    }),
});
