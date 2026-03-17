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
  const [fieldId, setFieldId] = useState("");
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
    setFieldId("");
    setRoundNumber("");
    setScheduledAt("");
    setFormError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMatch.mutate({
      tournamentId,
      matchType,
      fieldId: fieldId || undefined,
      roundNumber: roundNumber ? parseInt(roundNumber) : undefined,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  }

  // ── Add/remove team ───────────────────────────────────────────────────────
  const [addTeamMatchId, setAddTeamMatchId] = useState<string | null>(null);
  const [addTeamId, setAddTeamId] = useState("");
  const [addTeamSide, setAddTeamSide] = useState<"HOME" | "AWAY" | "">("");

  const addTeam = trpc.matches.addTeam.useMutation({
    onSuccess: () => { refetch(); setAddTeamMatchId(null); setAddTeamId(""); setAddTeamSide(""); },
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

  // ── Bracket generation ────────────────────────────────────────────────────
  const [showBracketForm, setShowBracketForm] = useState(false);
  const [bracketTeamOrder, setBracketTeamOrder] = useState<string[]>([]);
  const [bracketError, setBracketError] = useState<string | null>(null);

  const generateBracket = trpc.matches.generateBracket.useMutation({
    onSuccess: () => { refetch(); setShowBracketForm(false); setBracketError(null); },
    onError: (e) => setBracketError(e.message),
  });

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
        {isDirector && !showForm && (
          <div className="flex gap-2">
            <button onClick={() => setShowBracketForm((v) => !v)} className={btnSecondary}>
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
              <label className={labelCls}>Field (optional)</label>
              <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={inputCls}>
                <option value="">— none —</option>
                {tournament?.fields?.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
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

      {/* Bracket generation form */}
      {showBracketForm && teams && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Generate Elimination Bracket
          </h2>
          <p className="text-xs text-zinc-500">
            Select teams and order them by seed (drag or use arrows). Top seed is seed 1.
          </p>

          {/* Team selector */}
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

          {/* Seed order list */}
          {bracketTeamOrder.length > 0 && (
            <ol className="space-y-1">
              {bracketTeamOrder.map((teamId, idx) => {
                const team = teams.find((t) => t.id === teamId);
                return (
                  <li
                    key={teamId}
                    className="flex items-center gap-2 rounded border border-zinc-100 bg-zinc-50 px-3 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-800"
                  >
                    <span className="w-5 text-xs text-zinc-400">{idx + 1}.</span>
                    <span className="flex-1 text-zinc-800 dark:text-zinc-200">{team?.name}</span>
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
          )}

          {bracketError && <p className="text-sm text-red-600 dark:text-red-400">{bracketError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={bracketTeamOrder.length < 2 || generateBracket.isPending}
              onClick={() =>
                generateBracket.mutate({ tournamentId, seededTeamIds: bracketTeamOrder })
              }
              className={btnPrimary}
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => { setShowBracketForm(false); setBracketTeamOrder([]); }}
              className={btnSecondary}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Standard matches */}
      <MatchSection
        title="Qualification Matches"
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
        onAddTeam={(matchId) =>
          addTeam.mutate({
            matchId,
            tournamentId,
            teamId: addTeamId,
            side: addTeamSide || undefined,
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

      {/* Elimination matches */}
      {elimMatches.length > 0 && (
        <>
          <MatchSection
            title="Elimination Bracket"
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
            onAddTeam={(matchId) =>
              addTeam.mutate({
                matchId,
                tournamentId,
                teamId: addTeamId,
                side: addTeamSide || undefined,
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

function MatchSection({
  title,
  matchItems,
  isDirector,
  teams,
  tournamentId,
  addTeamMatchId,
  setAddTeamMatchId,
  addTeamId,
  setAddTeamId,
  addTeamSide,
  setAddTeamSide,
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
  title: string;
  matchItems: MatchItem[];
  isDirector: boolean;
  teams: Team[];
  tournamentId: string;
  addTeamMatchId: string | null;
  setAddTeamMatchId: (v: string | null) => void;
  addTeamId: string;
  setAddTeamId: (v: string) => void;
  addTeamSide: "HOME" | "AWAY" | "";
  setAddTeamSide: (v: "HOME" | "AWAY" | "") => void;
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

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
        {title}
      </h2>
      {matchItems.length === 0 ? (
        <p className="text-sm text-zinc-400">No matches yet.</p>
      ) : (
        <div className="space-y-3">
          {matchItems.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              isDirector={isDirector}
              teams={teams}
              addTeamMatchId={addTeamMatchId}
              setAddTeamMatchId={setAddTeamMatchId}
              addTeamId={addTeamId}
              setAddTeamId={setAddTeamId}
              addTeamSide={addTeamSide}
              setAddTeamSide={setAddTeamSide}
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
      )}
    </section>
  );
}

function MatchCard({
  match,
  isDirector,
  teams,
  addTeamMatchId,
  setAddTeamMatchId,
  addTeamId,
  setAddTeamId,
  addTeamSide,
  setAddTeamSide,
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
  addTeamMatchId: string | null;
  setAddTeamMatchId: (v: string | null) => void;
  addTeamId: string;
  setAddTeamId: (v: string) => void;
  addTeamSide: "HOME" | "AWAY" | "";
  setAddTeamSide: (v: "HOME" | "AWAY" | "") => void;
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
            {match.field && (
              <span className="text-xs text-zinc-400">[{match.field.name}]</span>
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
        <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <select
            value={addTeamId}
            onChange={(e) => setAddTeamId(e.target.value)}
            className={inputCls + " flex-1"}
          >
            <option value="">Select team…</option>
            {unassignedTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={addTeamSide}
            onChange={(e) => setAddTeamSide(e.target.value as "HOME" | "AWAY" | "")}
            className={inputCls + " w-24"}
          >
            <option value="">Side?</option>
            <option value="HOME">Home</option>
            <option value="AWAY">Away</option>
          </select>
          <button
            onClick={() => onAddTeam(match.id)}
            disabled={!addTeamId}
            className={btnPrimary}
          >
            Add
          </button>
          <button
            onClick={() => { setAddTeamMatchId(null); setAddTeamId(""); setAddTeamSide(""); }}
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
