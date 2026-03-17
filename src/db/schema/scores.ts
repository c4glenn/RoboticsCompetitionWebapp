import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";
import { teams } from "./teams";
import { tournaments } from "./tournaments";
import { users } from "./users";

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    formData: jsonb("form_data")
      .$type<Record<string, unknown>>()
      .notNull(),
    calculatedScore: integer("calculated_score").notNull(),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.matchId, t.teamId)]
);

export const inspections = pgTable("inspections", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  inspectorUserId: text("inspector_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  formData: jsonb("form_data")
    .$type<Record<string, unknown>>()
    .notNull(),
  passed: boolean("passed").notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const judgingScores = pgTable("judging_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  judgeUserId: text("judge_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  formData: jsonb("form_data")
    .$type<Record<string, unknown>>()
    .notNull(),
  calculatedScore: integer("calculated_score").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});
