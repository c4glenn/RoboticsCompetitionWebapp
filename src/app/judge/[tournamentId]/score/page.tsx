"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { DynamicScoringForm } from "@/components/forms/DynamicScoringForm";

export default function JudgeScorePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);

  const { data: tournament } = trpc.tournaments.getById.useQuery({
    id: tournamentId,
  });
  const { data: teams, isLoading: teamsLoading } = trpc.teams.list.useQuery({
    tournamentId,
  });

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: judgingHistory, refetch: refetchHistory } =
    trpc.scoring.getTeamJudgingScores.useQuery(
      { teamId: selectedTeamId!, tournamentId },
      { enabled: !!selectedTeamId }
    );

  const submit = trpc.scoring.submitJudgingScore.useMutation({
    onSuccess: (result) => {
      setSuccessMsg(`Judging score submitted: ${result.calculatedScore} pts`);
      setError(null);
      refetchHistory();
    },
    onError: (e) => setError(e.message),
  });

  const judgingSchema = tournament?.competitionType?.judgingFormSchema;
  const selectedTeam = teams?.find((t) => t.id === selectedTeamId);

  if (tournament && !judgingSchema) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Judging
          </h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
          Judging is not configured for this competition type.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Judging Scores
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{tournament?.name}</p>
      </div>

      {/* Team selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Select Team
        </label>
        <select
          value={selectedTeamId ?? ""}
          onChange={(e) => {
            setSelectedTeamId(e.target.value || null);
            setSuccessMsg(null);
            setError(null);
          }}
          className={inputCls}
        >
          <option value="">— choose a team —</option>
          {teamsLoading && <option disabled>Loading…</option>}
          {teams?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.pitNumber != null ? ` (Pit ${t.pitNumber})` : ""}
            </option>
          ))}
        </select>
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

      {selectedTeam && judgingSchema && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Judging: {selectedTeam.name}
          </h2>
          <DynamicScoringForm
            schema={judgingSchema}
            isPending={submit.isPending}
            submitLabel="Submit Judging Score"
            onSubmit={(formData) => {
              submit.mutate({
                teamId: selectedTeamId!,
                tournamentId,
                formData,
              });
            }}
          />
        </div>
      )}

      {/* Judging history */}
      {judgingHistory && judgingHistory.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            Previous Judging Scores
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-50 dark:border-zinc-800">
                <th className="px-4 py-2 text-left font-medium text-zinc-500">Time</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-500">Judge</th>
                <th className="px-4 py-2 text-right font-medium text-zinc-500">Score</th>
              </tr>
            </thead>
            <tbody>
              {judgingHistory.map((j) => (
                <tr
                  key={j.id}
                  className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(j.submittedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {j.judge?.name ?? j.judge?.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                    {j.calculatedScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
