/**
 * Integration tests for the database schema.
 * Requires a running Postgres instance (DATABASE_URL in .env.local).
 *
 * Run with: pnpm test:run
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required for integration tests. Ensure .env.local is loaded."
  );
}

const conn = postgres(connectionString, { max: 1 });
const db = drizzle(conn, { schema });

// IDs created during tests — cleaned up in afterAll
const createdIds: {
  userId?: string;
  userEmail?: string;
  competitionTypeId?: string;
  tournamentId?: string;
  classId?: string;
  fieldId?: string;
  teamId?: string;
  matchId?: string;
  scoreId?: string;
} = {};

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });
});

afterAll(async () => {
  // Clean up in reverse FK order
  if (createdIds.scoreId)
    await db
      .delete(schema.scores)
      .where(eq(schema.scores.id, createdIds.scoreId));
  if (createdIds.matchId)
    await db
      .delete(schema.matches)
      .where(eq(schema.matches.id, createdIds.matchId));
  if (createdIds.teamId)
    await db
      .delete(schema.teams)
      .where(eq(schema.teams.id, createdIds.teamId));
  if (createdIds.fieldId)
    await db
      .delete(schema.fields)
      .where(eq(schema.fields.id, createdIds.fieldId));
  if (createdIds.tournamentId)
    await db
      .delete(schema.tournaments)
      .where(
        eq(schema.tournaments.id, createdIds.tournamentId)
      );
  if (createdIds.competitionTypeId)
    await db
      .delete(schema.competitionTypes)
      .where(
        eq(
          schema.competitionTypes.id,
          createdIds.competitionTypeId
        )
      );
  if (createdIds.userId)
    await db
      .delete(schema.users)
      .where(eq(schema.users.id, createdIds.userId));

  await conn.end();
});

describe("users", () => {
  it("inserts a user and reads it back", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        name: "Test User",
        email: `test-${Date.now()}@schema.test`,
        passwordHash: "hashed",
      })
      .returning();

    expect(user.id).toBeDefined();
    expect(user.email).toContain("@schema.test");
    expect(user.createdAt).toBeInstanceOf(Date);
    createdIds.userId = user.id;
    createdIds.userEmail = user.email;
  });

  it("enforces unique email constraint", async () => {
    await expect(
      db.insert(schema.users).values({
        email: createdIds.userEmail!, // same email — must conflict
        passwordHash: "hashed",
      })
    ).rejects.toThrow();
  });
});

describe("competition types", () => {
  it("stores and retrieves jsonb form schemas", async () => {
    const [ct] = await db
      .insert(schema.competitionTypes)
      .values({
        name: `Test Type ${Date.now()}`,
        inspectionFormSchema: { fields: [] },
        refereeFormSchema: {
          fields: [{ name: "score", label: "Score", type: "number" }],
        },
        scoringLogic: { rules: [{ field: "score", pointsPer: 1 }] },
      })
      .returning();

    expect(ct.id).toBeDefined();
    expect(ct.refereeFormSchema.fields).toHaveLength(1);
    expect(ct.judgingFormSchema).toBeNull();
    createdIds.competitionTypeId = ct.id;
  });
});

describe("tournaments, classes, fields, teams", () => {
  it("creates a tournament with classes and fields", async () => {
    const [tournament] = await db
      .insert(schema.tournaments)
      .values({
        name: "Schema Test Tournament",
        competitionTypeId: createdIds.competitionTypeId!,
      })
      .returning();

    expect(tournament.id).toBeDefined();
    createdIds.tournamentId = tournament.id;

    const [cls] = await db
      .insert(schema.tournamentClasses)
      .values({ tournamentId: tournament.id, name: "Open" })
      .returning();
    createdIds.classId = cls.id;

    const [field] = await db
      .insert(schema.fields)
      .values({
        tournamentId: tournament.id,
        name: "Field 1",
        isPractice: false,
      })
      .returning();
    createdIds.fieldId = field.id;

    expect(cls.tournamentId).toBe(tournament.id);
    expect(field.isPractice).toBe(false);
  });

  it("creates a team linked to tournament and class", async () => {
    const [team] = await db
      .insert(schema.teams)
      .values({
        tournamentId: createdIds.tournamentId!,
        name: "Test Team",
        pitNumber: 99,
        classId: createdIds.classId!,
      })
      .returning();

    expect(team.id).toBeDefined();
    expect(team.pitNumber).toBe(99);
    createdIds.teamId = team.id;
  });
});

describe("matches and scores", () => {
  it("creates a match and prevents duplicate scores", async () => {
    const [match] = await db
      .insert(schema.matches)
      .values({
        tournamentId: createdIds.tournamentId!,
        fieldId: createdIds.fieldId!,
        matchType: "STANDARD",
        status: "PENDING",
      })
      .returning();

    expect(match.id).toBeDefined();
    createdIds.matchId = match.id;

    const [score] = await db
      .insert(schema.scores)
      .values({
        matchId: match.id,
        teamId: createdIds.teamId!,
        formData: { autonomousTasksCompleted: 3, teleopRings: 5 },
        calculatedScore: 55,
      })
      .returning();

    expect(score.calculatedScore).toBe(55);
    createdIds.scoreId = score.id;

    // Duplicate (matchId + teamId) should throw
    await expect(
      db.insert(schema.scores).values({
        matchId: match.id,
        teamId: createdIds.teamId!,
        formData: {},
        calculatedScore: 0,
      })
    ).rejects.toThrow();
  });
});
