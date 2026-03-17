import { pgTable, text, uuid, integer, boolean } from "drizzle-orm/pg-core";
import { tournaments, tournamentClasses } from "./tournaments";
import { users } from "./users";

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pitNumber: integer("pit_number"),
  classId: uuid("class_id")
    .notNull()
    .references(() => tournamentClasses.id),
  schoolOrOrg: text("school_or_org"),
  logoUrl: text("logo_url"),
  teamLeadUserId: text("team_lead_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  checkedIn: boolean("checked_in").notNull().default(false),
});
