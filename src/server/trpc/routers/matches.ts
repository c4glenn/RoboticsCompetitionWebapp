import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure, assertDirector } from "../init";
import { matches, matchTeams, teams } from "@/db/schema";
import { hasRole } from "@/db/queries/auth";

// ── helpers ────────────────────────────────────────────────────────────────────

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ── router ─────────────────────────────────────────────────────────────────────

export const matchesRouter = router({
  /** All matches for a tournament with teams and scores. Referee/Director only. */
  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ok = await hasRole(ctx.user.id, input.tournamentId, "REFEREE", "DIRECTOR");
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.db.query.matches.findMany({
        where: eq(matches.tournamentId, input.tournamentId),
        with: {
          matchTeams: { with: { team: true } },
          scores: true,
          field: true,
        },
        orderBy: (m, { asc }) => [asc(m.roundNumber), asc(m.scheduledAt)],
      });
    }),

  /** Public — used for bracket visualization. */
  listPublic: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.matches.findMany({
        where: eq(matches.tournamentId, input.tournamentId),
        with: {
          matchTeams: { with: { team: true } },
          scores: true,
          field: true,
        },
        orderBy: (m, { asc }) => [asc(m.roundNumber), asc(m.scheduledAt)],
      });
    }),

  /** Create a new match. Director only. */
  create: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        fieldId: z.string().optional(),
        matchType: z.enum(["STANDARD", "ELIMINATION"]).default("STANDARD"),
        roundNumber: z.number().int().positive().optional(),
        scheduledAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const [match] = await ctx.db
        .insert(matches)
        .values({
          tournamentId: input.tournamentId,
          fieldId: input.fieldId,
          matchType: input.matchType,
          roundNumber: input.roundNumber,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        })
        .returning();

      return match;
    }),

  /** Add a team to a match. Director only. */
  addTeam: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        tournamentId: z.string(),
        teamId: z.string(),
        side: z.enum(["HOME", "AWAY"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      // Verify team belongs to this tournament
      const team = await ctx.db.query.teams.findFirst({
        where: and(
          eq(teams.id, input.teamId),
          eq(teams.tournamentId, input.tournamentId)
        ),
      });
      if (!team) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Team not found in this tournament.",
        });
      }

      const [mt] = await ctx.db
        .insert(matchTeams)
        .values({ matchId: input.matchId, teamId: input.teamId, side: input.side })
        .returning();

      return mt;
    }),

  /** Remove a team from a match. Director only. */
  removeTeam: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        tournamentId: z.string(),
        teamId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      await ctx.db
        .delete(matchTeams)
        .where(
          and(
            eq(matchTeams.matchId, input.matchId),
            eq(matchTeams.teamId, input.teamId)
          )
        );
    }),

  /** Update match status. Referee or Director. */
  updateStatus: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        tournamentId: z.string(),
        status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETE", "CANCELLED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ok = await hasRole(ctx.user.id, input.tournamentId, "REFEREE", "DIRECTOR");
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });

      const [updated] = await ctx.db
        .update(matches)
        .set({
          status: input.status,
          completedAt: input.status === "COMPLETE" ? new Date() : undefined,
        })
        .where(eq(matches.id, input.matchId))
        .returning();

      return updated;
    }),

  /** Delete a match. Director only. */
  delete: protectedProcedure
    .input(z.object({ matchId: z.string(), tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      await ctx.db.delete(matches).where(eq(matches.id, input.matchId));
    }),

  /**
   * Generate a single-elimination bracket from an ordered list of seeded teams.
   * Seeds are paired 1 vs N, 2 vs N-1, etc. (standard bracket seeding).
   * Creates placeholder matches for subsequent rounds (teams assigned as winners advance).
   * Director only.
   */
  generateBracket: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        /** Team IDs ordered by seed (index 0 = top seed). */
        seededTeamIds: z.array(z.string()).min(2).max(64),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const { tournamentId, seededTeamIds } = input;
      const bracketSize = nextPowerOf2(seededTeamIds.length);
      const totalRounds = Math.log2(bracketSize);
      const created: (typeof matches.$inferSelect)[] = [];

      // Round 1: pair seeds (top seed vs bottom, etc.) — byes for teams beyond the list
      const round1Count = bracketSize / 2;
      for (let i = 0; i < round1Count; i++) {
        const homeIdx = i;
        const awayIdx = bracketSize - 1 - i;

        const [match] = await ctx.db
          .insert(matches)
          .values({
            tournamentId,
            matchType: "ELIMINATION",
            roundNumber: 1,
            bracketPosition: `1-${i + 1}`,
            status: "PENDING",
          })
          .returning();
        created.push(match);

        if (homeIdx < seededTeamIds.length) {
          await ctx.db
            .insert(matchTeams)
            .values({ matchId: match.id, teamId: seededTeamIds[homeIdx], side: "HOME" });
        }
        if (awayIdx < seededTeamIds.length && awayIdx !== homeIdx) {
          await ctx.db
            .insert(matchTeams)
            .values({ matchId: match.id, teamId: seededTeamIds[awayIdx], side: "AWAY" });
        }
      }

      // Subsequent rounds — empty matches, filled as winners advance
      for (let round = 2; round <= totalRounds; round++) {
        const matchCount = bracketSize / Math.pow(2, round);
        for (let i = 0; i < matchCount; i++) {
          const [match] = await ctx.db
            .insert(matches)
            .values({
              tournamentId,
              matchType: "ELIMINATION",
              roundNumber: round,
              bracketPosition: `${round}-${i + 1}`,
              status: "PENDING",
            })
            .returning();
          created.push(match);
        }
      }

      return created;
    }),

  /**
   * Advance the winner of an elimination match to the next round.
   * Marks the match COMPLETE and assigns the winner to the appropriate next match.
   * Director or Referee.
   */
  advanceWinner: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        tournamentId: z.string(),
        winnerTeamId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ok = await hasRole(ctx.user.id, input.tournamentId, "REFEREE", "DIRECTOR");
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });

      const match = await ctx.db.query.matches.findFirst({
        where: eq(matches.id, input.matchId),
      });
      if (!match) throw new TRPCError({ code: "NOT_FOUND" });
      if (match.matchType !== "ELIMINATION") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only elimination matches support winner advancement.",
        });
      }

      // Mark current match complete
      await ctx.db
        .update(matches)
        .set({ status: "COMPLETE", completedAt: new Date() })
        .where(eq(matches.id, input.matchId));

      if (!match.roundNumber || !match.bracketPosition) {
        return { advanced: false };
      }

      // Determine next-round bracket position
      const currentPos = parseInt(match.bracketPosition.split("-")[1], 10);
      const nextRound = match.roundNumber + 1;
      const nextPos = Math.ceil(currentPos / 2);
      const nextBracketPosition = `${nextRound}-${nextPos}`;

      const nextMatch = await ctx.db.query.matches.findFirst({
        where: and(
          eq(matches.tournamentId, input.tournamentId),
          eq(matches.bracketPosition, nextBracketPosition),
          eq(matches.matchType, "ELIMINATION")
        ),
        with: { matchTeams: true },
      });

      if (!nextMatch) return { advanced: false };

      // Assign to HOME if empty, AWAY otherwise
      const side = nextMatch.matchTeams.length === 0 ? "HOME" : "AWAY";
      await ctx.db
        .insert(matchTeams)
        .values({ matchId: nextMatch.id, teamId: input.winnerTeamId, side });

      return { advanced: true, nextMatchId: nextMatch.id };
    }),
});
