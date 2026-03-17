import { pgTable, text, uuid, boolean } from "drizzle-orm/pg-core";
import { tournaments } from "./tournaments";

export const fields = pgTable("fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isPractice: boolean("is_practice").default(false).notNull(),
});
