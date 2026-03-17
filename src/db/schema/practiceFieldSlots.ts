import {
  pgTable,
  uuid,
  timestamp,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { tournaments } from "./tournaments";
import { fields } from "./fields";
import { teams } from "./teams";
import { users } from "./users";

export const practiceFieldSlots = pgTable(
  "practice_field_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** UTC start of the booked slot. */
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    /** UTC end of the booked slot (startTime + slotDuration). */
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    /** The user who created this booking. */
    bookedByUserId: text("booked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // One team per (field, startTime) — prevents double-booking a field slot.
    unique("uq_field_slot").on(t.fieldId, t.startTime),
    // One booking per (team, startTime) — a team can't book two fields at once.
    unique("uq_team_slot").on(t.teamId, t.startTime),
  ]
);
