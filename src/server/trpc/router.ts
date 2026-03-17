import { router } from "./init";
import { tournamentsRouter } from "./routers/tournaments";
import { competitionTypesRouter } from "./routers/competitionTypes";
import { teamsRouter } from "./routers/teams";
import { fieldsRouter } from "./routers/fields";
import { rolesRouter } from "./routers/roles";
import { scoringRouter } from "./routers/scoring";
import { leaderboardRouter } from "./routers/leaderboard";
import { matchesRouter } from "./routers/matches";

export const appRouter = router({
  tournaments: tournamentsRouter,
  competitionTypes: competitionTypesRouter,
  teams: teamsRouter,
  fields: fieldsRouter,
  roles: rolesRouter,
  scoring: scoringRouter,
  leaderboard: leaderboardRouter,
  matches: matchesRouter,
});

export type AppRouter = typeof appRouter;
