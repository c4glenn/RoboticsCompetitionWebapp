import { z } from "zod";
import { router, publicProcedure } from "../init";
import { getLeaderboard } from "@/db/queries/leaderboard";

export const leaderboardRouter = router({
  /**
   * Public — used for SSR initial render of the leaderboard page.
   * Live updates come via the SSE stream route.
   */
  get: publicProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(({ input }) => getLeaderboard(input.tournamentId)),
});
