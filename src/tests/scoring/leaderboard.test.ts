/**
 * Integration tests for Phase 5 — leaderboard query and tRPC procedure.
 *
 * Run with: pnpm test:run
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/server/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getLeaderboard } from "@/db/queries/leaderboard";
import { appRouter } from "@/server/trpc/router";
import { createCallerFactory } from "@/server/trpc/init";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const conn = postgres(connectionString, { max: 1 });
const db = drizzle(conn, { schema });

const ids: {
  userId?: string;
  competitionTypeId?: string;
  tournamentId?: string;
  classId?: string;
  team1Id?: string;
  team2Id?: string;
  matchId?: string;
} = {};

const createCaller = createCallerFactory(appRouter);

function anonCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });

  const ts = Date.now();

  const [user] = await db
    .insert(schema.users)
    .values({
      name: "LB Referee",
      email: `lb-ref-${ts}@test.local`,
      passwordHash: await bcrypt.hash("pw", 10),
    })
    .returning();
  ids.userId = user.id;

  const [ct] = await db
    .insert(schema.competitionTypes)
    .values({
      name: `LB CompType ${ts}`,
      inspectionFormSchema: { fields: [] },
      refereeFormSchema: { fields: [{ name: "rings", label: "Rings", type: "number", min: 0 }] },
      judgingFormSchema: { fields: [{ name: "design", label: "Design", type: "number", min: 0 }] },
      scoringLogic: {
        rules: [
          { field: "rings", pointsPer: 10 },
          { field: "design", pointsPer: 5 },
        ],
      },
    })
    .returning();
  ids.competitionTypeId = ct.id;

  const [tournament] = await db
    .insert(schema.tournaments)
    .values({ name: `LB Tournament ${ts}`, competitionTypeId: ct.id })
    .returning();
  ids.tournamentId = tournament.id;

  const [cls] = await db
    .insert(schema.tournamentClasses)
    .values({ tournamentId: tournament.id, name: "Open" })
    .returning();
  ids.classId = cls.id;

  const [t1] = await db
    .insert(schema.teams)
    .values({ tournamentId: tournament.id, name: "Alpha", classId: cls.id, pitNumber: 1 })
    .returning();
  ids.team1Id = t1.id;

  const [t2] = await db
    .insert(schema.teams)
    .values({ tournamentId: tournament.id, name: "Beta", classId: cls.id, pitNumber: 2 })
    .returning();
  ids.team2Id = t2.id;

  const [match] = await db
    .insert(schema.matches)
    .values({ tournamentId: tournament.id, matchType: "STANDARD" })
    .returning();
  ids.matchId = match.id;

  await db.insert(schema.matchTeams).values([
    { matchId: match.id, teamId: t1.id, side: "HOME" },
    { matchId: match.id, teamId: t2.id, side: "AWAY" },
  ]);
});

afterAll(async () => {
  if (ids.matchId)
    await db.delete(schema.matches).where(eq(schema.matches.id, ids.matchId));
  if (ids.tournamentId)
    await db.delete(schema.tournaments).where(eq(schema.tournaments.id, ids.tournamentId));
  if (ids.competitionTypeId)
    await db.delete(schema.competitionTypes).where(eq(schema.competitionTypes.id, ids.competitionTypeId));
  if (ids.userId)
    await db.delete(schema.users).where(eq(schema.users.id, ids.userId));
  await conn.end();
});

// ── getLeaderboard (db query) ─────────────────────────────────────────────────

describe("getLeaderboard query", () => {
  it("returns all teams with zero scores initially", async () => {
    const rows = await getLeaderboard(ids.tournamentId!, db);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.matchScore === 0)).toBe(true);
    expect(rows.every((r) => r.totalScore === 0)).toBe(true);
  });

  it("reflects a submitted match score immediately", async () => {
    // Insert a score directly
    await db.insert(schema.scores).values({
      matchId: ids.matchId!,
      teamId: ids.team1Id!,
      refereeUserId: ids.userId!,
      formData: { rings: 5 },
      calculatedScore: 50, // 5 rings × 10
    });

    const rows = await getLeaderboard(ids.tournamentId!, db);
    const alpha = rows.find((r) => r.teamId === ids.team1Id);
    expect(alpha?.matchScore).toBe(50);
    expect(alpha?.totalScore).toBe(50);

    // Alpha (50) should rank above Beta (0)
    expect(rows[0].teamId).toBe(ids.team1Id);
    expect(rows[1].teamId).toBe(ids.team2Id);
  });

  it("includes judging scores in totalScore", async () => {
    await db.insert(schema.judgingScores).values({
      teamId: ids.team1Id!,
      tournamentId: ids.tournamentId!,
      judgeUserId: ids.userId!,
      formData: { design: 4 },
      calculatedScore: 20, // 4 × 5
    });

    const rows = await getLeaderboard(ids.tournamentId!, db);
    const alpha = rows.find((r) => r.teamId === ids.team1Id);
    expect(alpha?.matchScore).toBe(50);
    expect(alpha?.judgingScore).toBe(20);
    expect(alpha?.totalScore).toBe(70);
  });

  it("sums multiple match scores for the same team", async () => {
    // Create a second match for team2
    const [match2] = await db
      .insert(schema.matches)
      .values({ tournamentId: ids.tournamentId!, matchType: "STANDARD" })
      .returning();

    await db.insert(schema.matchTeams).values([
      { matchId: match2.id, teamId: ids.team2Id!, side: "HOME" },
    ]);

    await db.insert(schema.scores).values([
      { matchId: match2.id, teamId: ids.team2Id!, refereeUserId: ids.userId!, formData: { rings: 3 }, calculatedScore: 30 },
    ]);

    const rows = await getLeaderboard(ids.tournamentId!, db);
    const beta = rows.find((r) => r.teamId === ids.team2Id);
    expect(beta?.matchScore).toBe(30);

    // Clean up the extra match
    await db.delete(schema.matches).where(eq(schema.matches.id, match2.id));
  });

  it("returns rows ordered by totalScore descending", async () => {
    const rows = await getLeaderboard(ids.tournamentId!, db);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].totalScore).toBeGreaterThanOrEqual(rows[i].totalScore);
    }
  });
});

// ── leaderboard.get (tRPC) ────────────────────────────────────────────────────

describe("leaderboard.get tRPC procedure", () => {
  it("is publicly accessible", async () => {
    const rows = await anonCaller().leaderboard.get({
      tournamentId: ids.tournamentId!,
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("returns the same data as the direct query", async () => {
    const [direct, tRPCResult] = await Promise.all([
      getLeaderboard(ids.tournamentId!, db),
      anonCaller().leaderboard.get({ tournamentId: ids.tournamentId! }),
    ]);
    // Same number of teams
    expect(tRPCResult.length).toBe(direct.length);
  });

  it("returns empty array for unknown tournament", async () => {
    const rows = await anonCaller().leaderboard.get({
      tournamentId: "00000000-0000-0000-0000-000000000000",
    });
    expect(rows).toEqual([]);
  });
});
