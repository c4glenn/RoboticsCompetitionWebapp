"use client";

import { useState, use } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

export default function FieldsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const { data: tournament } = trpc.tournaments.getById.useQuery({ id: tournamentId });
  const { data: fields, refetch } = trpc.fields.list.useQuery({ tournamentId });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isPractice, setIsPractice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirector = tournament?.userRoles?.some((r) => r.role === "DIRECTOR");

  const create = trpc.fields.create.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setError(e.message),
  });

  const update = trpc.fields.update.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setError(e.message),
  });

  const del = trpc.fields.delete.useMutation({ onSuccess: () => refetch() });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setName("");
    setIsPractice(false);
    setError(null);
  }

  function openEdit(field: NonNullable<typeof fields>[number]) {
    setEditId(field.id);
    setName(field.name);
    setIsPractice(field.isPractice);
    setShowForm(true);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (editId) {
      update.mutate({ id: editId, tournamentId, name, isPractice });
    } else {
      create.mutate({ tournamentId, name, isPractice });
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
            Fields
          </h1>
        </div>
        {isDirector && !showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
          >
            Add Field
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {editId ? "Edit Field" : "New Field"}
          </h2>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name (e.g. Field 1)"
            className={inputCls}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isPractice}
              onChange={(e) => setIsPractice(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Practice field
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
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
        {!fields || fields.length === 0 ? (
          <p className="p-6 text-sm text-zinc-400">No fields yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {fields.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {f.name}
                  </span>
                  {f.isPractice && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                      Practice
                    </span>
                  )}
                </div>
                {isDirector && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => openEdit(f)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => del.mutate({ id: f.id, tournamentId })}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
