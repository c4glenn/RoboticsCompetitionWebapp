import { pgTable, text, uuid, unique, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tournaments } from "./tournaments";

export const roleEnum = pgEnum("role", [
  "DIRECTOR",
  "REFEREE",
  "JUDGE",
  "TEAM_LEAD",
  "VOLUNTEER",
]);

export const userTournamentRoles = pgTable(
  "user_tournament_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
  },
  (t) => [unique().on(t.userId, t.tournamentId, t.role)]
);

export type Role = (typeof roleEnum.enumValues)[number];
