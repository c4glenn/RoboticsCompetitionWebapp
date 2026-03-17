import { z } from "zod";
import { and, eq, max } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure, assertDirector } from "../init";
import { matches, matchTeams, teams, tournaments } from "@/db/schema";
import { hasRole } from "@/db/queries/auth";

// ── helpers ────────────────────────────────────────────────────────────────────

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate round-robin pairings so each team plays exactly `matchesPerTeam` times.
 * Prefers fresh opponents by tracking previous matchups.
 */
function generatePairings(
  teamIds: string[],
  matchesPerTeam: number,
  teamsPerMatch: number
): string[][] {
  const playCount = new Map<string, number>(teamIds.map((t) => [t, 0]));
  const opponents = new Map<string, Set<string>>(teamIds.map((t) => [t, new Set()]));
  const pairings: string[][] = [];
  const maxIterations = teamIds.length * matchesPerTeam * 20;

  for (let iter = 0; iter < maxIterations; iter++) {
    if (teamIds.every((t) => (playCount.get(t) ?? 0) >= matchesPerTeam)) break;

    // Sort candidates: fewest plays first, then fewest times as anchor
    const available = [...teamIds]
      .filter((t) => (playCount.get(t) ?? 0) < matchesPerTeam)
      .sort((a, b) => (playCount.get(a) ?? 0) - (playCount.get(b) ?? 0));

    if (available.length < teamsPerMatch) break;

    const anchor = available[0];

    // Pick fillers: prefer teams that haven't played anchor before, then by fewest plays
    const fillers = available
      .slice(1)
      .sort((a, b) => {
        const aPlayed = (opponents.get(anchor) ?? new Set()).has(a) ? 1 : 0;
        const bPlayed = (opponents.get(anchor) ?? new Set()).has(b) ? 1 : 0;
        if (aPlayed !== bPlayed) return aPlayed - bPlayed;
        return (playCount.get(a) ?? 0) - (playCount.get(b) ?? 0);
      })
      .slice(0, teamsPerMatch - 1);

    if (fillers.length < teamsPerMatch - 1) break;

    const group = [anchor, ...fillers];
    pairings.push(group);
    group.forEach((t) => {
      playCount.set(t, (playCount.get(t) ?? 0) + 1);
      group.forEach((o) => {
        if (o !== t) opponents.get(t)?.add(o);
      });
    });
  }

  return pairings;
}

/**
 * Given a current timestamp, advance past any overlapping breaks.
 */
