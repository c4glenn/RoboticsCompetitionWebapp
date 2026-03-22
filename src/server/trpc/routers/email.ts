import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure, assertDirector } from "../init";
import { userTournamentRoles } from "@/db/schema";
import { sendEmail } from "@/lib/email";

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

      const assignments = await ctx.db.query.userTournamentRoles.findMany({
        where: and(
          eq(userTournamentRoles.tournamentId, input.tournamentId),
          eq(userTournamentRoles.role, input.role)
        ),
        with: { user: true },
      });

      let sent = 0;
      let skipped = 0;

      for (const assignment of assignments) {
        const { user } = assignment;
        if (!user.email) {
          skipped++;
          continue;
        }
        await sendEmail({
          to: user.email,
          toName: user.name ?? undefined,
          subject: input.subject,
          text: input.body,
        });
        sent++;
      }

      return { sent, skipped };
    }),
});
