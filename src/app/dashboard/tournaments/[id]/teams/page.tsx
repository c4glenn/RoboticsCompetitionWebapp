"use client";

import { useState, use } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

export default function TeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const { data: tournament } = trpc.tournaments.getById.useQuery({
    id: tournamentId,
  });
  const { data: teams, refetch } = trpc.teams.list.useQuery({ tournamentId });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [pitNumber, setPitNumber] = useState("");
  const [schoolOrOrg, setSchoolOrOrg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isDirector = tournament?.userRoles?.some(
    (r) => r.role === "DIRECTOR"
  );

  const create = trpc.teams.create.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setError(e.message),
  });

  const update = trpc.teams.update.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setError(e.message),
  });

  const del = trpc.teams.delete.useMutation({
    onSuccess: () => refetch(),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setName("");
    setClassId("");
    setPitNumber("");
    setSchoolOrOrg("");
    setError(null);
  }

  function openEdit(team: NonNullable<typeof teams>[number]) {
    setEditId(team.id);
    setName(team.name);
    setClassId(team.classId);
    setPitNumber(team.pitNumber?.toString() ?? "");
    setSchoolOrOrg(team.schoolOrOrg ?? "");
    setShowForm(true);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pit = pitNumber ? parseInt(pitNumber) : undefined;
    if (editId) {
      update.mutate({
        id: editId,
        tournamentId,
        name,
        classId,
        pitNumber: pit ?? null,
        schoolOrOrg: schoolOrOrg || null,
      });
    } else {
      create.mutate({
        tournamentId,
        name,
        classId,
        pitNumber: pit,
        schoolOrOrg: schoolOrOrg || undefined,
      });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/tournaments/${tournamentId}`}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            ← {tournament?.name ?? "Tournament"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Teams
          </h1>
        </div>
        {isDirector && !showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Add Team
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {editId ? "Edit Team" : "New Team"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className={inputCls}
            />
            <select
              required
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select class…</option>
              {tournament?.classes?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={pitNumber}
              onChange={(e) => setPitNumber(e.target.value)}
              placeholder="Pit number (optional)"
              className={inputCls}
            />
            <input
              value={schoolOrOrg}
              onChange={(e) => setSchoolOrOrg(e.target.value)}
              placeholder="School / Org (optional)"
              className={inputCls}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {editId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {!teams || teams.length === 0 ? (
          <p className="p-6 text-sm text-zinc-400">No teams yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Class</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Pit</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">School/Org</th>
                {isDirector && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr
                  key={team.id}
                  className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{team.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{team.class?.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{team.pitNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-500">{team.schoolOrOrg ?? "—"}</td>
                  {isDirector && (
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => openEdit(team)}
                          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => del.mutate({ id: team.id, tournamentId })}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
