import { pgTable, text, timestamp, uuid, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { users } from "./users";

// ── JSON shape types ──────────────────────────────────────────────────────────

export interface FormField {
  name: string;
  label: string;
  type: "number" | "select" | "checkbox" | "text" | "textarea";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  required?: boolean;
  defaultValue?: string | number | boolean;
}

export interface FormSchema {
  fields: FormField[];
}

export interface ScoringRule {
  field: string;
  /** Points multiplied by the field's numeric value */
  pointsPer?: number;
  /** Map of field value → points (for discrete select fields) */
  values?: Record<string, number>;
}

export interface ScoringLogic {
  rules: ScoringRule[];
}

export type ScoreAggregationMethod = "best_n" | "average" | "sum";

/**
 * How to aggregate multiple match scores per team into a single leaderboard score.
 * - best_n: take the top `n` scores and sum them (e.g. best 2 of 3)
 * - average: average all scores
 * - sum: sum all scores
 */
export interface ScoreAggregation {
  method: ScoreAggregationMethod;
  /** For best_n: how many top scores to use. Defaults to 1. */
  n?: number;
}

// ── Tables ────────────────────────────────────────────────────────────────────

export const competitionTypes = pgTable("competition_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  inspectionFormSchema: jsonb("inspection_form_schema")
    .$type<FormSchema>()
    .notNull(),
  refereeFormSchema: jsonb("referee_form_schema")
    .$type<FormSchema>()
    .notNull(),
  judgingFormSchema: jsonb("judging_form_schema").$type<FormSchema>(),
  scoringLogic: jsonb("scoring_logic").$type<ScoringLogic>().notNull(),
  /** Duration of a single match in minutes (used for schedule generation). */
  matchDurationMinutes: integer("match_duration_minutes").notNull().default(5),
  /** Public types are usable by anyone; private types only by the creator. */
  isPublic: boolean("is_public").notNull().default(true),
  /** The user who created this type. Null for system-seeded types. */
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  competitionTypeId: uuid("competition_type_id")
    .notNull()
    .references(() => competitionTypes.id),
  /** How many qualification matches each team is scheduled to play. */
  matchesPerTeam: integer("matches_per_team").notNull().default(3),
  /** How to aggregate multiple match scores into one leaderboard score. */
  scoreAggregation: jsonb("score_aggregation")
    .$type<ScoreAggregation>()
    .notNull()
    .default({ method: "best_n", n: 2 }),
  /**
   * Labels for team slots within a match (e.g. ["HOME", "AWAY"] or ["Red", "Blue"]).
   * Null means this tournament doesn't use sides.
   */
  matchSides: jsonb("match_sides").$type<string[]>(),
  /** Show judging scores on the public leaderboard (requires competitionType.judgingFormSchema). */
  showJudgingScores: boolean("show_judging_scores").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  /** Duration of each practice field time slot in minutes. */
  practiceSlotDurationMinutes: integer("practice_slot_duration_minutes")
    .notNull()
    .default(15),
  /** Max number of upcoming (future) practice slots a team may hold at once. */
  maxFuturePracticeSlots: integer("max_future_practice_slots")
    .notNull()
    .default(1),
  /** IANA timezone identifier for this tournament (e.g. "America/New_York"). */
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tournamentClasses = pgTable("tournament_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});
