import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../init";
import { competitionTypes } from "@/db/schema";

const formFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["number", "select", "checkbox", "text", "textarea"]),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const formSchemaZ = z.object({ fields: z.array(formFieldSchema) });

const scoringRuleSchema = z.object({
  field: z.string().min(1),
  pointsPer: z.number().optional(),
  values: z.record(z.string(), z.number()).optional(),
});

const scoringLogicSchema = z.object({ rules: z.array(scoringRuleSchema) });

export const competitionTypesRouter = router({
  /** Returns all public types + the current user's private types (if logged in). */
  list: publicProcedure.query(({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (userId) {
      return ctx.db
        .select()
        .from(competitionTypes)
        .where(
          or(
            eq(competitionTypes.isPublic, true),
            eq(competitionTypes.createdByUserId, userId)
          )
        );
    }
    return ctx.db
      .select()
      .from(competitionTypes)
      .where(eq(competitionTypes.isPublic, true));
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ct = await ctx.db.query.competitionTypes.findFirst({
        where: eq(competitionTypes.id, input.id),
      });
      if (!ct) throw new TRPCError({ code: "NOT_FOUND" });
      return ct;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        isPublic: z.boolean().default(true),
        matchDurationMinutes: z.number().int().min(1).default(5),
        inspectionFormSchema: formSchemaZ,
        refereeFormSchema: formSchemaZ,
        judgingFormSchema: formSchemaZ.optional(),
        scoringLogic: scoringLogicSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [ct] = await ctx.db
        .insert(competitionTypes)
        .values({ ...input, createdByUserId: ctx.user.id })
        .returning();
      return ct;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        isPublic: z.boolean().optional(),
        matchDurationMinutes: z.number().int().min(1).optional(),
        inspectionFormSchema: formSchemaZ.optional(),
        refereeFormSchema: formSchemaZ.optional(),
        judgingFormSchema: formSchemaZ.nullable().optional(),
        scoringLogic: scoringLogicSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.query.competitionTypes.findFirst({
        where: eq(competitionTypes.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (existing.createdByUserId && existing.createdByUserId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can edit this competition type.",
        });
      }

      const [updated] = await ctx.db
        .update(competitionTypes)
        .set(data)
        .where(eq(competitionTypes.id, id))
        .returning();
      return updated;
    }),
});
