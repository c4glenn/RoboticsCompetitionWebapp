import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

const conn = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(conn, { schema });

async function seed() {
  console.log("Seeding database...");

  // ── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("password123", 10);

  const [director, referee, judge, teamLead1, teamLead2] = await db
    .insert(schema.users)
    .values([
      { name: "Alice Director", email: "director@example.com", passwordHash },
      { name: "Bob Referee", email: "referee@example.com", passwordHash },
      { name: "Carol Judge", email: "judge@example.com", passwordHash },
      { name: "Dave TeamLead", email: "teamlead1@example.com", passwordHash },
      { name: "Eve TeamLead", email: "teamlead2@example.com", passwordHash },
    ])
    .returning();

  // ── Competition Type ───────────────────────────────────────────────────────
  const [compType] = await db
    .insert(schema.competitionTypes)
    .values({
      name: "IEEE Robotics 2026",
      inspectionFormSchema: {
        fields: [
          {
            name: "weightUnderLimit",
            label: "Robot weight is under 5kg?",
            type: "checkbox",
            required: true,
          },
          {
            name: "dimensionsPass",
            label: "Robot dimensions pass (30x30x30cm)?",
            type: "checkbox",
            required: true,
          },
          {
            name: "safetyInspectionPass",
            label: "Safety inspection pass?",
            type: "checkbox",
            required: true,
          },
          {
            name: "notes",
            label: "Inspector notes",
            type: "textarea",
            required: false,
          },
        ],
      },
      refereeFormSchema: {
        fields: [
          {
            name: "autonomousTasksCompleted",
            label: "Autonomous tasks completed",
            type: "number",
            min: 0,
            max: 5,
            required: true,
          },
          {
            name: "teleopRings",
            label: "Teleop rings scored",
            type: "number",
            min: 0,
            max: 20,
            required: true,
          },
          {
            name: "endgameParkLevel",
            label: "Endgame park level",
            type: "select",
            options: [
              { value: "0", label: "No park" },
              { value: "1", label: "Level 1" },
              { value: "2", label: "Level 2" },
              { value: "3", label: "Level 3" },
            ],
            required: true,
          },
          {
            name: "penalties",
            label: "Penalties",
            type: "number",
            min: 0,
            max: 10,
            required: true,
          },
        ],
      },
      judgingFormSchema: {
        fields: [
          {
            name: "engineeringNotebook",
            label: "Engineering notebook score (0-30)",
            type: "number",
            min: 0,
            max: 30,
            required: true,
          },
          {
            name: "presentation",
            label: "Presentation score (0-20)",
            type: "number",
            min: 0,
            max: 20,
            required: true,
          },
          {
            name: "innovation",
            label: "Innovation score (0-10)",
            type: "number",
            min: 0,
            max: 10,
            required: true,
          },
        ],
      },
      scoringLogic: {
        rules: [
          { field: "autonomousTasksCompleted", pointsPer: 10 },
          { field: "teleopRings", pointsPer: 5 },
          {
            field: "endgameParkLevel",
            values: { "0": 0, "1": 5, "2": 10, "3": 15 },
          },
          { field: "penalties", pointsPer: -5 },
        ],
      },
    })
    .returning();

  // ── Tournament ─────────────────────────────────────────────────────────────
  const [tournament] = await db
    .insert(schema.tournaments)
    .values({
      name: "IEEE Region 5 2026 Robotics",
      competitionTypeId: compType.id,
      matchesPerTeam: 3,
      scoreAggregation: { method: "best_n", n: 2 },
    })
    .returning();

  // ── Classes ────────────────────────────────────────────────────────────────
  const [collegiate, highSchool] = await db
    .insert(schema.tournamentClasses)
    .values([
      { tournamentId: tournament.id, name: "Collegiate" },
      { tournamentId: tournament.id, name: "High School" },
    ])
    .returning();

  // ── Fields ─────────────────────────────────────────────────────────────────
  await db.insert(schema.fields).values([
    { tournamentId: tournament.id, name: "Field A", isPractice: false },
    { tournamentId: tournament.id, name: "Field B", isPractice: false },
    { tournamentId: tournament.id, name: "Practice Field 1", isPractice: true },
  ]);

  // ── Teams ──────────────────────────────────────────────────────────────────
  await db.insert(schema.teams).values([
    {
      tournamentId: tournament.id,
      name: "Circuit Breakers",
      pitNumber: 1,
      classId: collegiate.id,
      schoolOrOrg: "State University",
      teamLeadUserId: teamLead1.id,
    },
    {
      tournamentId: tournament.id,
      name: "Voltage Vipers",
      pitNumber: 2,
      classId: collegiate.id,
      schoolOrOrg: "Tech Institute",
      teamLeadUserId: teamLead2.id,
    },
    {
      tournamentId: tournament.id,
      name: "Byte Force",
      pitNumber: 3,
      classId: highSchool.id,
      schoolOrOrg: "Central High",
    },
    {
      tournamentId: tournament.id,
      name: "Iron Eagles",
      pitNumber: 4,
      classId: highSchool.id,
      schoolOrOrg: "North High",
    },
  ]);

  // ── Matches ────────────────────────────────────────────────────────────────
  // Fetch the teams and field we just created
  const allTeams = await db.query.teams.findMany({
    where: (t, { eq }) => eq(t.tournamentId, tournament.id),
  });
  const allFields = await db.query.fields.findMany({
    where: (f, { eq }) => eq(f.tournamentId, tournament.id),
  });
  const fieldA = allFields.find((f) => f.name === "Field A")!;
  const fieldB = allFields.find((f) => f.name === "Field B")!;

  // Create 6 standard qualification matches (each team gets 3)
  const matchPairs = [
    [0, 1], [2, 3], // round 1
    [0, 2], [1, 3], // round 2
    [0, 3], [1, 2], // round 3
  ] as const;

  for (let i = 0; i < matchPairs.length; i++) {
    const [aIdx, bIdx] = matchPairs[i];
    const field = i % 2 === 0 ? fieldA : fieldB;
    const [match] = await db
      .insert(schema.matches)
      .values({
        tournamentId: tournament.id,
        matchType: "STANDARD",
        roundNumber: Math.floor(i / 2) + 1,
        status: "PENDING",
      })
      .returning();

    await db.insert(schema.matchTeams).values([
      { matchId: match.id, teamId: allTeams[aIdx].id, fieldId: field.id },
      { matchId: match.id, teamId: allTeams[bIdx].id, fieldId: field.id },
    ]);
  }

  // ── Roles ──────────────────────────────────────────────────────────────────
  await db.insert(schema.userTournamentRoles).values([
    {
      userId: director.id,
      tournamentId: tournament.id,
      role: "DIRECTOR",
    },
    {
      userId: referee.id,
      tournamentId: tournament.id,
      role: "REFEREE",
    },
    {
      userId: judge.id,
      tournamentId: tournament.id,
      role: "JUDGE",
    },
    {
      userId: teamLead1.id,
      tournamentId: tournament.id,
      role: "TEAM_LEAD",
    },
    {
      userId: teamLead2.id,
      tournamentId: tournament.id,
      role: "TEAM_LEAD",
    },
  ]);

  console.log("Seed complete.");
  console.log("\nDemo accounts (password: password123):");
  console.log("  director@example.com  — Tournament Director");
  console.log("  referee@example.com   — Referee");
  console.log("  judge@example.com     — Judge");
  console.log("  teamlead1@example.com — Team Lead");
  console.log("  teamlead2@example.com — Team Lead");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => conn.end());
