import { z } from "zod";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { router, protectedProcedure, assertDirector } from "../init";
import { userTournamentRoles, teams } from "@/db/schema";
import { sendEmail } from "@/lib/email";

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export const emailRouter = router({
  /** Send an email to all users with a given role in a tournament. Director only. */
  sendToRole: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        role: z.enum(["TEAM_LEAD", "VOLUNTEER"]),
        subject: z.string().min(1, "Subject is required").max(200),
        body: z.string().min(1, "Body is required").max(10000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertDirector(ctx.user.id, input.tournamentId);

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const globalVars: Record<string, string> = {
        AppUrl: appUrl,
        TournamentLink: `${appUrl}/dashboard/tournaments/${input.tournamentId}`,
      };

      const assignments = await ctx.db.query.userTournamentRoles.findMany({
        where: and(
          eq(userTournamentRoles.tournamentId, input.tournamentId),
          eq(userTournamentRoles.role, input.role)
        ),
        with: { user: true },
      });

      // Build userId -> team info map so we can populate team vars for team leads with accounts
      type TeamVars = { name: string; schoolOrOrg: string | null; pitNumber: number | null };
      let teamByUserId = new Map<string, TeamVars>();
      if (input.role === "TEAM_LEAD") {
        const teamRows = await ctx.db
          .select({
            teamLeadUserId: teams.teamLeadUserId,
            name: teams.name,
            schoolOrOrg: teams.schoolOrOrg,
            pitNumber: teams.pitNumber,
          })
          .from(teams)
          .where(
            and(eq(teams.tournamentId, input.tournamentId), isNotNull(teams.teamLeadUserId))
          );
        for (const t of teamRows) {
          if (t.teamLeadUserId) teamByUserId.set(t.teamLeadUserId, t);
        }
      }

      let sent = 0;
      let skipped = 0;

      for (const assignment of assignments) {
        const { user } = assignment;
        if (!user.email) {
          skipped++;
          continue;
        }
        const vars: Record<string, string> = { ...globalVars, Name: user.name ?? "" };
        const team = teamByUserId.get(user.id);
        if (team) {
          vars.TeamName = team.name;
          if (team.schoolOrOrg) vars.Org = team.schoolOrOrg;
          if (team.pitNumber != null) vars.PitNumber = String(team.pitNumber);
        }
        await sendEmail({
          to: user.email,
          toName: user.name ?? undefined,
          subject: applyTemplate(input.subject, vars),
          text: applyTemplate(input.body, vars),
        });
        sent++;
      }

      // For TEAM_LEAD, also email teams that have a teamLeadEmail but no linked account
      if (input.role === "TEAM_LEAD") {
        const accountlessTeams = await ctx.db
          .select({
            teamLeadEmail: teams.teamLeadEmail,
            name: teams.name,
            schoolOrOrg: teams.schoolOrOrg,
            pitNumber: teams.pitNumber,
          })
          .from(teams)
          .where(
            and(
              eq(teams.tournamentId, input.tournamentId),
              isNull(teams.teamLeadUserId),
              isNotNull(teams.teamLeadEmail)
            )
          );

        for (const team of accountlessTeams) {
          const vars: Record<string, string> = { ...globalVars, Name: team.name, TeamName: team.name };
          if (team.schoolOrOrg) vars.Org = team.schoolOrOrg;
          if (team.pitNumber != null) vars.PitNumber = String(team.pitNumber);
          await sendEmail({
            to: team.teamLeadEmail!,
            toName: team.name,
            subject: applyTemplate(input.subject, vars),
            text: applyTemplate(input.body, vars),
          });
          sent++;
        }
      }

      return { sent, skipped };
    }),
});
