"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [competitionTypeId, setCompetitionTypeId] = useState("");
  const [classes, setClasses] = useState("Collegiate\nHigh School");
  const [logoUrl, setLogoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: competitionTypes, isLoading } =
    trpc.competitionTypes.list.useQuery();

  const create = trpc.tournaments.create.useMutation({
    onSuccess: (tournament) => {
      router.push(`/dashboard/tournaments/${tournament.id}`);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const classList = classes
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    if (classList.length === 0) {
      setError("Add at least one competition class.");
      return;
    }
    create.mutate({
      name,
      competitionTypeId,
      classes: classList,
      logoUrl: logoUrl || undefined,
    });
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          New Tournament
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <Field label="Tournament Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="IEEE Region 5 2026"
          />
        </Field>

        <Field label="Competition Type">
          {isLoading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <select
              required
              value={competitionTypeId}
              onChange={(e) => setCompetitionTypeId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select a competition type…</option>
              {competitionTypes?.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="Competition Classes"
          hint="One per line"
        >
          <textarea
            required
            value={classes}
            onChange={(e) => setClasses(e.target.value)}
            rows={4}
            className={inputCls}
          />
        </Field>

        <Field label="Logo URL" hint="Optional">
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
        </Field>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {create.isPending ? "Creating…" : "Create Tournament"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-zinc-400">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500";
