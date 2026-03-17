import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userTournamentRoles } from "@/db/schema";
import type { Role } from "@/db/schema";

/**
 * Returns all roles a user holds within a specific tournament.
 * Returns an empty array if the user has no roles in that tournament.
 */
export async function getUserRoles(
  userId: string,
  tournamentId: string
): Promise<Role[]> {
  const rows = await db
    .select({ role: userTournamentRoles.role })
    .from(userTournamentRoles)
    .where(
      and(
        eq(userTournamentRoles.userId, userId),
        eq(userTournamentRoles.tournamentId, tournamentId)
      )
    );

  return rows.map((r) => r.role);
}

/**
 * Returns true if the user holds at least one of the given roles in the tournament.
 */
export async function hasRole(
  userId: string,
  tournamentId: string,
  ...roles: Role[]
): Promise<boolean> {
  const userRoles = await getUserRoles(userId, tournamentId);
  return roles.some((r) => userRoles.includes(r));
}
