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

  useEffect(() => {
    if (tournament) {
      setMatchesPerTeam(String(tournament.matchesPerTeam ?? 3));
      setAggMethod((tournament.scoreAggregation?.method ?? "best_n") as ScoreAggregationMethod);
      setAggN(String(tournament.scoreAggregation?.n ?? 2));
    }
  }, [tournament]);

  const updateSettings = trpc.tournaments.updateSettings.useMutation({
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

  // --- Role assignment ---
  const [roleEmail, setRoleEmail] = useState("");
  const [roleToAssign, setRoleToAssign] = useState<Role>("REFEREE");
  const [roleError, setRoleError] = useState<string | null>(null);

  const findUser = trpc.roles.findUserByEmail.useQuery(
    { email: roleEmail },
    { enabled: false }
  );

  const assignRole = trpc.roles.assign.useMutation({
    onSuccess: () => { refetchRoles(); setRoleEmail(""); setRoleError(null); },
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
    assignRole.mutate({
      tournamentId,
      userId: result.data.id,
      role: roleToAssign,
    });
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
                onChange={(e) => setRoleToAssign(e.target.value as Role)}
                className={inputCls + " w-36"}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button type="submit" className={btnPrimary}>Assign</button>
            </div>
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
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200";
const btnSecondary =
  "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400";
