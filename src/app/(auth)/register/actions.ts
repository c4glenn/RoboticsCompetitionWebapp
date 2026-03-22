"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, teams, userTournamentRoles } from "@/db/schema";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterResult =
  | { success: true }
  | { success: false; error: string };

export async function registerUser(
  formData: FormData
): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    return { success: false, error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [newUser] = await db.insert(users).values({ name, email, passwordHash }).returning({ id: users.id });

  // Link any teams that were pre-registered with this email
  const matchingTeams = await db.query.teams.findMany({
    where: eq(teams.teamLeadEmail, email),
    columns: { id: true, tournamentId: true },
  });

  if (matchingTeams.length > 0) {
    await Promise.all([
      ...matchingTeams.map((team) =>
        db.update(teams).set({ teamLeadUserId: newUser.id }).where(eq(teams.id, team.id))
      ),
      db.insert(userTournamentRoles)
        .values(matchingTeams.map((team) => ({
          userId: newUser.id,
          tournamentId: team.tournamentId,
          role: "TEAM_LEAD" as const,
        })))
        .onConflictDoNothing(),
    ]);
  }

  return { success: true };
}
