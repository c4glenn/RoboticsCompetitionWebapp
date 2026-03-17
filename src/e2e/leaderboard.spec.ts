/**
 * Playwright E2E — Phase 5: Live Leaderboard via SSE
 *
 * Verifies:
 *  1. The leaderboard page renders.
 *  2. The SSE stream endpoint sends valid JSON events.
 *  3. Submitting a score in one context updates the leaderboard in another
 *     within ~5s (one poll interval), without a page reload.
 *
 * Requires: `pnpm dev` running and DATABASE_URL in .env.local.
 * Run with: pnpm test:e2e
 */

import { test, expect, request } from "@playwright/test";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

// ── Test data setup ────────────────────────────────────────────────────────────

const connStr = process.env.DATABASE_URL;
if (!connStr) throw new Error("DATABASE_URL is required");

const conn = postgres(connStr, { max: 1 });
const db = drizzle(conn, { schema });

const ids: {
  directorId?: string;
  refereeId?: string;
  competitionTypeId?: string;
  tournamentId?: string;
  classId?: string;
  teamAId?: string;
  teamBId?: string;
  matchId?: string;
} = {};

test.beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });

  const ts = Date.now();
  const pw = await bcrypt.hash("pw123456", 10);

  const [director] = await db
    .insert(schema.users)
    .values({ name: "E2E Director", email: `e2e-dir-${ts}@test.local`, passwordHash: pw })
    .returning();
  ids.directorId = director.id;

  const [referee] = await db
    .insert(schema.users)
    .values({ name: "E2E Referee", email: `e2e-ref-${ts}@test.local`, passwordHash: pw })
    .returning();
  ids.refereeId = referee.id;

  const [ct] = await db
    .insert(schema.competitionTypes)
    .values({
      name: `E2E Comp ${ts}`,
      inspectionFormSchema: { fields: [] },
      refereeFormSchema: {
        fields: [{ name: "rings", label: "Rings", type: "number", min: 0 }],
      },
      scoringLogic: { rules: [{ field: "rings", pointsPer: 10 }] },
    })
    .returning();
  ids.competitionTypeId = ct.id;

  const [tournament] = await db
    .insert(schema.tournaments)
    .values({ name: `E2E Tournament ${ts}`, competitionTypeId: ct.id })
    .returning();
  ids.tournamentId = tournament.id;

  const [cls] = await db
    .insert(schema.tournamentClasses)
    .values({ tournamentId: tournament.id, name: "Open" })
    .returning();
  ids.classId = cls.id;

  const [teamA] = await db
    .insert(schema.teams)
    .values({ tournamentId: tournament.id, name: "Team Alpha E2E", classId: cls.id })
    .returning();
  ids.teamAId = teamA.id;

  const [teamB] = await db
    .insert(schema.teams)
    .values({ tournamentId: tournament.id, name: "Team Beta E2E", classId: cls.id })
    .returning();
  ids.teamBId = teamB.id;

  const [match] = await db
    .insert(schema.matches)
    .values({ tournamentId: tournament.id, matchType: "STANDARD" })
    .returning();
  ids.matchId = match.id;

  await db.insert(schema.matchTeams).values([
    { matchId: match.id, teamId: teamA.id, side: "HOME" },
    { matchId: match.id, teamId: teamB.id, side: "AWAY" },
  ]);

  await db.insert(schema.userTournamentRoles).values([
    { userId: ids.directorId!, tournamentId: tournament.id, role: "DIRECTOR" },
    { userId: ids.refereeId!, tournamentId: tournament.id, role: "REFEREE" },
  ]);
});

test.afterAll(async () => {
  if (ids.matchId)
    await db.delete(schema.matches).where(eq(schema.matches.id, ids.matchId));
  if (ids.tournamentId)
    await db.delete(schema.tournaments).where(eq(schema.tournaments.id, ids.tournamentId));
  if (ids.competitionTypeId)
    await db.delete(schema.competitionTypes).where(eq(schema.competitionTypes.id, ids.competitionTypeId));
  if (ids.refereeId)
    await db.delete(schema.users).where(eq(schema.users.id, ids.refereeId));
  if (ids.directorId)
    await db.delete(schema.users).where(eq(schema.users.id, ids.directorId));
  await conn.end();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test("leaderboard page renders with all teams", async ({ page }) => {
  await page.goto(`/tournaments/${ids.tournamentId}/leaderboard`);

  await expect(page.getByText("Team Alpha E2E")).toBeVisible();
  await expect(page.getByText("Team Beta E2E")).toBeVisible();
});

test("SSE stream sends a valid JSON event immediately", async () => {
  const ctx = await request.newContext();
  const response = await ctx.fetch(
    `/api/tournaments/${ids.tournamentId}/leaderboard/stream`,
    { headers: { Accept: "text/event-stream" } }
  );

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/event-stream");

  // Read the first chunk which should contain the initial `data:` event
  const bodyStream = await response.body();
  const text = bodyStream.toString("utf-8");

  expect(text).toMatch(/^data: /m);
  const dataLine = text
    .split("\n")
    .find((l) => l.startsWith("data: "))!
    .slice("data: ".length);
  const parsed = JSON.parse(dataLine) as { teams: unknown[]; updatedAt: string };
  expect(Array.isArray(parsed.teams)).toBe(true);
  expect(typeof parsed.updatedAt).toBe("string");

  await ctx.dispose();
});

test("score submitted → leaderboard updates without reload", async ({
  browser,
}) => {
  // Page B: viewer watching the leaderboard
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(`/tournaments/${ids.tournamentId}/leaderboard`);

  // Initial state — Team Alpha E2E should show 0 pts
  const alphaInitial = viewerPage
    .getByRole("row", { name: /Team Alpha E2E/ })
    .getByRole("cell")
    .last();
  await expect(alphaInitial).toHaveText("0");

  // Insert a score directly into the DB (simulates a referee submitting)
  await db.insert(schema.scores).values({
    matchId: ids.matchId!,
    teamId: ids.teamAId!,
    refereeUserId: ids.refereeId!,
    formData: { rings: 7 },
    calculatedScore: 70,
  });

  // Wait for the SSE poll to push the update (up to 8s — one poll interval + buffer)
  await expect(alphaInitial).toHaveText("70", { timeout: 8_000 });

  // Verify no navigation happened (URL unchanged)
  expect(viewerPage.url()).toContain(`/tournaments/${ids.tournamentId}/leaderboard`);

  await viewerContext.close();
});
