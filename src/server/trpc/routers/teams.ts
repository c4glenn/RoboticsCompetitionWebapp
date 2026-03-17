import { z } from "zod";
import { eq, asc, inArray, and, gte, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, assertDirector, assertDirectorOrCheckIn } from "../init";
import { teams, users, matchTeams, inspections, practiceFieldSlots, tournaments } from "@/db/schema";
import { getUserRoles } from "@/db/queries/auth";
import { getLeaderboard } from "@/db/queries/leaderboard";

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

  teamDashboard: protectedProcedure
    .input(z.object({ tournamentId: z.string(), teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tournamentId, teamId } = input;

      const userRoles = await getUserRoles(ctx.user.id, tournamentId);
      const isTeamLead = userRoles.includes("TEAM_LEAD");
      const isStaff = userRoles.some((r) =>
        ["DIRECTOR", "VOLUNTEER", "CHECK_IN_TABLE", "REFEREE", "JUDGE"].includes(r)
      );
      if (!isTeamLead && !isStaff) throw new TRPCError({ code: "FORBIDDEN" });

      // Team leads can only view their own team
      if (isTeamLead && !isStaff) {
        const myTeam = await ctx.db.query.teams.findFirst({
          where: and(eq(teams.tournamentId, tournamentId), eq(teams.teamLeadUserId, ctx.user.id)),
          columns: { id: true },
        });
        if (!myTeam || myTeam.id !== teamId) throw new TRPCError({ code: "FORBIDDEN" });
      }

      const now = new Date();

      const [team, myMatchTeams, slots, inspectionRows, leaderboard, tournament] =
        await Promise.all([
          ctx.db.query.teams.findFirst({
            where: eq(teams.id, teamId),
            with: { class: true },
          }),
          ctx.db.query.matchTeams.findMany({
            where: eq(matchTeams.teamId, teamId),
            with: {
              match: {
                with: {
                  matchTeams: {
                    with: {
                      team: { columns: { id: true, name: true } },
                      field: { columns: { id: true, name: true } },
                    },
                  },
                  scores: { columns: { teamId: true, calculatedScore: true } },
                },
              },
            },
          }),
          ctx.db.query.practiceFieldSlots.findMany({
            where: and(
              eq(practiceFieldSlots.teamId, teamId),
              gte(practiceFieldSlots.startTime, now)
            ),
            with: { field: { columns: { name: true } } },
            orderBy: asc(practiceFieldSlots.startTime),
          }),
          ctx.db.query.inspections.findMany({
            where: and(
              eq(inspections.teamId, teamId),
              eq(inspections.tournamentId, tournamentId)
            ),
            with: { inspector: { columns: { name: true, email: true } } },
            orderBy: (i, { desc }) => [desc(i.completedAt)],
          }),
          getLeaderboard(tournamentId),
          ctx.db.query.tournaments.findFirst({
            where: eq(tournaments.id, tournamentId),
            with: { competitionType: { columns: { inspectionFormSchema: true } } },
          }),
        ]);

      if (!team) throw new TRPCError({ code: "NOT_FOUND" });

      function buildMatch(mt: (typeof myMatchTeams)[number]) {
        const m = mt.match;
        const myScore = m.scores.find((s) => s.teamId === teamId)?.calculatedScore ?? null;
        const myField = m.matchTeams.find((mt2) => mt2.teamId === teamId)?.field?.name ?? null;
        const opponents = m.matchTeams
          .filter((mt2) => mt2.teamId !== teamId)
          .map((mt2) => ({
            teamId: mt2.teamId,
            teamName: mt2.team.name,
            side: mt2.side,
            score: m.scores.find((s) => s.teamId === mt2.teamId)?.calculatedScore ?? null,
          }));
        return {
          id: m.id,
          matchNumber: m.matchNumber,
          matchType: m.matchType,
          status: m.status,
          scheduledAt: m.scheduledAt?.toISOString() ?? null,
          completedAt: m.completedAt?.toISOString() ?? null,
          myScore,
          myField,
          opponents,
        };
      }

      const upcomingMatches = myMatchTeams
        .filter((mt) => mt.match.status === "PENDING" || mt.match.status === "IN_PROGRESS")
        .map(buildMatch)
        .sort((a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0));

      const pastMatches = myMatchTeams
        .filter((mt) => mt.match.status === "COMPLETE")
        .map(buildMatch)
        .sort((a, b) => (b.matchNumber ?? 0) - (a.matchNumber ?? 0));

      const rankIdx = leaderboard.findIndex((r) => r.teamId === teamId);
      const rankRow = leaderboard[rankIdx];
      const ranking = rankRow
        ? {
            position: rankIdx + 1,
            totalTeams: leaderboard.length,
            totalScore: rankRow.totalScore,
            matchScore: rankRow.matchScore,
            judgingScore: rankRow.judgingScore,
            matchesPlayed: rankRow.matchesPlayed,
          }
        : null;

      return {
        team: {
          id: team.id,
          name: team.name,
          pitNumber: team.pitNumber,
          className: team.class?.name ?? null,
          checkedIn: team.checkedIn,
        },
        upcomingMatches,
        pastMatches,
        practiceSlots: slots.map((s) => ({
          id: s.id,
          fieldName: s.field.name,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
        })),
        inspections: inspectionRows.map((i) => ({
          id: i.id,
          passed: i.passed,
          completedAt: i.completedAt.toISOString(),
          inspector: i.inspector ? (i.inspector.name ?? i.inspector.email) : null,
          formData: i.formData,
        })),
        inspectionFormSchema: tournament?.competitionType?.inspectionFormSchema ?? null,
        ranking,
      };
    }),
});
