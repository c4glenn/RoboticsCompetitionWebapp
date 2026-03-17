"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { DynamicScoringForm } from "@/components/forms/DynamicScoringForm";

export default function InspectPage({
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
  const [passed, setPassed] = useState<boolean | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: inspectionHistory, refetch: refetchHistory } =
    trpc.scoring.getTeamInspections.useQuery(
      { teamId: selectedTeamId!, tournamentId },
      { enabled: !!selectedTeamId }
    );

  const submit = trpc.scoring.submitInspection.useMutation({
    onSuccess: (result) => {
      setSuccessMsg(
        result.passed ? "Inspection PASSED ✓" : "Inspection FAILED ✗"
      );
      setPassed(null);
      setError(null);
      refetchHistory();
    },
    onError: (e) => setError(e.message),
  });

  const inspectionSchema = tournament?.competitionType?.inspectionFormSchema;
  const selectedTeam = teams?.find((t) => t.id === selectedTeamId);

  function handleSubmit(formData: Record<string, unknown>) {
    if (passed === null) {
      setError("Please mark the inspection as passed or failed.");
      return;
    }
    submit.mutate({ teamId: selectedTeamId!, tournamentId, formData, passed });
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
          Robot Inspection
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
            setPassed(null);
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
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            successMsg.includes("PASSED")
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {successMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {selectedTeam && inspectionSchema && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Inspecting: {selectedTeam.name}
          </h2>
          <DynamicScoringForm
            schema={inspectionSchema}
            isPending={submit.isPending}
            submitLabel="Submit Inspection"
            onSubmit={handleSubmit}
          >
            {/* Pass/Fail toggle */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Result <span className="text-red-500">*</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPassed(true)}
                  className={[
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    passed === true
                      ? "bg-green-600 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300",
                  ].join(" ")}
                >
                  Pass
                </button>
                <button
                  type="button"
                  onClick={() => setPassed(false)}
                  className={[
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    passed === false
                      ? "bg-red-600 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300",
                  ].join(" ")}
                >
                  Fail
                </button>
              </div>
            </div>
          </DynamicScoringForm>
        </div>
      )}

      {/* Inspection history */}
      {inspectionHistory && inspectionHistory.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            Inspection History
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-50 dark:border-zinc-800">
                <th className="px-4 py-2 text-left font-medium text-zinc-500">Time</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-500">Inspector</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-500">Result</th>
              </tr>
            </thead>
            <tbody>
              {inspectionHistory.map((ins) => (
                <tr
                  key={ins.id}
                  className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(ins.completedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {ins.inspector?.name ?? ins.inspector?.email ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {ins.passed ? (
                      <span className="font-medium text-green-600 dark:text-green-400">
                        Pass
                      </span>
                    ) : (
                      <span className="font-medium text-red-600 dark:text-red-400">
                        Fail
                      </span>
                    )}
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
