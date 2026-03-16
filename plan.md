# Robotics Competition Webapp — Build Plan

## Context

Building a custom webapp to manage and run robotics competitions (starting with IEEE Region 5 2026). The app needs to support tournaments with multiple teams, roles, dynamic competition types with configurable scoring forms, live leaderboards, and elimination bracket visualization. It will be self-hosted in Docker, reverse proxied through Cloudflare.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript) | Full-stack, SSR for public pages, standalone Docker output |
| API | **tRPC** | End-to-end type safety, no code generation, works with App Router |
| Database | **PostgreSQL 16** | Relational model fits the data; great JSON support for form schemas |
| ORM | **Drizzle ORM** | SQL-close, no binary engine, migrations as plain SQL |
| Auth | **Auth.js v5** (NextAuth) | Session/JWT, Credentials provider, integrates with Next.js middleware |
| Real-time | **Server-Sent Events (SSE)** | Stateless, works through Cloudflare, no socket server needed |
| UI | **shadcn/ui + Tailwind CSS** | Components copied into project (no runtime dep), full control |
| Testing | **Vitest** (unit/integration) + **Playwright** (E2E) | |
| Package manager | **pnpm** | Fast, strict, good for future monorepo |

---

## Database Schema

### Core entities

```
users                        — accounts (email + passwordHash)
tournaments                  — name, logoUrl, competitionTypeId
competition_types            — inspectionFormSchema, refereeFormSchema, judgingFormSchema (jsonb), scoringLogic (jsonb)
tournament_classes           — competition classes available per tournament
fields                       — competition + practice fields per tournament
teams                        — name, pitNumber, classId, schoolOrOrg, logoUrl, teamLeadUserId
user_tournament_roles        — userId + tournamentId + role enum (DIRECTOR, REFEREE, JUDGE, TEAM_LEAD, VOLUNTEER)
matches                      — matchType (STANDARD | ELIMINATION), roundNumber, bracketPosition, status
match_teams                  — teams in a match (HOME/AWAY sides)
scores                       — formData (jsonb), calculatedScore, refereeUserId, matchId, teamId (UNIQUE)
inspections                  — formData, passed boolean, inspectorUserId
judging_scores               — formData, calculatedScore, judgeUserId
```

### Scoring logic format (stored as jsonb in competition_types)

```json
{
  "rules": [
    { "field": "autonomousTasks", "pointsPer": 10 },
    { "field": "teleopRings", "pointsPer": 5 },
    { "field": "endgameParkLevel", "values": { "1": 5, "2": 10, "3": 15 } },
    { "field": "penalty", "pointsPer": -5 }
  ]
}
```

A pure `calculateScore(formData, scoringLogic)` function evaluates this server-side. No code execution from DB.

---

## Directory Structure

```
RoboticsCompetitionWebapp/
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile                        # multi-stage: deps → builder → runner
├── drizzle.config.ts
├── next.config.ts
├── src/
│   ├── app/
│   │   ├── (auth)/login, register
│   │   ├── (public)/tournaments/[id]/leaderboard, bracket
│   │   ├── dashboard/                # director UI (protected)
│   │   │   └── tournaments/[id]/teams, fields, matches, settings
│   │   ├── referee/[tournamentId]/score
│   │   ├── judge/[tournamentId]/score
│   │   ├── inspect/[tournamentId]/
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── trpc/[trpc]/
│   │       └── tournaments/[id]/leaderboard/stream/  # SSE
│   ├── components/
│   │   ├── ui/                       # shadcn copies
│   │   ├── bracket/BracketVisualization.tsx
│   │   ├── forms/DynamicScoringForm.tsx, ScoringLogicEditor.tsx
│   │   └── leaderboard/LeaderboardTable.tsx, LeaderboardStream.tsx
│   ├── db/
│   │   ├── schema/                   # one file per entity + index.ts
│   │   ├── queries/                  # reusable query functions
│   │   ├── migrate.ts
│   │   └── seed.ts
│   ├── server/
│   │   ├── auth.ts                   # Auth.js config
│   │   ├── trpc/init.ts, router.ts, routers/
│   │   └── scoring/calculator.ts    # calculateScore() — pure function
│   ├── lib/
│   │   ├── trpc-client.ts
│   │   ├── utils.ts
│   │   └── env.ts                   # Zod env validation
│   └── middleware.ts                 # Auth.js route guards
```

---

## Build Phases (bottom-up, each independently testable)

### Phase 0 — Project Scaffolding
- `pnpm create next-app` (TypeScript, App Router, Tailwind, src/)
- Install: drizzle-orm, drizzle-kit, postgres, next-auth, tRPC, shadcn/ui, zod, vitest, playwright
- Write `docker-compose.yml` (app + db services)
- Write multi-stage `Dockerfile`
- Write `.env.example`
- **Verify**: `docker compose up` starts Postgres; `pnpm dev` connects to it

