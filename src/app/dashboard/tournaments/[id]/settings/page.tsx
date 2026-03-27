"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import type { Role, ScoreAggregationMethod } from "@/db/schema";

const ALL_ROLES: Role[] = ["DIRECTOR", "REFEREE", "JUDGE", "TEAM_LEAD", "VOLUNTEER"];

export default function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const { data: tournament, refetch: refetchTournament } =
    trpc.tournaments.getById.useQuery({ id: tournamentId });

  const { data: roles, refetch: refetchRoles } = trpc.roles.list.useQuery(
    { tournamentId },
    { enabled: !!tournament }
  );

  // --- Tournament rename ---
  const [tName, setTName] = useState("");
  const [tNameEditing, setTNameEditing] = useState(false);
  const updateTournament = trpc.tournaments.update.useMutation({
    onSuccess: () => { refetchTournament(); setTNameEditing(false); },
  });

  // --- Match settings ---
  const [matchesPerTeam, setMatchesPerTeam] = useState<string>("");
  const [aggMethod, setAggMethod] = useState<ScoreAggregationMethod>("best_n");
  const [aggN, setAggN] = useState<string>("2");
  const [showJudgingScores, setShowJudgingScores] = useState(false);

  // --- Practice field settings ---
  const [practiceSlotDuration, setPracticeSlotDuration] = useState<string>("15");
  const [maxFuturePracticeSlots, setMaxFuturePracticeSlots] = useState<string>("1");

  // --- Timezone ---
  const [timezone, setTimezone] = useState<string>("America/New_York");

  useEffect(() => {
    if (tournament) {
      setMatchesPerTeam(String(tournament.matchesPerTeam ?? 3));
      setAggMethod((tournament.scoreAggregation?.method ?? "best_n") as ScoreAggregationMethod);
      setAggN(String(tournament.scoreAggregation?.n ?? 2));
      setShowJudgingScores(tournament.showJudgingScores ?? false);
      setPracticeSlotDuration(String(tournament.practiceSlotDurationMinutes ?? 15));
      setMaxFuturePracticeSlots(String(tournament.maxFuturePracticeSlots ?? 1));
      setTimezone(tournament.timezone ?? "America/New_York");
    }
  }, [tournament]);

  const updateSettings = trpc.tournaments.updateSettings.useMutation({
    onSuccess: () => refetchTournament(),
  });

  // --- Tournament visibility ---
  const toggleActive = trpc.tournaments.toggleActive.useMutation({
    onSuccess: () => refetchTournament(),
  });

  // --- Add class ---
  const [newClass, setNewClass] = useState("");
  const addClass = trpc.tournaments.addClass.useMutation({
    onSuccess: () => { refetchTournament(); setNewClass(""); },
  });
  const removeClass = trpc.tournaments.removeClass.useMutation({
    onSuccess: () => refetchTournament(),
  });

  // --- Match sides ---
  const [sides, setSides] = useState<string[]>([]);
  const [newSide, setNewSide] = useState("");
  const [editingSideIdx, setEditingSideIdx] = useState<number | null>(null);
  const [editingSideValue, setEditingSideValue] = useState("");

  useEffect(() => {
    if (tournament) {
      setSides(tournament.matchSides ?? []);
    }
  }, [tournament]);

  const updateMatchSides = trpc.tournaments.updateMatchSides.useMutation({
    onSuccess: () => refetchTournament(),
  });

  function saveSides(next: string[]) {
    setSides(next);
    updateMatchSides.mutate({ id: tournamentId, matchSides: next.length > 0 ? next : null });
  }

  // --- Role assignment ---
  const [roleEmail, setRoleEmail] = useState("");
  const [roleToAssign, setRoleToAssign] = useState<Role>("REFEREE");
  const [roleTeamId, setRoleTeamId] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);

  const { data: teamsForRole } = trpc.teams.list.useQuery(
    { tournamentId },
    { enabled: roleToAssign === "TEAM_LEAD" }
  );

  const findUser = trpc.roles.findUserByEmail.useQuery(
    { email: roleEmail },
    { enabled: false }
  );

  const updateTeamLead = trpc.teams.update.useMutation();

  const assignRole = trpc.roles.assign.useMutation({
    onSuccess: () => { refetchRoles(); setRoleEmail(""); setRoleTeamId(""); setRoleError(null); },
    onError: (e) => setRoleError(e.message),
  });

  const revokeRole = trpc.roles.revoke.useMutation({
    onSuccess: () => refetchRoles(),
  });

  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleError(null);
    const result = await findUser.refetch();
    if (!result.data) {
      setRoleError("User not found.");
      return;
    }
    const userId = result.data.id;
    assignRole.mutate(
      { tournamentId, userId, role: roleToAssign },
      {
        onSuccess: () => {
          if (roleToAssign === "TEAM_LEAD" && roleTeamId) {
            updateTeamLead.mutate({ id: roleTeamId, tournamentId, teamLeadUserId: userId });
          }
        },
      }
    );
  }

  const isDirector = tournament?.userRoles?.some((r) => r.role === "DIRECTOR");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/tournaments/${tournamentId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← {tournament?.name ?? "Tournament"}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
      </div>

      {/* Tournament name */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Tournament Name
        </h2>
        {tNameEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateTournament.mutate({ id: tournamentId, name: tName });
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              required
              value={tName}
              onChange={(e) => setTName(e.target.value)}
              className={inputCls + " flex-1"}
            />
            <button type="submit" className={btnPrimary}>Save</button>
            <button type="button" onClick={() => setTNameEditing(false)} className={btnSecondary}>Cancel</button>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {tournament?.name}
            </p>
            {isDirector && (
              <button
                onClick={() => { setTName(tournament?.name ?? ""); setTNameEditing(true); }}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </section>

      {/* Tournament visibility */}
      {isDirector && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Tournament Visibility
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Active tournaments appear on the public home page where anyone can
            view the scoreboard, schedule, and apply to volunteer.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {tournament?.isActive ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Active — publicly visible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  Inactive — hidden from public
                </span>
              )}
            </span>
            <button
              onClick={() =>
                toggleActive.mutate({
                  id: tournamentId,
                  isActive: !tournament?.isActive,
                })
              }
              disabled={toggleActive.isPending}
              className={btnSecondary + " disabled:opacity-50"}
            >
              {tournament?.isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        </section>
      )}

      {/* Classes */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Competition Classes
        </h2>
        <ul className="mb-3 space-y-1">
          {tournament?.classes?.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{c.name}</span>
              {isDirector && (
                <button
                  onClick={() => removeClass.mutate({ classId: c.id, tournamentId })}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isDirector && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addClass.mutate({ tournamentId, name: newClass });
            }}
            className="flex gap-2"
          >
            <input
              required
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              placeholder="New class name"
              className={inputCls + " flex-1"}
            />
            <button type="submit" className={btnPrimary}>Add</button>
          </form>
        )}
      </section>

      {/* Match sides */}
      {isDirector && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Match Sides
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Labels assigned to each team slot in a match (e.g. Home / Away, Red / Blue). Leave empty to use no sides.
          </p>
          <ul className="mb-3 space-y-1">
            {sides.map((side, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                {editingSideIdx === idx ? (
                  <>
                    <input
                      autoFocus
                      value={editingSideValue}
                      onChange={(e) => setEditingSideValue(e.target.value)}
                      className={inputCls + " flex-1"}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const next = sides.map((s, i) => (i === idx ? editingSideValue.trim() : s)).filter(Boolean);
                          saveSides(next);
                          setEditingSideIdx(null);
                        } else if (e.key === "Escape") {
                          setEditingSideIdx(null);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const next = sides.map((s, i) => (i === idx ? editingSideValue.trim() : s)).filter(Boolean);
                        saveSides(next);
                        setEditingSideIdx(null);
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingSideIdx(null)} className="text-xs text-zinc-400">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-zinc-700 dark:text-zinc-300">{side}</span>
                    <button
                      onClick={() => { setEditingSideIdx(idx); setEditingSideValue(side); }}
                      className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => saveSides(sides.filter((_, i) => i !== idx))}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newSide.trim();
              if (!trimmed) return;
              saveSides([...sides, trimmed]);
              setNewSide("");
            }}
            className="flex gap-2"
          >
            <input
              value={newSide}
              onChange={(e) => setNewSide(e.target.value)}
              placeholder="Add side label…"
              className={inputCls + " flex-1"}
            />
            <button type="submit" className={btnPrimary}>Add</button>
          </form>
        </section>
      )}

      {/* Match settings */}
      {isDirector && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Match Settings
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings.mutate({
                id: tournamentId,
                matchesPerTeam: parseInt(matchesPerTeam),
                scoreAggregation: {
                  method: aggMethod,
                  n: aggMethod === "best_n" ? parseInt(aggN) : undefined,
                },
                showJudgingScores,
                timezone,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Matches per team (qualification rounds)
              </label>
              <input
                type="number"
                min={1}
                max={20}
                required
                value={matchesPerTeam}
                onChange={(e) => setMatchesPerTeam(e.target.value)}
                className={inputCls + " w-28"}
              />
            </div>
            <div className="space-y-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Score aggregation method
              </label>
              <div className="flex flex-wrap gap-3">
                {([
                  { value: "best_n", label: "Best N scores" },
                  { value: "average", label: "Average" },
                  { value: "sum", label: "Sum all" },
                ] as { value: ScoreAggregationMethod; label: string }[]).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="aggMethod"
                      value={opt.value}
                      checked={aggMethod === opt.value}
                      onChange={() => setAggMethod(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {aggMethod === "best_n" && (
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-xs text-zinc-500">N =</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={aggN}
                    onChange={(e) => setAggN(e.target.value)}
                    className={inputCls + " w-20"}
                  />
                  <span className="text-xs text-zinc-400">top scores counted</span>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {aggMethod === "best_n"
                ? `Teams' top ${aggN} match score(s) are summed to form their leaderboard score.`
                : aggMethod === "average"
                ? "Teams' leaderboard score is the average of all their match scores."
                : "Teams' leaderboard score is the sum of all their match scores."}
            </p>
            {tournament?.competitionType?.judgingFormSchema && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Show judging scores on public leaderboard
                  </p>
                  <p className="text-xs text-zinc-400">
                    Displays a judging column and includes judging in the final score.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showJudgingScores}
                  onClick={() => setShowJudgingScores(!showJudgingScores)}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
                    showJudgingScores
                      ? "bg-violet-700"
                      : "bg-zinc-200 dark:bg-zinc-700",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-zinc-900",
                      showJudgingScores ? "translate-x-5" : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tournament timezone
              </label>
              <input
                type="text"
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. America/New_York"
                className={inputCls + " w-64"}
              />
              <p className="mt-1 text-xs text-zinc-400">
                IANA timezone used to display match times (e.g. America/Chicago, America/Los_Angeles).
              </p>
            </div>
            <button
              type="submit"
              disabled={updateSettings.isPending}
              className={btnPrimary}
            >
              {updateSettings.isPending ? "Saving…" : "Save Match Settings"}
            </button>
            {updateSettings.isSuccess && (
              <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>
            )}
          </form>
        </section>
      )}

      {/* Practice field settings */}
      {isDirector && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Practice Field Settings
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Controls how teams book time on practice fields. Applies to all
            practice fields in this tournament.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings.mutate({
                id: tournamentId,
                practiceSlotDurationMinutes: parseInt(practiceSlotDuration),
                maxFuturePracticeSlots: parseInt(maxFuturePracticeSlots),
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Slot duration (minutes)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                step={5}
                required
                value={practiceSlotDuration}
                onChange={(e) => setPracticeSlotDuration(e.target.value)}
                className={inputCls + " w-28"}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Max upcoming slots per team
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={maxFuturePracticeSlots}
                onChange={(e) => setMaxFuturePracticeSlots(e.target.value)}
                className={inputCls + " w-20"}
              />
              <p className="mt-1 text-xs text-zinc-400">
                A team may hold this many future bookings at once. Once a slot
                passes it no longer counts, so the team may book another.
              </p>
            </div>
            <button
              type="submit"
              disabled={updateSettings.isPending}
              className={btnPrimary}
            >
              {updateSettings.isPending ? "Saving…" : "Save Practice Settings"}
            </button>
          </form>
        </section>
      )}

      {/* Role management */}
      {isDirector && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Role Assignments
          </h2>

          {/* Current roles */}
          <ul className="mb-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {roles?.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {r.user.name ?? r.user.email}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{r.role}</span>
                  <button
                    onClick={() =>
                      revokeRole.mutate({
                        tournamentId,
                        userId: r.userId,
                        role: r.role,
                      })
                    }
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Assign new role */}
          <form onSubmit={handleAssignRole} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={roleEmail}
                onChange={(e) => setRoleEmail(e.target.value)}
                placeholder="User email"
                className={inputCls + " flex-1"}
              />
              <select
                value={roleToAssign}
                onChange={(e) => { setRoleToAssign(e.target.value as Role); setRoleTeamId(""); }}
                className={inputCls + " w-36"}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button type="submit" className={btnPrimary}>Assign</button>
            </div>
            {roleToAssign === "TEAM_LEAD" && (
              <select
                value={roleTeamId}
                onChange={(e) => setRoleTeamId(e.target.value)}
                className={inputCls + " w-full"}
              >
                <option value="">Assign to team (optional)…</option>
                {teamsForRole?.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {roleError && (
              <p className="text-sm text-red-600 dark:text-red-400">{roleError}</p>
            )}
          </form>
        </section>
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const btnPrimary =
  "rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400";
