/**
 * Integration tests for Phase 3 — tRPC CRUD procedures.
 * Uses createCallerFactory to call procedures directly against the real DB.
 *
 * Run with: pnpm test:run
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock @/server/auth so next-auth doesn't try to import next/server in the
// test environment. The tRPC context is provided directly via createCaller, so
// auth() is never called in these tests.
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

// Seeded IDs
const ids: {
  directorId?: string;
  otherUserId?: string;
  competitionTypeId?: string;
  tournamentId?: string;
  classId?: string;
  teamId?: string;
  fieldId?: string;
} = {};

// Build callers
const createCaller = createCallerFactory(appRouter);

function directorCaller() {
  return createCaller({
    db,
    session: {
      user: { id: ids.directorId!, name: "Director", email: "director@test.local" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    },
    headers: new Headers(),
  });
}

function otherCaller() {
  return createCaller({
    db,
    session: {
      user: { id: ids.otherUserId!, name: "Other", email: "other@test.local" },
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

  // Create test users
  const [director] = await db
    .insert(schema.users)
    .values({
      name: "Director",
      email: `director-crud-${Date.now()}@test.local`,
      passwordHash: await bcrypt.hash("password", 10),
    })
    .returning();
  ids.directorId = director.id;

  const [other] = await db
    .insert(schema.users)
    .values({
      name: "Other",
      email: `other-crud-${Date.now()}@test.local`,
      passwordHash: await bcrypt.hash("password", 10),
    })
    .returning();
  ids.otherUserId = other.id;

  // Create a competition type
  const [ct] = await db
    .insert(schema.competitionTypes)
    .values({
      name: `CRUD Test Type ${Date.now()}`,
      inspectionFormSchema: { fields: [] },
      refereeFormSchema: { fields: [] },
      scoringLogic: { rules: [] },
    })
    .returning();
  ids.competitionTypeId = ct.id;
});

afterAll(async () => {
  // Clean up in reverse FK order
  if (ids.fieldId)
    await db.delete(schema.fields).where(eq(schema.fields.id, ids.fieldId));
  if (ids.teamId)
    await db.delete(schema.teams).where(eq(schema.teams.id, ids.teamId));
  if (ids.tournamentId)
    await db
      .delete(schema.tournaments)
      .where(eq(schema.tournaments.id, ids.tournamentId));
  if (ids.competitionTypeId)
    await db
      .delete(schema.competitionTypes)
      .where(eq(schema.competitionTypes.id, ids.competitionTypeId));
  if (ids.otherUserId)
    await db.delete(schema.users).where(eq(schema.users.id, ids.otherUserId));
  if (ids.directorId)
    await db.delete(schema.users).where(eq(schema.users.id, ids.directorId));

  await conn.end();
});

// ─── competitionTypes ─────────────────────────────────────────────────────────

describe("competitionTypes", () => {
  it("lists competition types (public)", async () => {
    const list = await anonCaller().competitionTypes.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it("gets a competition type by id", async () => {
    const ct = await anonCaller().competitionTypes.getById({
      id: ids.competitionTypeId!,
    });
    expect(ct.id).toBe(ids.competitionTypeId);
  });

  it("throws NOT_FOUND for unknown id", async () => {
    await expect(
      anonCaller().competitionTypes.getById({
        id: "00000000-0000-0000-0000-000000000000",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires auth to create", async () => {
    await expect(
      anonCaller().competitionTypes.create({
        name: "Anon Type",
        inspectionFormSchema: { fields: [] },
        refereeFormSchema: { fields: [] },
        scoringLogic: { rules: [] },
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── tournaments ──────────────────────────────────────────────────────────────

describe("tournaments.create", () => {
  it("creates a tournament and auto-assigns DIRECTOR role", async () => {
    const tournament = await directorCaller().tournaments.create({
      name: `CRUD Test Tournament ${Date.now()}`,
      competitionTypeId: ids.competitionTypeId!,
      classes: ["Collegiate", "High School"],
    });

    expect(tournament.id).toBeDefined();
    ids.tournamentId = tournament.id;

    // Director should have a DIRECTOR role
    const roles = await db.query.userTournamentRoles.findMany({
      where: eq(schema.userTournamentRoles.tournamentId, tournament.id),
    });
    expect(roles.some((r) => r.role === "DIRECTOR" && r.userId === ids.directorId)).toBe(true);

    // Classes should be created
    const classes = await db.query.tournamentClasses.findMany({
      where: eq(schema.tournamentClasses.tournamentId, tournament.id),
    });
    expect(classes).toHaveLength(2);
    ids.classId = classes[0].id;
  });
});

describe("tournaments.getById", () => {
  it("returns tournament with relations", async () => {
    const t = await anonCaller().tournaments.getById({ id: ids.tournamentId! });
    expect(t.classes.length).toBeGreaterThanOrEqual(2);
    expect(t.competitionType).toBeDefined();
  });
});

describe("tournaments.update", () => {
  it("allows director to update name", async () => {
    const updated = await directorCaller().tournaments.update({
      id: ids.tournamentId!,
      name: "Updated Tournament Name",
    });
    expect(updated.name).toBe("Updated Tournament Name");
  });

  it("blocks non-director from updating", async () => {
    await expect(
      otherCaller().tournaments.update({
        id: ids.tournamentId!,
        name: "Hacked Name",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires auth to update", async () => {
    await expect(
      anonCaller().tournaments.update({
        id: ids.tournamentId!,
        name: "Anon Name",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("tournaments.addClass / removeClass", () => {
  it("allows director to add and remove a class", async () => {
    const cls = await directorCaller().tournaments.addClass({
      tournamentId: ids.tournamentId!,
      name: "Graduate",
    });
    expect(cls.name).toBe("Graduate");

    await directorCaller().tournaments.removeClass({
      classId: cls.id,
      tournamentId: ids.tournamentId!,
    });

    const classes = await db.query.tournamentClasses.findMany({
      where: eq(schema.tournamentClasses.tournamentId, ids.tournamentId!),
    });
    expect(classes.find((c) => c.id === cls.id)).toBeUndefined();
  });
});

// ─── teams ────────────────────────────────────────────────────────────────────

describe("teams", () => {
  it("director can create a team", async () => {
    const team = await directorCaller().teams.create({
      tournamentId: ids.tournamentId!,
      name: "Team Alpha",
      classId: ids.classId!,
      pitNumber: 7,
      schoolOrOrg: "Test University",
    });
    expect(team.name).toBe("Team Alpha");
    ids.teamId = team.id;
  });

  it("non-director cannot create a team", async () => {
    await expect(
      otherCaller().teams.create({
        tournamentId: ids.tournamentId!,
        name: "Intruder Team",
        classId: ids.classId!,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists teams for a tournament", async () => {
    const list = await directorCaller().teams.list({
      tournamentId: ids.tournamentId!,
    });
    expect(list.some((t) => t.id === ids.teamId)).toBe(true);
  });

  it("director can update a team", async () => {
    const updated = await directorCaller().teams.update({
      id: ids.teamId!,
      tournamentId: ids.tournamentId!,
      name: "Team Alpha (Updated)",
    });
    expect(updated.name).toBe("Team Alpha (Updated)");
  });

  it("director can delete a team", async () => {
    // Create a temp team then delete it
    const temp = await directorCaller().teams.create({
      tournamentId: ids.tournamentId!,
      name: "Temp Team",
      classId: ids.classId!,
    });
    await directorCaller().teams.delete({
      id: temp.id,
      tournamentId: ids.tournamentId!,
    });
    const list = await directorCaller().teams.list({
      tournamentId: ids.tournamentId!,
    });
    expect(list.find((t) => t.id === temp.id)).toBeUndefined();
  });
});

// ─── fields ───────────────────────────────────────────────────────────────────

describe("fields", () => {
  it("director can create a field", async () => {
    const field = await directorCaller().fields.create({
      tournamentId: ids.tournamentId!,
      name: "Field 1",
      isPractice: false,
    });
    expect(field.name).toBe("Field 1");
    ids.fieldId = field.id;
  });

  it("non-director cannot create a field", async () => {
    await expect(
      otherCaller().fields.create({
        tournamentId: ids.tournamentId!,
        name: "Intruder Field",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists fields for a tournament", async () => {
    const list = await directorCaller().fields.list({
      tournamentId: ids.tournamentId!,
    });
    expect(list.some((f) => f.id === ids.fieldId)).toBe(true);
  });

  it("director can update a field", async () => {
    const updated = await directorCaller().fields.update({
      id: ids.fieldId!,
      tournamentId: ids.tournamentId!,
      isPractice: true,
    });
    expect(updated.isPractice).toBe(true);
  });

  it("director can delete a field", async () => {
    const temp = await directorCaller().fields.create({
      tournamentId: ids.tournamentId!,
      name: "Temp Field",
    });
    await directorCaller().fields.delete({
      id: temp.id,
      tournamentId: ids.tournamentId!,
    });
    const list = await directorCaller().fields.list({
      tournamentId: ids.tournamentId!,
    });
    expect(list.find((f) => f.id === temp.id)).toBeUndefined();
  });
});

// ─── roles ────────────────────────────────────────────────────────────────────

describe("roles", () => {
  it("director can list roles", async () => {
    const list = await directorCaller().roles.list({
      tournamentId: ids.tournamentId!,
    });
    expect(list.some((r) => r.role === "DIRECTOR")).toBe(true);
  });

  it("non-director cannot list roles", async () => {
    await expect(
      otherCaller().roles.list({ tournamentId: ids.tournamentId! })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("director can assign and revoke a role", async () => {
    await directorCaller().roles.assign({
      tournamentId: ids.tournamentId!,
      userId: ids.otherUserId!,
      role: "REFEREE",
    });

    const list = await directorCaller().roles.list({
      tournamentId: ids.tournamentId!,
    });
    expect(list.some((r) => r.userId === ids.otherUserId && r.role === "REFEREE")).toBe(true);

    await directorCaller().roles.revoke({
      tournamentId: ids.tournamentId!,
      userId: ids.otherUserId!,
      role: "REFEREE",
    });

    const listAfter = await directorCaller().roles.list({
      tournamentId: ids.tournamentId!,
    });
    expect(
      listAfter.some((r) => r.userId === ids.otherUserId && r.role === "REFEREE")
    ).toBe(false);
  });

  it("director cannot revoke own DIRECTOR role", async () => {
    await expect(
      directorCaller().roles.revoke({
        tournamentId: ids.tournamentId!,
        userId: ids.directorId!,
        role: "DIRECTOR",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
