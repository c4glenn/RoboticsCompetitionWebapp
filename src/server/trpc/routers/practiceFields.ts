import { z } from "zod";
import { and, eq, gte, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../init";
import {
  tournaments,
  fields,
  teams,
  practiceFieldSlots,
} from "@/db/schema";
import { hasRole, getUserRoles } from "@/db/queries/auth";
import {
  generateSlotBoundaries,
  DEFAULT_PRACTICE_WINDOW_MS,
} from "@/lib/practiceSlots";

export const practiceFieldsRouter = router({
  /**
   * Public — list all practice fields and their bookings for the upcoming window.
   * Powers both the dashboard booking UI and the public view.
   */
  listSlots: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, input.tournamentId),
        columns: {
          practiceSlotDurationMinutes: true,
          maxFuturePracticeSlots: true,
        },
      });
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND" });

      const slotDurationMs = tournament.practiceSlotDurationMinutes * 60_000;
      const now = new Date();
      const windowEnd = new Date(now.getTime() + DEFAULT_PRACTICE_WINDOW_MS);

      const [practiceFields, bookings] = await Promise.all([
        ctx.db.query.fields.findMany({
          where: and(
            eq(fields.tournamentId, input.tournamentId),
            eq(fields.isPractice, true)
          ),
          orderBy: (f, { asc }) => [asc(f.name)],
        }),
        ctx.db.query.practiceFieldSlots.findMany({
          where: and(
            eq(practiceFieldSlots.tournamentId, input.tournamentId),
            gte(practiceFieldSlots.startTime, now),
            lt(practiceFieldSlots.startTime, windowEnd)
          ),
          with: { team: { columns: { id: true, name: true } } },
        }),
      ]);

      const slotBoundaries = generateSlotBoundaries(
        now,
        slotDurationMs,
        DEFAULT_PRACTICE_WINDOW_MS
      );

      return {
        slotDurationMinutes: tournament.practiceSlotDurationMinutes,
        maxFuturePracticeSlots: tournament.maxFuturePracticeSlots,
        slotBoundaries: slotBoundaries.map((d) => d.toISOString()),
        fields: practiceFields,
        bookings: bookings.map((b) => ({
          id: b.id,
          fieldId: b.fieldId,
          teamId: b.teamId,
          teamName: b.team.name,
          bookedByUserId: b.bookedByUserId,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
        })),
      };
    }),

  /**
   * Returns the team the current user leads in this tournament, or null.
   * Used by the booking UI to pre-fill the team for TEAM_LEAD users.
   */
  myTeam: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const team = await ctx.db.query.teams.findFirst({
        where: and(
          eq(teams.tournamentId, input.tournamentId),
          eq(teams.teamLeadUserId, ctx.user.id)
        ),
        columns: { id: true, name: true },
      });
      return team ?? null;
    }),

  /**
   * Book a practice field slot.
   * - TEAM_LEAD: auto-books for their own team
   * - VOLUNTEER / DIRECTOR: must supply teamId
   */
  book: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        fieldId: z.string(),
        /** ISO string; must be a valid aligned slot boundary */
        startTime: z.string(),
        /** Required for VOLUNTEER / DIRECTOR */
        teamId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tournamentId, fieldId, startTime: startTimeStr } = input;

      const tournament = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, tournamentId),
        columns: {
          practiceSlotDurationMinutes: true,
          maxFuturePracticeSlots: true,
        },
      });
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND" });

      // Check caller has a booking-eligible role
      const callerRoles = await getUserRoles(ctx.user.id, tournamentId);
      const bookingRoles = ["TEAM_LEAD", "VOLUNTEER", "DIRECTOR"];
      const canBook = callerRoles.some((r) => bookingRoles.includes(r));
      if (!canBook) throw new TRPCError({ code: "FORBIDDEN" });

      // Resolve teamId
      let teamId: string;
      const isTeamLeadOnly =
        callerRoles.includes("TEAM_LEAD") &&
        !callerRoles.includes("VOLUNTEER") &&
        !callerRoles.includes("DIRECTOR");

      if (isTeamLeadOnly) {
        const team = await ctx.db.query.teams.findFirst({
          where: and(
            eq(teams.tournamentId, tournamentId),
            eq(teams.teamLeadUserId, ctx.user.id)
          ),
          columns: { id: true },
        });
        if (!team)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No team found for this team lead.",
          });
        teamId = team.id;
      } else {
        if (!input.teamId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "teamId is required.",
          });
        teamId = input.teamId;
      }

      // Validate startTime
      const startTime = new Date(startTimeStr);
      if (isNaN(startTime.getTime()))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid startTime." });

      const slotDurationMs = tournament.practiceSlotDurationMinutes * 60_000;
      if (startTime.getTime() % slotDurationMs !== 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start time is not aligned to a slot boundary.",
        });

      const now = new Date();
      if (startTime <= now)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot book a slot in the past.",
        });

      // Verify the field belongs to this tournament and is a practice field
      const field = await ctx.db.query.fields.findFirst({
        where: and(
          eq(fields.id, fieldId),
          eq(fields.tournamentId, tournamentId),
          eq(fields.isPractice, true)
        ),
        columns: { id: true },
      });
      if (!field)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Practice field not found.",
        });

      // Enforce maxFuturePracticeSlots
      const futureBookings = await ctx.db
        .select({ id: practiceFieldSlots.id })
        .from(practiceFieldSlots)
        .where(
          and(
            eq(practiceFieldSlots.teamId, teamId),
            gte(practiceFieldSlots.startTime, now)
          )
        );
      if (futureBookings.length >= tournament.maxFuturePracticeSlots) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `This team already has ${tournament.maxFuturePracticeSlots} upcoming slot(s) booked.`,
        });
      }

      // Insert — unique constraints handle race conditions
      const endTime = new Date(startTime.getTime() + slotDurationMs);
      try {
        const [slot] = await ctx.db
          .insert(practiceFieldSlots)
          .values({
            tournamentId,
            fieldId,
            teamId,
            startTime,
            endTime,
            bookedByUserId: ctx.user.id,
          })
          .returning();
        return slot;
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This slot is no longer available.",
        });
      }
    }),

  /**
   * Cancel a practice field booking.
   * - DIRECTOR: can cancel any slot
   * - TEAM_LEAD / VOLUNTEER: can cancel if they booked it or lead the team; cannot cancel past slots
   */
  cancel: protectedProcedure
    .input(z.object({ slotId: z.string(), tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.db.query.practiceFieldSlots.findFirst({
        where: eq(practiceFieldSlots.id, input.slotId),
        with: { team: { columns: { teamLeadUserId: true } } },
      });
      if (!slot) throw new TRPCError({ code: "NOT_FOUND" });
      if (slot.tournamentId !== input.tournamentId)
        throw new TRPCError({ code: "FORBIDDEN" });

      const isDirector = await hasRole(
        ctx.user.id,
        input.tournamentId,
        "DIRECTOR"
      );
      const isBooker = slot.bookedByUserId === ctx.user.id;
      const isTeamLead = slot.team.teamLeadUserId === ctx.user.id;

      if (!isDirector && !isBooker && !isTeamLead)
        throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date();
      if (!isDirector && slot.startTime < now)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot cancel a slot that has already started.",
        });

      await ctx.db
        .delete(practiceFieldSlots)
        .where(eq(practiceFieldSlots.id, input.slotId));
    }),

  /** Returns the current user's ID — used client-side to determine cancel permissions. */
  whoAmI: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id })),

  /**
   * List all teams for a tournament — used by VOLUNTEER / DIRECTOR booking UI
   * to pick which team to book for.
   */
  listTeams: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.teams.findMany({
        where: eq(teams.tournamentId, input.tournamentId),
        columns: { id: true, name: true },
        orderBy: (t, { asc }) => [asc(t.name)],
      });
    }),
});