function skipBreaks(ts: number, breaks: { startsAt: number; endsAt: number }[]): number {
  let changed = true;
  while (changed) {
    changed = false;
    for (const brk of breaks) {
      if (ts >= brk.startsAt && ts < brk.endsAt) {
        ts = brk.endsAt;
        changed = true;
      }
    }
  }
  return ts;
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
          matchTeams: { with: { team: true, field: true } },
          scores: true,
        },
        orderBy: (m, { asc }) => [asc(m.matchNumber), asc(m.scheduledAt), asc(m.roundNumber)],
      });
    }),

  /** Public — used for bracket visualization. */
  listPublic: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.matches.findMany({
        where: eq(matches.tournamentId, input.tournamentId),
        with: {
          matchTeams: { with: { team: true, field: true } },
          scores: true,
        },
        orderBy: (m, { asc }) => [asc(m.matchNumber), asc(m.scheduledAt), asc(m.roundNumber)],
      });
    }),

  /** Create a new match. Director only. */
  create: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        matchNumber: z.number().int().positive().optional(),
        matchType: z.enum(["STANDARD", "ELIMINATION"]).default("STANDARD"),
        roundNumber: z.number().int().positive().optional(),
        scheduledAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      // Auto-assign matchNumber if not provided
      let matchNumber = input.matchNumber;
      if (matchNumber === undefined) {
        const [row] = await ctx.db
          .select({ maxNum: max(matches.matchNumber) })
          .from(matches)
          .where(eq(matches.tournamentId, input.tournamentId));
        matchNumber = (row?.maxNum ?? 0) + 1;
      }

      const [match] = await ctx.db
        .insert(matches)
        .values({
          tournamentId: input.tournamentId,
          matchNumber,
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
        side: z.string().optional(),
        fieldId: z.string().optional(),
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
        .values({ matchId: input.matchId, teamId: input.teamId, side: input.side, fieldId: input.fieldId })
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

  /** Delete all STANDARD matches for a tournament. Director only. */
  deleteAllStandard: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);
      await ctx.db
        .delete(matches)
        .where(
          and(
            eq(matches.tournamentId, input.tournamentId),
            eq(matches.matchType, "STANDARD")
          )
        );
    }),

  /**
   * Auto-generate a qualification schedule.
   * Produces round-robin pairings so every team plays matchesPerTeam times,
   * then assigns time slots across the selected fields, honouring breaks.
   * Director only.
   */
  generateSchedule: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        /** Total teams competing in one match. */
        teamsPerMatch: z.number().int().min(2).max(10),
        /** Teams assigned to each field within a match (must divide teamsPerMatch). */
        teamsPerField: z.number().int().min(1).max(10),
        /** Fields to use; each field runs one match at a time. */
        fieldIds: z.array(z.string()).min(1),
        /** Sides to cycle through when assigning teams to slots. */
        sides: z.array(z.string()).optional().default([]),
        /** ISO datetime of the first match. */
        startsAt: z.string().datetime(),
        /** Buffer between consecutive time slots (minutes). */
        betweenMatchMinutes: z.number().int().min(0).max(240),
        /** Named blocks of time when no matches should be scheduled. */
        breaks: z
          .array(
            z.object({
              label: z.string(),
              startsAt: z.string().datetime(),
              endsAt: z.string().datetime(),
            })
          )
          .optional()
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const tournament = await ctx.db.query.tournaments.findFirst({
        where: eq(tournaments.id, input.tournamentId),
        with: { competitionType: true },
      });
      if (!tournament) throw new TRPCError({ code: "NOT_FOUND" });

      const matchDuration = tournament.competitionType.matchDurationMinutes ?? 5;
      const matchesPerTeam = tournament.matchesPerTeam;
      const { teamsPerMatch, teamsPerField, fieldIds, sides, betweenMatchMinutes } = input;

      // How many fields are consumed by a single match
      const fieldsPerMatch = Math.max(1, Math.ceil(teamsPerMatch / teamsPerField));
      // How many matches run simultaneously in one time slot
      const matchesPerSlot = Math.max(1, Math.floor(fieldIds.length / fieldsPerMatch));

      // All teams in the tournament
      const teamRows = await ctx.db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.tournamentId, input.tournamentId));

      if (teamRows.length < teamsPerMatch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Need at least ${teamsPerMatch} teams to generate a schedule.`,
        });
      }

      const teamIds = teamRows.map((t) => t.id);
      const pairings = generatePairings(teamIds, matchesPerTeam, teamsPerMatch);

      if (pairings.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not generate pairings." });
      }

      // Pre-parse breaks
      const parsedBreaks = input.breaks.map((b) => ({
        startsAt: new Date(b.startsAt).getTime(),
        endsAt: new Date(b.endsAt).getTime(),
      }));

      const slotDurationMs = (matchDuration + betweenMatchMinutes) * 60_000;
      let currentSlotTime = skipBreaks(new Date(input.startsAt).getTime(), parsedBreaks);

      // Get starting matchNumber
      const [maxRow] = await ctx.db
        .select({ maxNum: max(matches.matchNumber) })
        .from(matches)
        .where(eq(matches.tournamentId, input.tournamentId));
      let nextMatchNum = (maxRow?.maxNum ?? 0) + 1;

      const created: (typeof matches.$inferSelect)[] = [];

      for (let i = 0; i < pairings.length; i++) {
        const slotIndex = Math.floor(i / matchesPerSlot);
        const indexInSlot = i % matchesPerSlot;

        // Advance time when starting a new slot
        if (i > 0 && indexInSlot === 0) {
          currentSlotTime = skipBreaks(
            currentSlotTime + slotDurationMs,
            parsedBreaks
          );
        }

        // Assign fields to the teams in this match
        const fieldStart = indexInSlot * fieldsPerMatch;
        const matchFieldIds = fieldIds.slice(fieldStart, fieldStart + fieldsPerMatch);

        const [match] = await ctx.db
          .insert(matches)
          .values({
            tournamentId: input.tournamentId,
            matchNumber: nextMatchNum++,
            matchType: "STANDARD",
            scheduledAt: new Date(currentSlotTime),
          })
          .returning();

        created.push(match);

        const group = pairings[i];
        for (let j = 0; j < group.length; j++) {
          const fieldId = matchFieldIds[Math.floor(j / teamsPerField)] ?? matchFieldIds[0];
          await ctx.db.insert(matchTeams).values({
            matchId: match.id,
            teamId: group[j],
            fieldId: fieldId ?? undefined,
            side: sides[j] ?? undefined,
          });
        }

        void slotIndex; // used for time advancement only
      }

      return created;
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
        /** Fields to cycle through when assigning matches. */
        fieldIds: z.array(z.string()).optional().default([]),
        /** Sides to assign to teams [side for home, side for away]. */
        sides: z.array(z.string()).optional().default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const { tournamentId, seededTeamIds, fieldIds, sides } = input;
      const bracketSize = nextPowerOf2(seededTeamIds.length);
      const totalRounds = Math.log2(bracketSize);
      const created: (typeof matches.$inferSelect)[] = [];

      // Start match numbers from next unused
      const [maxRow] = await ctx.db
        .select({ maxNum: max(matches.matchNumber) })
        .from(matches)
        .where(eq(matches.tournamentId, tournamentId));
      let nextMatchNum = (maxRow?.maxNum ?? 0) + 1;

      // Track a global match index across all rounds for field cycling
      let matchIndex = 0;

      // Round 1: pair seeds (top seed vs bottom, etc.) — byes for teams beyond the list
      const round1Count = bracketSize / 2;
      for (let i = 0; i < round1Count; i++) {
        const homeIdx = i;
        const awayIdx = bracketSize - 1 - i;
        const fieldId = fieldIds.length > 0 ? fieldIds[matchIndex % fieldIds.length] : undefined;

        const [match] = await ctx.db
          .insert(matches)
          .values({
            tournamentId,
            matchNumber: nextMatchNum++,
            matchType: "ELIMINATION",
            roundNumber: 1,
            bracketPosition: `1-${i + 1}`,
            status: "PENDING",
          })
          .returning();
        created.push(match);
        matchIndex++;

        if (homeIdx < seededTeamIds.length) {
          await ctx.db
            .insert(matchTeams)
            .values({ matchId: match.id, teamId: seededTeamIds[homeIdx], side: sides[0] ?? "HOME", fieldId });
        }
        if (awayIdx < seededTeamIds.length && awayIdx !== homeIdx) {
          await ctx.db
            .insert(matchTeams)
            .values({ matchId: match.id, teamId: seededTeamIds[awayIdx], side: sides[1] ?? "AWAY", fieldId });
        }
      }

      // Subsequent rounds — empty matches, filled as winners advance
      // Fields are inherited from the previous match when teams are assigned.
      for (let round = 2; round <= totalRounds; round++) {
        const matchCount = bracketSize / Math.pow(2, round);
        for (let i = 0; i < matchCount; i++) {
          const [match] = await ctx.db
            .insert(matches)
            .values({
              tournamentId,
              matchNumber: nextMatchNum++,
              matchType: "ELIMINATION",
              roundNumber: round,
              bracketPosition: `${round}-${i + 1}`,
              status: "PENDING",
            })
            .returning();
          created.push(match);
          matchIndex++;
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

      const [nextMatch, currentTeam] = await Promise.all([
        ctx.db.query.matches.findFirst({
          where: and(
            eq(matches.tournamentId, input.tournamentId),
            eq(matches.bracketPosition, nextBracketPosition),
            eq(matches.matchType, "ELIMINATION")
          ),
          with: { matchTeams: true },
        }),
        ctx.db.query.matchTeams.findFirst({
          where: eq(matchTeams.matchId, input.matchId),
        }),
      ]);

      if (!nextMatch) return { advanced: false };

      // Assign to HOME if empty, AWAY otherwise; inherit field from current match
      const side = nextMatch.matchTeams.length === 0 ? "HOME" : "AWAY";
      await ctx.db
        .insert(matchTeams)
        .values({
          matchId: nextMatch.id,
          teamId: input.winnerTeamId,
          side,
          fieldId: currentTeam?.fieldId ?? undefined,
        });

      return { advanced: true, nextMatchId: nextMatch.id };
    }),
});
