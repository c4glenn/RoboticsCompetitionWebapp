import { pgTable, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tournaments } from "./tournaments";
import { users } from "./users";
import { roleEnum } from "./roles";

export const applicationStatusEnum = pgEnum("application_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const volunteerApplications = pgTable("volunteer_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  requestedRole: roleEnum("requested_role").notNull().default("VOLUNTEER"),
  message: text("message"),
  status: applicationStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