### Phase 1 — Database Layer
- Write all Drizzle schema files under `src/db/schema/`
- Run `drizzle-kit generate` → produce initial migration SQL
- Write `migrate.ts` runner (auto-runs on app startup)
- Write `seed.ts` for local dev (1 tournament, a few teams, demo users)
- **Verify**: inspect DB with psql/TablePlus, confirm all tables and constraints

### Phase 2 — Authentication
- Implement Credentials provider + bcrypt password hashing
- Drizzle Auth.js adapter for the `users` table
- `getUserRoles(userId, tournamentId)` query
- Auth.js `authorized` callback + `middleware.ts` route protection
- Build `/login` and `/register` pages
- **Verify**: create user, login, logout; protected routes block unauthenticated access

### Phase 3 — Core Admin CRUD (Tournament Director dashboard)
- Tournament create/edit (name, logo upload, competition type selection)
- Competition type config (form schema + scoring logic editor with JSON preview)
- Team management (CRUD, class assignment, team lead assignment)
- Field management (add/remove, mark as practice)
- User role assignment within a tournament
- **Verify**: full CRUD cycle; non-directors get UNAUTHORIZED from tRPC procedures

### Phase 4 — Scoring Workflow
- Referee scoring form (rendered dynamically from `refereeFormSchema`)
- `calculateScore(formData, scoringLogic)` with Vitest unit tests
- Score submission → prevent duplicates (UNIQUE constraint + tRPC guard)
- Robot inspection form flow
- Judging form flow (gated on competition type config)
- **Verify**: submit score → `calculatedScore` correct → appears on team record

### Phase 5 — Leaderboard & Public Views
- Public leaderboard page filtered by class
- SSE route: `/api/tournaments/[id]/leaderboard/stream`
- Client `EventSource` subscription in `LeaderboardStream.tsx`
- **Verify (E2E)**: submit score in tab A → leaderboard updates in tab B within ~1s, no reload

### Phase 6 — Match System & Bracket
- Match scheduling UI for directors
- Standard match flow: create → assign teams → referee submits → auto-complete
- Elimination bracket: generate from seeded teams, auto-advance winners
- `BracketVisualization.tsx` — SVG-based, server-renderable
- **Verify**: full 8-team single-elimination bracket end to end; Playwright screenshot snapshot

### Phase 7 — Polish & Hardening
- Mobile-responsive pass on referee/judge forms (primary device: tablet on field)
- Optimistic UI on score submission
- Error boundaries + toast notifications
- Zod validation on all tRPC inputs
- Rate limiting on auth + submission routes
- Env var validation at startup (`src/lib/env.ts`)

### Phase 8 — Production Deployment
- Dockerfile health check (`/api/health`)
- `docker-compose.prod.yml` (restart policies, resource limits, internal-only DB port)
- Cloudflare: Full (strict) SSL/TLS, proxy records, cache rules for public leaderboard
- Deployment runbook in README (pull → migrate → restart)
- **Verify**: smoke test all critical flows on server

---

## Docker Compose Overview

**Development (`docker-compose.yml`)**
- `db`: postgres:16-alpine, named volume `postgres_data`, health check `pg_isready`
- `app`: depends on `db` healthy, mounts `./uploads:/app/uploads`, port 3000

**Production override (`docker-compose.prod.yml`)**
- `restart: unless-stopped` on both services
- `NODE_ENV=production`, resource limits (app: 512m, db: 256m)
- DB port not exposed to host
- Named volume for uploads

**Dockerfile (multi-stage)**
1. `base` — node:22-alpine + pnpm via corepack
2. `deps` — `pnpm install --frozen-lockfile`
3. `builder` — copy source, `pnpm build` (Next.js standalone)
4. `runner` — standalone output only, `NODE_ENV=production`, port 3000

---

## Critical Files

- `src/db/schema/index.ts` — central schema; entire app depends on this being correct first
- `src/server/scoring/calculator.ts` — core business logic; must be pure function with thorough unit tests
- `src/server/trpc/init.ts` — tRPC context (session + db); defines the security model for all procedures
- `src/middleware.ts` — route protection; misconfiguration exposes the whole app
- `docker-compose.yml` — foundation for all environments; must be correct before other work begins

---

## Verification / Testing Strategy

| Phase | Tool | Focus |
|---|---|---|
| 0 | Manual | Docker + dev server connect |
| 1 | Vitest integration | Migrations, schema constraints, query functions |
| 2 | Vitest | Role checks, auth flow |
| 3 | Vitest (tRPC caller) | CRUD procedures with mock session contexts |
| 4 | Vitest | `calculateScore()` unit tests, duplicate submission guard |
| 5 | Playwright E2E | SSE live leaderboard update |
| 6 | Vitest + Playwright | Bracket generation logic + visual snapshot |
| 7 | Vitest | Zod schema validation rejection |
| All | ESLint + `tsc --noEmit` | Run on every commit |
