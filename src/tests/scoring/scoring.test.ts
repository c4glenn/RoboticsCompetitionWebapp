/**
 * Integration tests for Phase 4 — scoring tRPC procedures.
 * Exercises submitMatchScore (including duplicate guard), submitInspection,
 * and submitJudgingScore against the real database.
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
import { appRouter } from "@/server/trpc/router";
import { createCallerFactory } from "@/server/trpc/init";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required. Ensure .env.local is loaded.");
}

const conn = postgres(connectionString, { max: 1 });
const db = drizzle(conn, { schema });

const ids: {
  refereeId?: string;
  judgeId?: string;
  otherId?: string;
  competitionTypeId?: string;
  competitionTypeWithJudgingId?: string;
  tournamentId?: string;
  tournamentWithJudgingId?: string;
  teamId?: string;
  team2Id?: string;
  matchId?: string;
  scoreId?: string;
} = {};

const createCaller = createCallerFactory(appRouter);

function refereeCaller() {
  return createCaller({
    db,
    session: {
      user: { id: ids.refereeId!, name: "Referee", email: "referee@score.test" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    },
    headers: new Headers(),
  });
}

function judgeCaller() {
  return createCaller({
    db,
    session: {
      user: { id: ids.judgeId!, name: "Judge", email: "judge@score.test" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    },
    headers: new Headers(),
  });
}

function otherCaller() {
  return createCaller({
    db,
    session: {
      user: { id: ids.otherId!, name: "Other", email: "other@score.test" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    },
    headers: new Headers(),
  });
}

function anonCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });

  const ts = Date.now();

  // Users
  const [referee] = await db
    .insert(schema.users)
    .values({
      name: "Referee",
      email: `referee-${ts}@score.test`,
      passwordHash: await bcrypt.hash("pw", 10),
    })
    .returning();
  ids.refereeId = referee.id;

  const [judge] = await db
    .insert(schema.users)
    .values({
      name: "Judge",
      email: `judge-${ts}@score.test`,
      passwordHash: await bcrypt.hash("pw", 10),
    })
    .returning();
  ids.judgeId = judge.id;

  const [other] = await db
    .insert(schema.users)
    .values({
      name: "Other",
      email: `other-${ts}@score.test`,
      passwordHash: await bcrypt.hash("pw", 10),
    })
    .returning();
  ids.otherId = other.id;

  // Competition type (no judging form)
  const scoringLogic: schema.ScoringLogic = {
    rules: [
      { field: "rings", pointsPer: 5 },
      { field: "parkLevel", values: { "1": 5, "2": 10 } },
    ],
  };
  const [ct] = await db
    .insert(schema.competitionTypes)
    .values({
      name: `Score Test Type ${ts}`,
      inspectionFormSchema: {
        fields: [{ name: "weight", label: "Weight (kg)", type: "number", required: true }],
      },
      refereeFormSchema: {
        fields: [
          { name: "rings", label: "Rings", type: "number", min: 0 },
          { name: "parkLevel", label: "Park Level", type: "select", options: [
            { value: "1", label: "Level 1" },
            { value: "2", label: "Level 2" },
          ]},
        ],
      },
      scoringLogic,
    })
    .returning();
  ids.competitionTypeId = ct.id;

  // Competition type with judging
  const [ctj] = await db
    .insert(schema.competitionTypes)
    .values({
      name: `Score Test Type Judging ${ts}`,
      inspectionFormSchema: { fields: [] },
      refereeFormSchema: { fields: [{ name: "rings", label: "Rings", type: "number", min: 0 }] },
      judgingFormSchema: { fields: [{ name: "presentation", label: "Presentation", type: "number", min: 0 }] },
      scoringLogic: { rules: [{ field: "rings", pointsPer: 5 }, { field: "presentation", pointsPer: 3 }] },
    })
    .returning();
  ids.competitionTypeWithJudgingId = ctj.id;

  // Tournament (no judging)
  const [tournament] = await db
    .insert(schema.tournaments)
    .values({ name: `Score Tournament ${ts}`, competitionTypeId: ct.id })
    .returning();
  ids.tournamentId = tournament.id;

  // Tournament with judging
  const [tj] = await db
    .insert(schema.tournaments)
    .values({ name: `Score Tournament Judging ${ts}`, competitionTypeId: ctj.id })
    .returning();
  ids.tournamentWithJudgingId = tj.id;

  // Assign roles
  await db.insert(schema.userTournamentRoles).values([
    { userId: ids.refereeId!, tournamentId: tournament.id, role: "REFEREE" },
    { userId: ids.judgeId!, tournamentId: tournament.id, role: "JUDGE" },
    { userId: ids.judgeId!, tournamentId: tj.id, role: "JUDGE" },
    { userId: ids.refereeId!, tournamentId: tj.id, role: "REFEREE" },
  ]);

  // Class + teams
  const [cls] = await db
    .insert(schema.tournamentClasses)
    .values({ tournamentId: tournament.id, name: "Open" })
    .returning();

  const [team1] = await db
    .insert(schema.teams)
    .values({ tournamentId: tournament.id, name: "Team Scoring 1", classId: cls.id })
    .returning();
  ids.teamId = team1.id;

  const [team2] = await db
    .insert(schema.teams)
    .values({ tournamentId: tournament.id, name: "Team Scoring 2", classId: cls.id })
    .returning();
  ids.team2Id = team2.id;

  // Match
  const [match] = await db
    .insert(schema.matches)
    .values({ tournamentId: tournament.id, matchType: "STANDARD" })
    .returning();
  ids.matchId = match.id;

  // Assign both teams to the match
  await db.insert(schema.matchTeams).values([
    { matchId: match.id, teamId: team1.id, side: "HOME" },
    { matchId: match.id, teamId: team2.id, side: "AWAY" },
  ]);
});

afterAll(async () => {
  if (ids.matchId) {
    await db.delete(schema.matches).where(eq(schema.matches.id, ids.matchId));
  }
  if (ids.tournamentId) {
    await db.delete(schema.tournaments).where(eq(schema.tournaments.id, ids.tournamentId));
  }
  if (ids.tournamentWithJudgingId) {
    await db.delete(schema.tournaments).where(eq(schema.tournaments.id, ids.tournamentWithJudgingId));
  }
  if (ids.competitionTypeId) {
    await db.delete(schema.competitionTypes).where(eq(schema.competitionTypes.id, ids.competitionTypeId));
  }
  if (ids.competitionTypeWithJudgingId) {
    await db.delete(schema.competitionTypes).where(eq(schema.competitionTypes.id, ids.competitionTypeWithJudgingId));
  }
  if (ids.otherId) await db.delete(schema.users).where(eq(schema.users.id, ids.otherId));
  if (ids.judgeId) await db.delete(schema.users).where(eq(schema.users.id, ids.judgeId));
  if (ids.refereeId) await db.delete(schema.users).where(eq(schema.users.id, ids.refereeId));
  await conn.end();
});

// ── scoring.listMatches ───────────────────────────────────────────────────────

describe("scoring.listMatches", () => {
  it("referee can list matches", async () => {
    const list = await refereeCaller().scoring.listMatches({
      tournamentId: ids.tournamentId!,
    });
    expect(list.some((m) => m.id === ids.matchId)).toBe(true);
  });

  it("anon is rejected", async () => {
    await expect(
      anonCaller().scoring.listMatches({ tournamentId: ids.tournamentId! })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("user without role is FORBIDDEN", async () => {
    await expect(
      otherCaller().scoring.listMatches({ tournamentId: ids.tournamentId! })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── scoring.submitMatchScore ──────────────────────────────────────────────────

describe("scoring.submitMatchScore", () => {
  it("referee can submit a score — calculatedScore is correct", async () => {
    // rings=4 → 20pts, parkLevel="2" → 10pts → total 30
    const score = await refereeCaller().scoring.submitMatchScore({
      matchId: ids.matchId!,
      teamId: ids.teamId!,
      tournamentId: ids.tournamentId!,
      formData: { rings: 4, parkLevel: "2" },
    });

    expect(score.calculatedScore).toBe(30);
    expect(score.teamId).toBe(ids.teamId);
    ids.scoreId = score.id;
  });

  it("duplicate submission throws CONFLICT", async () => {
    await expect(
      refereeCaller().scoring.submitMatchScore({
        matchId: ids.matchId!,
        teamId: ids.teamId!,
        tournamentId: ids.tournamentId!,
        formData: { rings: 1 },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("team not in match throws BAD_REQUEST", async () => {
    // Create a team that is NOT in the match
    const [cls] = await db.select().from(schema.tournamentClasses)
      .where(eq(schema.tournamentClasses.tournamentId, ids.tournamentId!));
    const [outsider] = await db
      .insert(schema.teams)
      .values({ tournamentId: ids.tournamentId!, name: "Outsider", classId: cls.id })
      .returning();

    await expect(
      refereeCaller().scoring.submitMatchScore({
        matchId: ids.matchId!,
        teamId: outsider.id,
        tournamentId: ids.tournamentId!,
        formData: { rings: 1 },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await db.delete(schema.teams).where(eq(schema.teams.id, outsider.id));
  });

  it("user without referee role is FORBIDDEN", async () => {
    await expect(
      otherCaller().scoring.submitMatchScore({
        matchId: ids.matchId!,
        teamId: ids.team2Id!,
        tournamentId: ids.tournamentId!,
        formData: { rings: 2 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── scoring.getMatchScores ────────────────────────────────────────────────────

describe("scoring.getMatchScores", () => {
  it("returns submitted scores for a match", async () => {
    const scores = await refereeCaller().scoring.getMatchScores({
      matchId: ids.matchId!,
    });
    expect(scores.some((s) => s.teamId === ids.teamId)).toBe(true);
    expect(scores.find((s) => s.teamId === ids.teamId)?.calculatedScore).toBe(30);
  });
});

// ── scoring.submitInspection ──────────────────────────────────────────────────

describe("scoring.submitInspection", () => {
  it("referee can submit a passing inspection", async () => {
    const result = await refereeCaller().scoring.submitInspection({
      teamId: ids.teamId!,
      tournamentId: ids.tournamentId!,
      formData: { weight: 3.2 },
      passed: true,
    });
    expect(result.passed).toBe(true);
    expect(result.teamId).toBe(ids.teamId);
  });

  it("referee can submit a failing inspection for the same team (no unique constraint)", async () => {
    const result = await refereeCaller().scoring.submitInspection({
      teamId: ids.teamId!,
      tournamentId: ids.tournamentId!,
      formData: { weight: 5.0 },
      passed: false,
    });
    expect(result.passed).toBe(false);
  });

  it("user without role is FORBIDDEN", async () => {
    await expect(
      otherCaller().scoring.submitInspection({
        teamId: ids.teamId!,
        tournamentId: ids.tournamentId!,
        formData: {},
        passed: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── scoring.getTeamInspections ────────────────────────────────────────────────

describe("scoring.getTeamInspections", () => {
  it("returns inspection history for a team", async () => {
    const list = await refereeCaller().scoring.getTeamInspections({
      teamId: ids.teamId!,
      tournamentId: ids.tournamentId!,
    });
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((i) => i.passed === true)).toBe(true);
    expect(list.some((i) => i.passed === false)).toBe(true);
  });
});

// ── scoring.submitJudgingScore ────────────────────────────────────────────────

describe("scoring.submitJudgingScore", () => {
  it("judge can submit a judging score", async () => {
    // Create a team in the judging tournament
    const [cls] = await db.select().from(schema.tournamentClasses)
      .where(eq(schema.tournamentClasses.tournamentId, ids.tournamentWithJudgingId!));

    let teamForJudging: { id: string };
    if (cls) {
      [teamForJudging] = await db
        .insert(schema.teams)
        .values({ tournamentId: ids.tournamentWithJudgingId!, name: "Judged Team", classId: cls.id })
        .returning();
    } else {
      const [newCls] = await db
        .insert(schema.tournamentClasses)
        .values({ tournamentId: ids.tournamentWithJudgingId!, name: "Open" })
        .returning();
      [teamForJudging] = await db
        .insert(schema.teams)
        .values({ tournamentId: ids.tournamentWithJudgingId!, name: "Judged Team", classId: newCls.id })
        .returning();
    }

    // presentation=10 → 30pts
    const result = await judgeCaller().scoring.submitJudgingScore({
      teamId: teamForJudging.id,
      tournamentId: ids.tournamentWithJudgingId!,
      formData: { presentation: 10 },
    });
    expect(result.calculatedScore).toBe(30);

    await db.delete(schema.teams).where(eq(schema.teams.id, teamForJudging.id));
  });

  it("throws BAD_REQUEST when judging form not configured", async () => {
    // judge has JUDGE role in tournamentId but that tournament has no judgingFormSchema
    await expect(
      judgeCaller().scoring.submitJudgingScore({
        teamId: ids.teamId!,
        tournamentId: ids.tournamentId!,
        formData: { presentation: 10 },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("user without judge role is FORBIDDEN", async () => {
    await expect(
      otherCaller().scoring.submitJudgingScore({
        teamId: ids.teamId!,
        tournamentId: ids.tournamentWithJudgingId!,
        formData: {},
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
