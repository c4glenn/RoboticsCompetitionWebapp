import { z } from "zod";
import { eq } from "drizzle-orm";
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
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(competitionTypes)
  ),

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
        inspectionFormSchema: formSchemaZ,
        refereeFormSchema: formSchemaZ,
        judgingFormSchema: formSchemaZ.optional(),
        scoringLogic: scoringLogicSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [ct] = await ctx.db
        .insert(competitionTypes)
        .values(input)
        .returning();
      return ct;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
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

      const [updated] = await ctx.db
        .update(competitionTypes)
        .set(data)
        .where(eq(competitionTypes.id, id))
        .returning();
      return updated;
    }),
});
