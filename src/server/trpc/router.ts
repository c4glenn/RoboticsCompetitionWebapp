import { router } from "./init";
import { tournamentsRouter } from "./routers/tournaments";
import { competitionTypesRouter } from "./routers/competitionTypes";
import { teamsRouter } from "./routers/teams";
import { fieldsRouter } from "./routers/fields";
import { rolesRouter } from "./routers/roles";
import { scoringRouter } from "./routers/scoring";
import { leaderboardRouter } from "./routers/leaderboard";
import { matchesRouter } from "./routers/matches";
import { volunteerApplicationsRouter } from "./routers/volunteerApplications";
import { practiceFieldsRouter } from "./routers/practiceFields";
import { emailRouter } from "./routers/email";

export const appRouter = router({
  tournaments: tournamentsRouter,
  competitionTypes: competitionTypesRouter,
  teams: teamsRouter,
  fields: fieldsRouter,
  roles: rolesRouter,
  scoring: scoringRouter,
  leaderboard: leaderboardRouter,
  matches: matchesRouter,
  volunteerApplications: volunteerApplicationsRouter,
  practiceFields: practiceFieldsRouter,
  email: emailRouter,
});

export type AppRouter = typeof appRouter;
