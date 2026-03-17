import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, assertDirector } from "../init";
import { userTournamentRoles, users, roleEnum } from "@/db/schema";

export const rolesRouter = router({
  /** List all role assignments for a tournament. Director only. */
  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      return ctx.db.query.userTournamentRoles.findMany({
        where: eq(userTournamentRoles.tournamentId, input.tournamentId),
        with: { user: true },
      });
    }),

  /** Assign a role to a user in a tournament. Director only. */
  assign: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        userId: z.string(),
        role: z.enum(roleEnum.enumValues),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const targetUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

      // Upsert: ignore conflict on (userId, tournamentId, role) unique constraint
      const [row] = await ctx.db
        .insert(userTournamentRoles)
        .values(input)
        .onConflictDoNothing()
        .returning();
      return row;
    }),

  /** Look up a user by email to get their ID before assigning a role. */
  findUserByEmail: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
        columns: { id: true, name: true, email: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No user with that email." });
      return user;
    }),

  /** Remove a specific role assignment. Director only. */
  revoke: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        userId: z.string(),
        role: z.enum(roleEnum.enumValues),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      // Prevent directors from revoking their own director role
      if (ctx.user.id === input.userId && input.role === "DIRECTOR") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot revoke your own DIRECTOR role.",
        });
      }

      await ctx.db
        .delete(userTournamentRoles)
        .where(
          and(
            eq(userTournamentRoles.tournamentId, input.tournamentId),
            eq(userTournamentRoles.userId, input.userId),
            eq(userTournamentRoles.role, input.role)
          )
        );
    }),
});
