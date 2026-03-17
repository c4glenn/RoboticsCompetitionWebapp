import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, assertDirector, assertDirectorOrCheckIn } from "../init";
import { teams } from "@/db/schema";

export const teamsRouter = router({
  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.query.teams.findMany({
        where: eq(teams.tournamentId, input.tournamentId),
        with: { class: true, teamLead: true },
        orderBy: asc(teams.pitNumber),
      })
    ),

  create: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(1).max(200),
        classId: z.string(),
        pitNumber: z.number().int().positive().optional(),
        schoolOrOrg: z.string().max(200).optional(),
        teamLeadUserId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      const [team] = await ctx.db.insert(teams).values(input).returning();
      return team;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        tournamentId: z.string(),
        name: z.string().min(1).max(200).optional(),
        classId: z.string().optional(),
        pitNumber: z.number().int().positive().nullable().optional(),
        schoolOrOrg: z.string().max(200).nullable().optional(),
        teamLeadUserId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tournamentId, ...data } = input;
      await assertDirectorOrCheckIn(ctx.user.id, tournamentId);

      const existing = await ctx.db.query.teams.findFirst({
        where: eq(teams.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(teams)
        .set(data)
        .where(eq(teams.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      await ctx.db.delete(teams).where(eq(teams.id, input.id));
    }),

  bulkCreate: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        teams: z.array(
          z.object({
            name: z.string().min(1).max(200),
            classId: z.string(),
            pitNumber: z.number().int().positive().optional(),
            schoolOrOrg: z.string().max(200).optional(),
          })
        ).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      const rows = input.teams.map((t) => ({ ...t, tournamentId: input.tournamentId }));
      const inserted = await ctx.db.insert(teams).values(rows).returning();
      return inserted;
    }),

  checkIn: protectedProcedure
    .input(z.object({ id: z.string(), tournamentId: z.string(), checkedIn: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirectorOrCheckIn(ctx.user.id, input.tournamentId);
      const [updated] = await ctx.db
        .update(teams)
        .set({ checkedIn: input.checkedIn })
        .where(eq(teams.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),
});
