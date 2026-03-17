import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, assertDirector } from "../init";
import { volunteerApplications, userTournamentRoles } from "@/db/schema";
import type { Role } from "@/db/schema";

export const volunteerApplicationsRouter = router({
  /**
   * Submit a volunteer application for a tournament.
   * Throws CONFLICT if the user already has a PENDING or APPROVED application.
   */
  submit: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(1).max(200),
        requestedRole: z.enum(["REFEREE", "JUDGE", "VOLUNTEER", "CHECK_IN_TABLE"]),
        message: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.volunteerApplications.findFirst({
        where: and(
          eq(volunteerApplications.tournamentId, input.tournamentId),
          eq(volunteerApplications.userId, ctx.user.id),
          inArray(volunteerApplications.status, ["PENDING", "APPROVED"])
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have already applied to volunteer for this tournament.",
        });
      }

      const [application] = await ctx.db
        .insert(volunteerApplications)
        .values({
          tournamentId: input.tournamentId,
          userId: ctx.user.id,
          name: input.name,
          requestedRole: input.requestedRole as Role,
          message: input.message ?? null,
        })
        .returning();

      return application;
    }),

  /**
   * List volunteer applications for a tournament. Director only.
   */
  listApplications: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        status: z
          .enum(["PENDING", "APPROVED", "REJECTED", "ALL"])
          .optional()
          .default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const rows = await ctx.db.query.volunteerApplications.findMany({
        where:
          input.status === "ALL"
            ? eq(volunteerApplications.tournamentId, input.tournamentId)
            : and(
                eq(volunteerApplications.tournamentId, input.tournamentId),
                eq(volunteerApplications.status, input.status)
              ),
        with: { user: true },
        orderBy: (a, { desc }) => [desc(a.createdAt)],
      });

      return rows;
    }),

  /**
   * Approve or reject a volunteer application. Director only.
   * Approving automatically grants the VOLUNTEER role.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        applicationId: z.string(),
        tournamentId: z.string(),
        status: z.enum(["APPROVED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const app = await ctx.db.query.volunteerApplications.findFirst({
        where: and(
          eq(volunteerApplications.id, input.applicationId),
          eq(volunteerApplications.tournamentId, input.tournamentId)
        ),
      });

      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(volunteerApplications)
          .set({ status: input.status })
          .where(eq(volunteerApplications.id, input.applicationId));

        if (input.status === "APPROVED" && app.userId) {
          await tx
            .insert(userTournamentRoles)
            .values({
              userId: app.userId,
              tournamentId: input.tournamentId,
              role: app.requestedRole,
            })
            .onConflictDoNothing();
        }
      });

      return { success: true };
    }),
});
