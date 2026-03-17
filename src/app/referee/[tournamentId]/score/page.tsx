"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { DynamicScoringForm } from "@/components/forms/DynamicScoringForm";

export default function RefereeScorePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);

  const { data: tournament } = trpc.tournaments.getById.useQuery({
    id: tournamentId,
  });
  const {
    data: matchList,
    refetch,
    isLoading,
  } = trpc.scoring.listMatches.useQuery({ tournamentId });

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startMatch = trpc.scoring.startMatch.useMutation({
    onSuccess: () => refetch(),
  });

  const submitScore = trpc.scoring.submitMatchScore.useMutation({
    onSuccess: (score) => {
      setSuccessMsg(`Score submitted: ${score.calculatedScore} pts`);
      setSelectedTeamId(null);
      setNotes("");
      setError(null);
      refetch();
    },
    onError: (e) => setError(e.message),
  });

  const selectedMatch = matchList?.find((m) => m.id === selectedMatchId);
  const refereeFormSchema = tournament?.competitionType?.refereeFormSchema;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/dashboard/tournaments/${tournamentId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Overview
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Referee Scoring
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{tournament?.name}</p>
      </div>

      {/* Match selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Select Match
        </label>
        <select
          value={selectedMatchId ?? ""}
          onChange={(e) => {
            const matchId = e.target.value || null;
            setSelectedMatchId(matchId);
            setSelectedTeamId(null);
            setSuccessMsg(null);
            setError(null);
            if (matchId) {
              startMatch.mutate({ matchId, tournamentId });
            }
          }}
          className={inputCls}
        >
          <option value="">— choose a match —</option>
          {isLoading && <option disabled>Loading…</option>}
          {matchList?.map((m) => {
            const isElim = m.matchType === "ELIMINATION";
            const fieldNames = [
              ...new Set(m.matchTeams.map((mt) => mt.field?.name).filter(Boolean)),
            ].join("/");
            const matchLabel = m.matchNumber != null ? `#${m.matchNumber}` : "";
            const prefix = isElim
              ? `[Elim${m.roundNumber ? ` R${m.roundNumber}` : ""}${m.bracketPosition ? ` · ${m.bracketPosition}` : ""}] ${matchLabel}`
              : `Match ${matchLabel}`;
            return (
              <option key={m.id} value={m.id}>
                {prefix.trim()}
                {fieldNames ? ` [${fieldNames}]` : ""}
                {m.matchTeams.length > 0 ? ` — ${m.matchTeams.map((mt) => mt.team.name).join(" vs ")}` : ""}
                {m.status === "COMPLETE" ? " ✓" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {selectedMatch && (
        <>
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              Teams in this match
            </h2>
            <div className="flex flex-wrap gap-2">
              {selectedMatch.matchTeams.map((mt) => {
                const hasScore = selectedMatch.scores.some(
                  (s) => s.teamId === mt.teamId
                );
                const isSelected = selectedTeamId === mt.teamId;
                return (
                  <button
                    key={mt.teamId}
                    disabled={hasScore}
                    onClick={() => {
                      setSelectedTeamId(mt.teamId);
                      setSuccessMsg(null);
                      setError(null);
                    }}
                    className={[
                      "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      hasScore
                        ? "cursor-not-allowed bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : isSelected
                        ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                        : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300",
                    ].join(" ")}
                  >
                    {mt.team.name}
                    {hasScore ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {successMsg && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
              {successMsg}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          {selectedTeamId && refereeFormSchema && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Score:{" "}
                {
                  selectedMatch.matchTeams.find(
                    (mt) => mt.teamId === selectedTeamId
                  )?.team.name
                }
              </h2>
              <DynamicScoringForm
                schema={refereeFormSchema}
                isPending={submitScore.isPending}
                submitLabel="Submit Score"
                onSubmit={(formData) => {
                  submitScore.mutate({
                    matchId: selectedMatch.id,
                    teamId: selectedTeamId,
                    tournamentId,
                    formData,
                    notes: notes || undefined,
                  });
                }}
              >
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Notes (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any notes about this match…"
                    className={inputCls}
                  />
                </div>
              </DynamicScoringForm>
            </div>
          )}
        </>
      )}

      {/* Scores summary for selected match */}
      {selectedMatch && selectedMatch.scores.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            Submitted Scores
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-50 dark:border-zinc-800">
                <th className="px-4 py-2 text-left font-medium text-zinc-500">Team</th>
                <th className="px-4 py-2 text-right font-medium text-zinc-500">Score</th>
              </tr>
            </thead>
            <tbody>
              {selectedMatch.scores.map((s) => {
                const team = selectedMatch.matchTeams.find(
                  (mt) => mt.teamId === s.teamId
                )?.team;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                      {team?.name ?? "Unknown"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                      {s.calculatedScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
