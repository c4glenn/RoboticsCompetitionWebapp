import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, assertDirector } from "../init";
import { fields } from "@/db/schema";

export const fieldsRouter = router({
  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(fields)
        .where(eq(fields.tournamentId, input.tournamentId))
    ),

  create: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(1).max(100),
        isPractice: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      const [field] = await ctx.db.insert(fields).values(input).returning();
      return field;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        tournamentId: z.string(),
        name: z.string().min(1).max(100).optional(),
        isPractice: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tournamentId, ...data } = input;
      await assertDirector(ctx.user.id, tournamentId);

      const existing = await ctx.db.query.fields.findFirst({
        where: eq(fields.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(fields)
        .set(data)
        .where(eq(fields.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      await ctx.db.delete(fields).where(eq(fields.id, input.id));
    }),
});
