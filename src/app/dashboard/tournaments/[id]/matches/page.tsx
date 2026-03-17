"use client";

import { useState, use } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/router";

type MatchStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "CANCELLED";
type MatchType = "STANDARD" | "ELIMINATION";

const STATUS_LABELS: Record<MatchStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

// ── Break type ────────────────────────────────────────────────────────────────
interface BreakEntry {
  id: number;
  label: string;
  startsAt: string;
  endsAt: string;
}

export default function MatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const { data: tournament } = trpc.tournaments.getById.useQuery({ id: tournamentId });
  const { data: matchList, refetch, isLoading } = trpc.matches.list.useQuery({ tournamentId });
  const { data: teams } = trpc.teams.list.useQuery({ tournamentId });

  const isDirector = tournament?.userRoles?.some((r) => r.role === "DIRECTOR");

  // ── Create match form ─────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [matchType, setMatchType] = useState<MatchType>("STANDARD");
  const [roundNumber, setRoundNumber] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMatch = trpc.matches.create.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setFormError(e.message),
  });

  function resetForm() {
    setShowForm(false);
    setMatchType("STANDARD");
    setRoundNumber("");
    setScheduledAt("");
    setFormError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMatch.mutate({
      tournamentId,
      matchType,
      roundNumber: roundNumber ? parseInt(roundNumber) : undefined,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  }

  // ── Add/remove team ───────────────────────────────────────────────────────
  const [addTeamMatchId, setAddTeamMatchId] = useState<string | null>(null);
  const [addTeamId, setAddTeamId] = useState("");
  const [addTeamSide, setAddTeamSide] = useState("");
  const [addTeamFieldId, setAddTeamFieldId] = useState("");

  const addTeam = trpc.matches.addTeam.useMutation({
    onSuccess: () => { refetch(); setAddTeamMatchId(null); setAddTeamId(""); setAddTeamSide(""); setAddTeamFieldId(""); },
  });

  const removeTeam = trpc.matches.removeTeam.useMutation({
    onSuccess: () => refetch(),
  });

  const updateStatus = trpc.matches.updateStatus.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteMatch = trpc.matches.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // ── Delete all standard ───────────────────────────────────────────────────
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const deleteAllStandard = trpc.matches.deleteAllStandard.useMutation({
    onSuccess: () => { refetch(); setConfirmDeleteAll(false); },
  });

  // ── Schedule generator ────────────────────────────────────────────────────
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedTeamsPerMatch, setSchedTeamsPerMatch] = useState("2");
  const [schedTeamsPerField, setSchedTeamsPerField] = useState("2");
  const [schedFieldIds, setSchedFieldIds] = useState<string[]>([]);
  const [schedStartsAt, setSchedStartsAt] = useState("");
  const [schedBetween, setSchedBetween] = useState("5");
  const [schedBreaks, setSchedBreaks] = useState<BreakEntry[]>([]);
  const [schedBreakIdCounter, setSchedBreakIdCounter] = useState(0);
  const [schedError, setSchedError] = useState<string | null>(null);

  const generateSchedule = trpc.matches.generateSchedule.useMutation({
    onSuccess: () => {
      refetch();
      setShowScheduleForm(false);
      setSchedError(null);
    },
    onError: (e) => setSchedError(e.message),
  });

  function addBreak() {
    const id = schedBreakIdCounter + 1;
    setSchedBreakIdCounter(id);
    setSchedBreaks((prev) => [...prev, { id, label: "", startsAt: "", endsAt: "" }]);
  }

  function updateBreak(id: number, field: keyof Omit<BreakEntry, "id">, value: string) {
    setSchedBreaks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  }

  function removeBreak(id: number) {
    setSchedBreaks((prev) => prev.filter((b) => b.id !== id));
  }

  function toggleField(fieldId: string) {
    setSchedFieldIds((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  }

  function handleGenerateSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSchedError(null);

    const validBreaks = schedBreaks.filter((b) => b.label && b.startsAt && b.endsAt);

    generateSchedule.mutate({
      tournamentId,
      teamsPerMatch: parseInt(schedTeamsPerMatch),
      teamsPerField: parseInt(schedTeamsPerField),
      fieldIds: schedFieldIds,
      sides: tournament?.matchSides ?? [],
      startsAt: new Date(schedStartsAt).toISOString(),
      betweenMatchMinutes: parseInt(schedBetween),
      breaks: validBreaks.map((b) => ({
        label: b.label,
        startsAt: new Date(b.startsAt).toISOString(),
        endsAt: new Date(b.endsAt).toISOString(),
      })),
    });
  }

  // ── Bracket generation ────────────────────────────────────────────────────
  const [showBracketForm, setShowBracketForm] = useState(false);
  const [bracketStep, setBracketStep] = useState<"seed-count" | "reorder" | "fields-sides">("seed-count");
  const [bracketSeedCount, setBracketSeedCount] = useState("8");
  const [bracketTeamOrder, setBracketTeamOrder] = useState<string[]>([]);
  const [bracketFieldIds, setBracketFieldIds] = useState<string[]>([]);
  const [bracketError, setBracketError] = useState<string | null>(null);

  const { data: leaderboard } = trpc.leaderboard.get.useQuery(
    { tournamentId },
    { enabled: showBracketForm }
  );

  const generateBracket = trpc.matches.generateBracket.useMutation({
    onSuccess: () => {
      refetch();
      setShowBracketForm(false);
      setBracketStep("seed-count");
      setBracketTeamOrder([]);
      setBracketFieldIds([]);
      setBracketError(null);
    },
    onError: (e) => setBracketError(e.message),
  });

  function loadSeedsFromLeaderboard() {
    const n = parseInt(bracketSeedCount);
    if (!n || n < 2) { setBracketError("Enter at least 2 seeds"); return; }
    const top = (leaderboard ?? []).slice(0, n).map((r) => r.teamId);
    setBracketTeamOrder(top);
    setBracketError(null);
    setBracketStep("reorder");
  }

  function moveSeed(idx: number, dir: -1 | 1) {
    const next = [...bracketTeamOrder];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setBracketTeamOrder(next);
  }

  // ── Advance winner ────────────────────────────────────────────────────────
  const [advanceMatchId, setAdvanceMatchId] = useState<string | null>(null);
  const [advanceTeamId, setAdvanceTeamId] = useState("");

  const advanceWinner = trpc.matches.advanceWinner.useMutation({
    onSuccess: () => { refetch(); setAdvanceMatchId(null); setAdvanceTeamId(""); },
  });

  const standardMatches = matchList?.filter((m) => m.matchType === "STANDARD") ?? [];
  const elimMatches = matchList?.filter((m) => m.matchType === "ELIMINATION") ?? [];
  const fields = tournament?.fields ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/tournaments/${tournamentId}`}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            ← {tournament?.name ?? "Tournament"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Matches
          </h1>
        </div>
        {isDirector && !showForm && !showScheduleForm && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowScheduleForm(true)} className={btnSecondary}>
              Generate Schedule
            </button>
            <button onClick={() => { setBracketStep("seed-count"); setBracketTeamOrder([]); setBracketFieldIds([]); setBracketError(null); setShowBracketForm((v) => !v); }} className={btnSecondary}>
              Generate Bracket
            </button>
            <button onClick={() => setShowForm(true)} className={btnPrimary}>
              New Match
            </button>
          </div>
        )}
      </div>

      {/* Create match form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 space-y-3"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">New Match</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Type</label>
              <select value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)} className={inputCls}>
                <option value="STANDARD">Standard</option>
                <option value="ELIMINATION">Elimination</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Round (optional)</label>
              <input
                type="number"
                min={1}
                value={roundNumber}
                onChange={(e) => setRoundNumber(e.target.value)}
                className={inputCls}
                placeholder="e.g. 1"
              />
            </div>
            <div>
              <label className={labelCls}>Scheduled At (optional)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={createMatch.isPending} className={btnPrimary}>
              Create
            </button>
            <button type="button" onClick={resetForm} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Schedule generator form */}
      {showScheduleForm && (
        <form
          onSubmit={handleGenerateSchedule}
          className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 space-y-5"
        >
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Generate Qualification Schedule
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Automatically creates round-robin matches so every team plays{" "}
              {tournament?.matchesPerTeam ?? "?"} times. Match duration is set on the competition type.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>Teams per match</label>
              <input
                required
                type="number"
                min={2}
                max={10}
                value={schedTeamsPerMatch}
                onChange={(e) => setSchedTeamsPerMatch(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Teams per field</label>
              <input
                required
                type="number"
                min={1}
                max={10}
                value={schedTeamsPerField}
                onChange={(e) => setSchedTeamsPerField(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-zinc-400">
                How many teams compete on each individual field.
              </p>
            </div>
            <div>
              <label className={labelCls}>Start time</label>
              <input
                required
                type="datetime-local"
                value={schedStartsAt}
                onChange={(e) => setSchedStartsAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Buffer between matches (minutes)</label>
              <input
                required
                type="number"
                min={0}
                max={240}
                value={schedBetween}
                onChange={(e) => setSchedBetween(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Fields */}
          <div>
            <label className={labelCls}>Fields to use</label>
            {fields.length === 0 ? (
              <p className="text-xs text-zinc-400">No fields configured for this tournament.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {fields.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    <input
                      type="checkbox"
                      checked={schedFieldIds.includes(f.id)}
                      onChange={() => toggleField(f.id)}
                      className="rounded"
                    />
                    <span className="text-zinc-700 dark:text-zinc-300">{f.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sides preview */}
          {(tournament?.matchSides ?? []).length > 0 && (
            <div>
              <p className={labelCls}>Sides (from tournament settings)</p>
              <div className="flex gap-2 mt-1">
                {tournament!.matchSides!.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Breaks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + " mb-0"}>Breaks</label>
              <button type="button" onClick={addBreak} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
                + Add break
              </button>
            </div>
            {schedBreaks.length === 0 ? (
              <p className="text-xs text-zinc-400">No breaks added.</p>
            ) : (
              <div className="space-y-2">
                {schedBreaks.map((brk) => (
                  <div key={brk.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                    <input
                      placeholder="Label (e.g. Lunch)"
                      value={brk.label}
                      onChange={(e) => updateBreak(brk.id, "label", e.target.value)}
                      className={inputCls + " flex-1 min-w-32"}
                    />
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <span>Start</span>
                      <input
                        type="datetime-local"
                        value={brk.startsAt}
                        onChange={(e) => updateBreak(brk.id, "startsAt", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <span>End</span>
                      <input
                        type="datetime-local"
                        value={brk.endsAt}
                        onChange={(e) => updateBreak(brk.id, "endsAt", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBreak(brk.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {schedError && <p className="text-sm text-red-600 dark:text-red-400">{schedError}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={generateSchedule.isPending || schedFieldIds.length === 0 || !schedStartsAt}
              className={btnPrimary}
            >
              {generateSchedule.isPending ? "Generating…" : "Generate Schedule"}
            </button>
            <button
              type="button"
              onClick={() => { setShowScheduleForm(false); setSchedError(null); }}
              className={btnSecondary}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Bracket generation form */}
      {showBracketForm && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Generate Elimination Bracket
          </h2>

          {bracketStep === "seed-count" && (
            <>
              <p className="text-xs text-zinc-500">
                How many teams should advance to the bracket? The top teams by leaderboard score will be seeded automatically.
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <label className={labelCls}>Number of seeds</label>
                  <input
                    type="number"
                    min={2}
                    max={64}
                    value={bracketSeedCount}
                    onChange={(e) => setBracketSeedCount(e.target.value)}
                    className={inputCls + " w-28"}
                  />
                </div>
                <button
                  type="button"
                  disabled={!leaderboard}
                  onClick={loadSeedsFromLeaderboard}
                  className={btnPrimary}
                >
                  {leaderboard ? "Continue" : "Loading…"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBracketForm(false); setBracketError(null); }}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </div>
              {leaderboard && (
                <p className="text-xs text-zinc-400">
                  {leaderboard.length} teams on the leaderboard — top {Math.min(parseInt(bracketSeedCount) || 0, leaderboard.length)} will be seeded.
                </p>
              )}
            </>
          )}

          {bracketStep === "reorder" && teams && (
            <>
              <p className="text-xs text-zinc-500">
                Seeds loaded from the leaderboard. Reorder or add/remove teams, then generate.
              </p>

              {/* Seed order list */}
              <ol className="space-y-1">
                {bracketTeamOrder.map((teamId, idx) => {
                  const team = teams.find((t) => t.id === teamId);
                  const lbRow = leaderboard?.find((r) => r.teamId === teamId);
                  return (
                    <li
                      key={teamId}
                      className="flex items-center gap-2 rounded border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-800"
                    >
                      <span className="w-5 text-xs font-medium text-zinc-400">{idx + 1}.</span>
                      <span className="flex-1 text-zinc-800 dark:text-zinc-200">{team?.name ?? teamId}</span>
                      {lbRow != null && (
                        <span className="text-xs text-zinc-400">{lbRow.totalScore} pts</span>
                      )}
                      <button
                        type="button"
                        onClick={() => moveSeed(idx, -1)}
                        disabled={idx === 0}
                        className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSeed(idx, 1)}
                        disabled={idx === bracketTeamOrder.length - 1}
                        className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => setBracketTeamOrder((prev) => prev.filter((id) => id !== teamId))}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>

              {/* Add additional teams not already seeded */}
              {teams.filter((t) => !bracketTeamOrder.includes(t.id)).length > 0 && (
                <div>
                  <p className={labelCls}>Add more teams</p>
                  <div className="flex flex-wrap gap-2">
                    {teams
                      .filter((t) => !bracketTeamOrder.includes(t.id))
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setBracketTeamOrder((prev) => [...prev, t.id])}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          + {t.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={bracketTeamOrder.length < 2}
                  onClick={() => { setBracketError(null); setBracketStep("fields-sides"); }}
                  className={btnPrimary}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => { setBracketStep("seed-count"); setBracketTeamOrder([]); setBracketError(null); }}
                  className={btnSecondary}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBracketForm(false); setBracketStep("seed-count"); setBracketTeamOrder([]); setBracketFieldIds([]); setBracketError(null); }}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {bracketStep === "fields-sides" && (
            <>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Fields</label>
                  <p className="mb-2 text-xs text-zinc-400">
                    Round 1 matches will be assigned to fields in rotation. Later rounds inherit the field from their previous match.
                  </p>
                  {fields.length === 0 ? (
                    <p className="text-xs text-zinc-400">No fields configured — you can add them in tournament settings.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {fields.map((f) => (
                        <label
                          key={f.id}
                          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                        >
                          <input
                            type="checkbox"
                            checked={bracketFieldIds.includes(f.id)}
                            onChange={() =>
                              setBracketFieldIds((prev) =>
                                prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                              )
                            }
                            className="rounded"
                          />
                          <span className="text-zinc-700 dark:text-zinc-300">{f.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {(tournament?.matchSides ?? []).length > 0 && (
                  <div>
                    <label className={labelCls}>Sides</label>
                    <p className="mb-2 text-xs text-zinc-400">
                      These sides (from tournament settings) will be assigned to teams in each match.
                    </p>
                    <div className="flex gap-2">
                      {tournament!.matchSides!.map((s, i) => (
                        <span
                          key={s}
                          className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          <span className="mr-1 text-xs text-zinc-400">Slot {i + 1}:</span>{s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={generateBracket.isPending}
                  onClick={() =>
                    generateBracket.mutate({
                      tournamentId,
                      seededTeamIds: bracketTeamOrder,
                      fieldIds: bracketFieldIds,
                      sides: tournament?.matchSides ?? [],
                    })
                  }
                  className={btnPrimary}
                >
                  {generateBracket.isPending ? "Generating…" : "Generate Bracket"}
                </button>
                <button
                  type="button"
                  onClick={() => { setBracketStep("reorder"); setBracketError(null); }}
                  className={btnSecondary}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBracketForm(false); setBracketStep("seed-count"); setBracketTeamOrder([]); setBracketFieldIds([]); setBracketError(null); }}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {bracketError && <p className="text-sm text-red-600 dark:text-red-400">{bracketError}</p>}
        </div>
      )}

      {/* Standard matches */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Qualification Matches
          </h2>
          {isDirector && standardMatches.length > 0 && (
            confirmDeleteAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Delete all {standardMatches.length} qualification matches?</span>
                <button
                  onClick={() => deleteAllStandard.mutate({ tournamentId })}
                  disabled={deleteAllStandard.isPending}
                  className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                >
                  Yes, delete all
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteAll(true)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Delete All
              </button>
            )
          )}
        </div>
        <MatchSection
          matchItems={standardMatches}
          isDirector={!!isDirector}
          teams={teams ?? []}
          tournamentId={tournamentId}
          addTeamMatchId={addTeamMatchId}
          setAddTeamMatchId={setAddTeamMatchId}
          addTeamId={addTeamId}
          setAddTeamId={setAddTeamId}
          addTeamSide={addTeamSide}
          setAddTeamSide={setAddTeamSide}
          addTeamFieldId={addTeamFieldId}
          setAddTeamFieldId={setAddTeamFieldId}
          fields={fields}
          matchSides={tournament?.matchSides ?? []}
          onAddTeam={(matchId) =>
            addTeam.mutate({
              matchId,
              tournamentId,
              teamId: addTeamId,
              side: addTeamSide || undefined,
              fieldId: addTeamFieldId || undefined,
            })
          }
          onRemoveTeam={(matchId, teamId) =>
            removeTeam.mutate({ matchId, tournamentId, teamId })
          }
          onUpdateStatus={(matchId, status) =>
            updateStatus.mutate({ matchId, tournamentId, status })
          }
          onDelete={(matchId) => deleteMatch.mutate({ matchId, tournamentId })}
          advanceMatchId={advanceMatchId}
          setAdvanceMatchId={setAdvanceMatchId}
          advanceTeamId={advanceTeamId}
          setAdvanceTeamId={setAdvanceTeamId}
          onAdvanceWinner={(matchId) =>
            advanceWinner.mutate({ matchId, tournamentId, winnerTeamId: advanceTeamId })
          }
          isLoading={isLoading}
          showAdvance={false}
        />
      </section>

      {/* Elimination matches */}
      {elimMatches.length > 0 && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Elimination Bracket
            </h2>
            <MatchSection
              matchItems={elimMatches}
              isDirector={!!isDirector}
              teams={teams ?? []}
              tournamentId={tournamentId}
              addTeamMatchId={addTeamMatchId}
              setAddTeamMatchId={setAddTeamMatchId}
              addTeamId={addTeamId}
              setAddTeamId={setAddTeamId}
              addTeamSide={addTeamSide}
              setAddTeamSide={setAddTeamSide}
              addTeamFieldId={addTeamFieldId}
              setAddTeamFieldId={setAddTeamFieldId}
              fields={fields}
              matchSides={tournament?.matchSides ?? []}
              onAddTeam={(matchId) =>
                addTeam.mutate({
                  matchId,
                  tournamentId,
                  teamId: addTeamId,
                  side: addTeamSide || undefined,
                  fieldId: addTeamFieldId || undefined,
                })
              }
              onRemoveTeam={(matchId, teamId) =>
                removeTeam.mutate({ matchId, tournamentId, teamId })
              }
              onUpdateStatus={(matchId, status) =>
                updateStatus.mutate({ matchId, tournamentId, status })
              }
              onDelete={(matchId) => deleteMatch.mutate({ matchId, tournamentId })}
              advanceMatchId={advanceMatchId}
              setAdvanceMatchId={setAdvanceMatchId}
              advanceTeamId={advanceTeamId}
              setAdvanceTeamId={setAdvanceTeamId}
              onAdvanceWinner={(matchId) =>
                advanceWinner.mutate({ matchId, tournamentId, winnerTeamId: advanceTeamId })
              }
              isLoading={isLoading}
              showAdvance={true}
            />
          </section>
          <div className="text-right">
            <Link
              href={`/tournaments/${tournamentId}/bracket`}
              className="text-sm text-zinc-500 underline-offset-4 hover:underline"
            >
              View public bracket →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MatchItem = RouterOutputs["matches"]["list"][number];
type Team = RouterOutputs["teams"]["list"][number];
type TournamentField = NonNullable<RouterOutputs["tournaments"]["getById"]>["fields"][number];

function MatchSection({
  matchItems,
  isDirector,
  teams,
  tournamentId,
  fields,
  matchSides,
  addTeamMatchId,
  setAddTeamMatchId,
  addTeamId,
  setAddTeamId,
  addTeamSide,
  setAddTeamSide,
  addTeamFieldId,
  setAddTeamFieldId,
  onAddTeam,
  onRemoveTeam,
  onUpdateStatus,
  onDelete,
  advanceMatchId,
  setAdvanceMatchId,
  advanceTeamId,
  setAdvanceTeamId,
  onAdvanceWinner,
  isLoading,
  showAdvance,
}: {
  matchItems: MatchItem[];
  isDirector: boolean;
  teams: Team[];
  tournamentId: string;
  fields: TournamentField[];
  matchSides: string[];
  addTeamMatchId: string | null;
  setAddTeamMatchId: (v: string | null) => void;
  addTeamId: string;
  setAddTeamId: (v: string) => void;
  addTeamSide: string;
  setAddTeamSide: (v: string) => void;
  addTeamFieldId: string;
  setAddTeamFieldId: (v: string) => void;
  onAddTeam: (matchId: string) => void;
  onRemoveTeam: (matchId: string, teamId: string) => void;
  onUpdateStatus: (matchId: string, status: MatchStatus) => void;
  onDelete: (matchId: string) => void;
  advanceMatchId: string | null;
  setAdvanceMatchId: (v: string | null) => void;
  advanceTeamId: string;
  setAdvanceTeamId: (v: string) => void;
  onAdvanceWinner: (matchId: string) => void;
  isLoading: boolean;
  showAdvance: boolean;
}) {
  if (isLoading) return <p className="text-sm text-zinc-400">Loading…</p>;
  if (matchItems.length === 0) return <p className="text-sm text-zinc-400">No matches yet.</p>;

  return (
    <div className="space-y-3">
      {matchItems.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          isDirector={isDirector}
          teams={teams}
          fields={fields}
          matchSides={matchSides}
          addTeamMatchId={addTeamMatchId}
          setAddTeamMatchId={setAddTeamMatchId}
          addTeamId={addTeamId}
          setAddTeamId={setAddTeamId}
          addTeamSide={addTeamSide}
          setAddTeamSide={setAddTeamSide}
          addTeamFieldId={addTeamFieldId}
          setAddTeamFieldId={setAddTeamFieldId}
          onAddTeam={onAddTeam}
          onRemoveTeam={onRemoveTeam}
          onUpdateStatus={onUpdateStatus}
          onDelete={onDelete}
          advanceMatchId={advanceMatchId}
          setAdvanceMatchId={setAdvanceMatchId}
          advanceTeamId={advanceTeamId}
          setAdvanceTeamId={setAdvanceTeamId}
          onAdvanceWinner={onAdvanceWinner}
          showAdvance={showAdvance}
        />
      ))}
    </div>
  );
}

function MatchCard({
  match,
  isDirector,
  teams,
  fields,
  matchSides,
  addTeamMatchId,
  setAddTeamMatchId,
  addTeamId,
  setAddTeamId,
  addTeamSide,
  setAddTeamSide,
  addTeamFieldId,
  setAddTeamFieldId,
  onAddTeam,
  onRemoveTeam,
  onUpdateStatus,
  onDelete,
  advanceMatchId,
  setAdvanceMatchId,
  advanceTeamId,
  setAdvanceTeamId,
  onAdvanceWinner,
  showAdvance,
}: {
  match: MatchItem;
  isDirector: boolean;
  teams: Team[];
  fields: TournamentField[];
  matchSides: string[];
  addTeamMatchId: string | null;
  setAddTeamMatchId: (v: string | null) => void;
  addTeamId: string;
  setAddTeamId: (v: string) => void;
  addTeamSide: string;
  setAddTeamSide: (v: string) => void;
  addTeamFieldId: string;
  setAddTeamFieldId: (v: string) => void;
  onAddTeam: (matchId: string) => void;
  onRemoveTeam: (matchId: string, teamId: string) => void;
  onUpdateStatus: (matchId: string, status: MatchStatus) => void;
  onDelete: (matchId: string) => void;
  advanceMatchId: string | null;
  setAdvanceMatchId: (v: string | null) => void;
  advanceTeamId: string;
  setAdvanceTeamId: (v: string) => void;
  onAdvanceWinner: (matchId: string) => void;
  showAdvance: boolean;
}) {
  const statusColor: Record<MatchStatus, string> = {
    PENDING: "text-zinc-400",
    IN_PROGRESS: "text-blue-500",
    COMPLETE: "text-green-600",
    CANCELLED: "text-red-400",
  };

  const assignedTeamIds = match.matchTeams.map((mt) => mt.teamId);
  const unassignedTeams = teams.filter((t) => !assignedTeamIds.includes(t.id));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            {match.matchNumber != null && (
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                #{match.matchNumber}
              </span>
            )}
            {match.roundNumber && (
              <span className="text-xs text-zinc-400">Round {match.roundNumber}</span>
            )}
            {match.bracketPosition && (
              <span className="text-xs font-mono text-zinc-400">{match.bracketPosition}</span>
            )}
            <span className={`text-xs font-medium ${statusColor[match.status as MatchStatus]}`}>
              {STATUS_LABELS[match.status as MatchStatus]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {match.matchTeams.length === 0 ? (
              <span className="text-sm text-zinc-400">No teams assigned</span>
            ) : (
              match.matchTeams.map((mt) => {
                const score = match.scores.find((s) => s.teamId === mt.teamId);
                return (
                  <span
                    key={mt.teamId}
                    className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {mt.side && (
                      <span className="text-xs text-zinc-400">{mt.side}</span>
                    )}
                    {mt.team.name}
                    {mt.field && (
                      <span className="text-xs text-zinc-400">@ {mt.field.name}</span>
                    )}
                    {score != null && (
                      <span className="font-semibold text-green-600">{score.calculatedScore}</span>
                    )}
                    {isDirector && (
                      <button
                        onClick={() => onRemoveTeam(match.id, mt.teamId)}
                        className="ml-0.5 text-xs text-red-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })
            )}
          </div>
          {match.scheduledAt && (
            <p className="mt-1 text-xs text-zinc-400">
              {new Date(match.scheduledAt).toLocaleString()}
            </p>
          )}
        </div>

        {isDirector && (
          <div className="flex items-center gap-2 ml-4">
            <select
              value={match.status}
              onChange={(e) => onUpdateStatus(match.id, e.target.value as MatchStatus)}
              className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {(["PENDING", "IN_PROGRESS", "COMPLETE", "CANCELLED"] as MatchStatus[]).map(
                (s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                )
              )}
            </select>
            <button
              onClick={() =>
                setAddTeamMatchId(addTeamMatchId === match.id ? null : match.id)
              }
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              + Team
            </button>
            {showAdvance && match.status === "COMPLETE" && (
              <button
                onClick={() =>
                  setAdvanceMatchId(advanceMatchId === match.id ? null : match.id)
                }
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                Advance
              </button>
            )}
            <button
              onClick={() => onDelete(match.id)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Add team inline form */}
      {addTeamMatchId === match.id && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <select
            value={addTeamId}
            onChange={(e) => setAddTeamId(e.target.value)}
            className={inputCls + " flex-1 min-w-32"}
          >
            <option value="">Select team…</option>
            {unassignedTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={addTeamFieldId}
            onChange={(e) => setAddTeamFieldId(e.target.value)}
            className={inputCls + " w-36"}
          >
            <option value="">Field?</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {matchSides.length > 0 && (
            <select
              value={addTeamSide}
              onChange={(e) => setAddTeamSide(e.target.value)}
              className={inputCls + " w-28"}
            >
              <option value="">Side?</option>
              {matchSides.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => onAddTeam(match.id)}
            disabled={!addTeamId}
            className={btnPrimary}
          >
            Add
          </button>
          <button
            onClick={() => { setAddTeamMatchId(null); setAddTeamId(""); setAddTeamSide(""); setAddTeamFieldId(""); }}
            className={btnSecondary}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Advance winner form */}
      {advanceMatchId === match.id && showAdvance && (
        <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <select
            value={advanceTeamId}
            onChange={(e) => setAdvanceTeamId(e.target.value)}
            className={inputCls + " flex-1"}
          >
            <option value="">Select winner…</option>
            {match.matchTeams.map((mt) => (
              <option key={mt.teamId} value={mt.teamId}>{mt.team.name}</option>
            ))}
          </select>
          <button
            onClick={() => onAdvanceWinner(match.id)}
            disabled={!advanceTeamId}
            className={btnPrimary}
          >
            Advance
          </button>
          <button
            onClick={() => { setAdvanceMatchId(null); setAdvanceTeamId(""); }}
            className={btnSecondary}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Style constants ─────────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const btnPrimary =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200";
const btnSecondary =
  "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400";
const labelCls = "mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400";
