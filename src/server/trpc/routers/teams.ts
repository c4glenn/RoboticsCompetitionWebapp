import { z } from "zod";
import { eq, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, assertDirector, assertDirectorOrCheckIn } from "../init";
import { teams, users } from "@/db/schema";

export const teamsRouter = router({
  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.teams.findMany({
        where: eq(teams.tournamentId, input.tournamentId),
        with: {
          class: true,
          teamLead: true,
          inspections: {
            orderBy: (i, { desc }) => [desc(i.completedAt)],
            limit: 1,
          },
        },
        orderBy: asc(teams.pitNumber),
      });

      // For teams with a teamLeadEmail but no linked user, look up if an account exists
      const unlinkdEmails = rows
        .filter((r) => r.teamLeadEmail && !r.teamLeadUserId)
        .map((r) => r.teamLeadEmail!);

      const emailUserMap: Record<string, string> = {};
      if (unlinkdEmails.length > 0) {
        const matched = await ctx.db.query.users.findMany({
          where: inArray(users.email, unlinkdEmails),
          columns: { email: true, name: true },
        });
        for (const u of matched) {
          if (u.email) emailUserMap[u.email] = u.name ?? u.email;
        }
      }

      return rows.map((team) => ({
        ...team,
        teamLeadDisplayName:
          team.teamLead?.name ??
          team.teamLead?.email ??
          (team.teamLeadEmail
            ? (emailUserMap[team.teamLeadEmail] ?? team.teamLeadEmail)
            : null),
      }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(1).max(200),
        classId: z.string(),
        pitNumber: z.number().int().positive().optional(),
        schoolOrOrg: z.string().max(200).optional(),
        teamLeadUserId: z.string().optional(),
        teamLeadEmail: z.string().email().optional(),
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
        teamLeadEmail: z.string().nullable().optional(),
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
            teamLeadEmail: z.string().optional(),
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
