/**
 * Integration tests for Phase 2 — Authentication.
 * Requires a running Postgres instance (DATABASE_URL in .env.local).
 *
 * Run with: pnpm test:run
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getUserRoles, hasRole } from "@/db/queries/auth";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required for integration tests. Ensure .env.local is loaded."
  );
}

const conn = postgres(connectionString, { max: 1 });
const db = drizzle(conn, { schema });

// Track created records for cleanup
const ids: {
  userId?: string;
  competitionTypeId?: string;
  tournamentId?: string;
  roleId?: string;
} = {};

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });
});

afterAll(async () => {
  if (ids.roleId)
    await db
      .delete(schema.userTournamentRoles)
      .where(eq(schema.userTournamentRoles.id, ids.roleId));
  if (ids.tournamentId)
    await db
      .delete(schema.tournaments)
      .where(eq(schema.tournaments.id, ids.tournamentId));
  if (ids.competitionTypeId)
    await db
      .delete(schema.competitionTypes)
      .where(eq(schema.competitionTypes.id, ids.competitionTypeId));
  if (ids.userId)
    await db
      .delete(schema.users)
      .where(eq(schema.users.id, ids.userId));

  await conn.end();
});

describe("bcrypt password hashing", () => {
  it("hashes and verifies a password correctly", async () => {
    const password = "test-password-123";
    const hash = await bcrypt.hash(password, 12);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);

    const isValid = await bcrypt.compare(password, hash);
    expect(isValid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await bcrypt.hash("correct-password", 12);
    const isValid = await bcrypt.compare("wrong-password", hash);
    expect(isValid).toBe(false);
  });
});

describe("getUserRoles", () => {
  beforeAll(async () => {
    // Create a user
    const [user] = await db
      .insert(schema.users)
      .values({
        name: "Auth Test User",
        email: `auth-test-${Date.now()}@test.local`,
        passwordHash: await bcrypt.hash("password123", 12),
      })
      .returning();
    ids.userId = user.id;

    // Create a competition type
    const [ct] = await db
      .insert(schema.competitionTypes)
      .values({
        name: `Auth Test Type ${Date.now()}`,
        inspectionFormSchema: { fields: [] },
        refereeFormSchema: { fields: [] },
        scoringLogic: { rules: [] },
      })
      .returning();
    ids.competitionTypeId = ct.id;

    // Create a tournament
    const [tournament] = await db
      .insert(schema.tournaments)
      .values({
        name: "Auth Test Tournament",
        competitionTypeId: ct.id,
      })
      .returning();
    ids.tournamentId = tournament.id;

    // Assign DIRECTOR role
    const [role] = await db
      .insert(schema.userTournamentRoles)
      .values({
        userId: user.id,
        tournamentId: tournament.id,
        role: "DIRECTOR",
      })
      .returning();
    ids.roleId = role.id;
  });

  it("returns the user's roles for a tournament", async () => {
    const roles = await getUserRoles(ids.userId!, ids.tournamentId!);
    expect(roles).toContain("DIRECTOR");
    expect(roles).toHaveLength(1);
  });

  it("returns empty array for a user with no roles in a tournament", async () => {
    const roles = await getUserRoles("nonexistent-user-id", ids.tournamentId!);
    expect(roles).toEqual([]);
  });

  it("returns empty array for an unknown tournament", async () => {
    const roles = await getUserRoles(ids.userId!, "00000000-0000-0000-0000-000000000000");
    expect(roles).toEqual([]);
  });
});

describe("hasRole", () => {
  it("returns true when user has the role", async () => {
    const result = await hasRole(ids.userId!, ids.tournamentId!, "DIRECTOR");
    expect(result).toBe(true);
  });

  it("returns true when checking multiple roles and user has one", async () => {
    const result = await hasRole(
      ids.userId!,
      ids.tournamentId!,
      "REFEREE",
      "DIRECTOR"
    );
    expect(result).toBe(true);
  });

  it("returns false when user does not have the role", async () => {
    const result = await hasRole(ids.userId!, ids.tournamentId!, "REFEREE");
    expect(result).toBe(false);
  });
});

describe("user registration constraints", () => {
  it("enforces unique email on duplicate registration", async () => {
    const email = `dup-${Date.now()}@test.local`;
    await db.insert(schema.users).values({ email, passwordHash: "hash1" });

    await expect(
      db.insert(schema.users).values({ email, passwordHash: "hash2" })
    ).rejects.toThrow();

    // Clean up
    await db.delete(schema.users).where(eq(schema.users.email, email));
  });
});
