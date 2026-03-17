import { relations } from "drizzle-orm";
import { users, accounts, sessions } from "./users";
import {
  tournaments,
  competitionTypes,
  tournamentClasses,
} from "./tournaments";
import { fields } from "./fields";
import { teams } from "./teams";
import { userTournamentRoles } from "./roles";
import { matches, matchTeams } from "./matches";
import { scores, inspections, judgingScores } from "./scores";
import { volunteerApplications } from "./volunteerApplications";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  tournamentRoles: many(userTournamentRoles),
  ledTeams: many(teams),
  scores: many(scores),
  inspections: many(inspections),
  judgingScores: many(judgingScores),
  volunteerApplications: many(volunteerApplications),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const competitionTypesRelations = relations(
  competitionTypes,
  ({ many }) => ({
    tournaments: many(tournaments),
  })
);

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  competitionType: one(competitionTypes, {
    fields: [tournaments.competitionTypeId],
    references: [competitionTypes.id],
  }),
  classes: many(tournamentClasses),
  fields: many(fields),
  teams: many(teams),
  userRoles: many(userTournamentRoles),
  matches: many(matches),
  inspections: many(inspections),
  judgingScores: many(judgingScores),
  volunteerApplications: many(volunteerApplications),
}));

export const tournamentClassesRelations = relations(
  tournamentClasses,
  ({ one, many }) => ({
    tournament: one(tournaments, {
      fields: [tournamentClasses.tournamentId],
      references: [tournaments.id],
    }),
    teams: many(teams),
  })
);

export const fieldsRelations = relations(fields, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [fields.tournamentId],
    references: [tournaments.id],
  }),
  matchTeams: many(matchTeams),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [teams.tournamentId],
    references: [tournaments.id],
  }),
  class: one(tournamentClasses, {
    fields: [teams.classId],
    references: [tournamentClasses.id],
  }),
  teamLead: one(users, {
    fields: [teams.teamLeadUserId],
    references: [users.id],
  }),
  matchTeams: many(matchTeams),
  scores: many(scores),
  inspections: many(inspections),
  judgingScores: many(judgingScores),
}));

export const userTournamentRolesRelations = relations(
  userTournamentRoles,
  ({ one }) => ({
    user: one(users, {
      fields: [userTournamentRoles.userId],
      references: [users.id],
    }),
    tournament: one(tournaments, {
      fields: [userTournamentRoles.tournamentId],
      references: [tournaments.id],
    }),
  })
);

export const matchesRelations = relations(matches, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [matches.tournamentId],
    references: [tournaments.id],
  }),
  matchTeams: many(matchTeams),
  scores: many(scores),
}));

export const matchTeamsRelations = relations(matchTeams, ({ one }) => ({
  match: one(matches, {
    fields: [matchTeams.matchId],
    references: [matches.id],
  }),
  team: one(teams, {
    fields: [matchTeams.teamId],
    references: [teams.id],
  }),
  field: one(fields, {
    fields: [matchTeams.fieldId],
    references: [fields.id],
  }),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  match: one(matches, {
    fields: [scores.matchId],
    references: [matches.id],
  }),
  team: one(teams, {
    fields: [scores.teamId],
    references: [teams.id],
  }),
  referee: one(users, {
    fields: [scores.refereeUserId],
    references: [users.id],
  }),
}));

export const inspectionsRelations = relations(inspections, ({ one }) => ({
  team: one(teams, {
    fields: [inspections.teamId],
    references: [teams.id],
  }),
  tournament: one(tournaments, {
    fields: [inspections.tournamentId],
    references: [tournaments.id],
  }),
  inspector: one(users, {
    fields: [inspections.inspectorUserId],
    references: [users.id],
  }),
}));

export const judgingScoresRelations = relations(judgingScores, ({ one }) => ({
  team: one(teams, {
    fields: [judgingScores.teamId],
    references: [teams.id],
  }),
  tournament: one(tournaments, {
    fields: [judgingScores.tournamentId],
    references: [tournaments.id],
  }),
  judge: one(users, {
    fields: [judgingScores.judgeUserId],
    references: [users.id],
  }),
}));

export const volunteerApplicationsRelations = relations(
  volunteerApplications,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [volunteerApplications.tournamentId],
      references: [tournaments.id],
    }),
    user: one(users, {
      fields: [volunteerApplications.userId],
      references: [users.id],
    }),
  })
);
