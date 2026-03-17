import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tournaments } from "./tournaments";
import { fields } from "./fields";
import { teams } from "./teams";

export const matchTypeEnum = pgEnum("match_type", ["STANDARD", "ELIMINATION"]);

export const matchStatusEnum = pgEnum("match_status", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETE",
  "CANCELLED",
]);

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  /** Sequential match identifier within the tournament (e.g. 1, 2, 3…). */
  matchNumber: integer("match_number"),
  matchType: matchTypeEnum("match_type").notNull().default("STANDARD"),
  roundNumber: integer("round_number"),
  bracketPosition: text("bracket_position"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  status: matchStatusEnum("status").notNull().default("PENDING"),
});

export const matchTeams = pgTable(
  "match_teams",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    side: text("side"),
    /** The field this team runs on for this match (may differ per team). */
    fieldId: uuid("field_id").references(() => fields.id, {
      onDelete: "set null",
    }),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.teamId] })]
);
