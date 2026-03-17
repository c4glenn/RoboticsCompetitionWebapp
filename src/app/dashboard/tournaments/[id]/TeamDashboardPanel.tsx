"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import type { FormSchema } from "@/db/schema/tournaments";

type Team = { id: string; name: string };

export function TeamDashboardPanel({
  tournamentId,
  defaultTeamId,
  canSelectTeam,
  allTeams,
}: {
  tournamentId: string;
  defaultTeamId: string | null;
  canSelectTeam: boolean;
  allTeams: Team[];
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId ?? "");
  const [openInspections, setOpenInspections] = useState<Set<string>>(new Set());

  const { data, isLoading } = trpc.teams.teamDashboard.useQuery(
    { tournamentId, teamId: selectedTeamId },
    { enabled: !!selectedTeamId }
  );

  function toggleInspection(id: string) {
    setOpenInspections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!canSelectTeam && !defaultTeamId) return null;

  return (
    <div className="mt-10 space-y-1">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {canSelectTeam ? "Team Overview" : (data?.team.name ?? "My Team")}
        </h2>
        {canSelectTeam && (
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className={inputCls + " max-w-xs"}
          >
            <option value="">Select a team…</option>
            {allTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {!selectedTeamId && (
        <p className="text-sm text-zinc-400">Select a team to view their overview.</p>
      )}

      {selectedTeamId && isLoading && (
        <p className="text-sm text-zinc-400">Loading…</p>
      )}

      {data && (
        <div className="space-y-5">
          {/* Team header */}
          <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
            {data.team.className && <span>Class: {data.team.className}</span>}
            {data.team.pitNumber != null && <span>Pit #{data.team.pitNumber}</span>}
            <span>{data.team.checkedIn ? "✓ Checked in" : "Not checked in"}</span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Ranking */}
            <Section title="Current Ranking">
              {data.ranking ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                    #{data.ranking.position}
                  </span>
                  <span className="text-sm text-zinc-400">
                    of {data.ranking.totalTeams}
                  </span>
                  <span className="ml-4 text-sm text-zinc-500">
                    {data.ranking.totalScore} pts
                    {data.ranking.matchesPlayed > 0 && (
                      <span className="ml-2 text-zinc-400">
                        ({data.ranking.matchesPlayed} match{data.ranking.matchesPlayed !== 1 ? "es" : ""} played)
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No scores yet.</p>
              )}
            </Section>

            {/* Upcoming practice slots */}
            <Section title="Upcoming Practice Slots">
              {data.practiceSlots.length === 0 ? (
                <p className="text-sm text-zinc-400">No upcoming practice slots booked.</p>
              ) : (
                <ul className="space-y-1">
                  {data.practiceSlots.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300">{s.fieldName}</span>
                      <span className="text-zinc-400">
                        {fmtTime(s.startTime)} – {fmtTime(s.endTime)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* Upcoming matches */}
          <Section title="Upcoming Matches">
            {data.upcomingMatches.length === 0 ? (
              <p className="text-sm text-zinc-400">No upcoming matches.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.upcomingMatches.map((m) => (
                  <MatchRow key={m.id} match={m} teamId={data.team.id} />
                ))}
              </div>
            )}
          </Section>

          {/* Past matches */}
          <Section title="Past Matches">
            {data.pastMatches.length === 0 ? (
              <p className="text-sm text-zinc-400">No completed matches yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.pastMatches.map((m) => (
                  <MatchRow key={m.id} match={m} teamId={data.team.id} />
                ))}
              </div>
            )}
          </Section>

          {/* Inspection history */}
          <Section title="Inspection History">
            {data.inspections.length === 0 ? (
              <p className="text-sm text-zinc-400">No inspections recorded.</p>
            ) : (
              <ul className="space-y-2">
                {data.inspections.map((insp) => {
                  const open = openInspections.has(insp.id);
                  return (
                    <li
                      key={insp.id}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700"
                    >
                      <button
                        type="button"
                        onClick={() => toggleInspection(insp.id)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-3">
                          {insp.passed ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                              Pass
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-400">
                              Fail
                            </span>
                          )}
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            {fmtDate(insp.completedAt)}
                          </span>
                          {insp.inspector && (
                            <span className="text-xs text-zinc-400">by {insp.inspector}</span>
                          )}
                        </div>
                        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
                      </button>
                      {open && (
                        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
                          <InspectionReport
                            formData={insp.formData}
                            schema={data.inspectionFormSchema}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

type MatchData = {
  id: string;
  matchNumber: number | null;
  matchType: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  myScore: number | null;
  myField: string | null;
  opponents: { teamId: string; teamName: string; side: string | null; score: number | null }[];
};

function MatchRow({ match: m, teamId }: { match: MatchData; teamId: string }) {
  const isPast = m.status === "COMPLETE";
  const isLive = m.status === "IN_PROGRESS";
  const opponentNames = m.opponents.map((o) => o.teamName).join(", ") || "TBD";

  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
          {m.matchType === "ELIMINATION" ? `Elimination R${m.opponents[0]?.side ?? ""}` : `Match #${m.matchNumber ?? "?"}`}
          {isLive && (
            <span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
              Live
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-zinc-400 truncate">vs {opponentNames}</p>
        {m.myField && <p className="text-xs text-zinc-400">{m.myField}</p>}
        {!isPast && m.scheduledAt && (
          <p className="text-xs text-zinc-400">{fmtDate(m.scheduledAt)}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {isPast ? (
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {m.myScore ?? "—"}
            </p>
            {m.opponents.map((o) => (
              <p key={o.teamId} className="text-xs text-zinc-400">
                {o.teamName}: {o.score ?? "—"}
              </p>
            ))}
          </div>
        ) : (
          <span className="text-xs text-zinc-400">{fmtDate(m.scheduledAt ?? "")}</span>
        )}
      </div>
    </div>
  );
}

function InspectionReport({
  formData,
  schema,
}: {
  formData: Record<string, unknown>;
  schema: FormSchema | null;
}) {
  if (!schema || schema.fields.length === 0) {
    return (
      <dl className="space-y-1">
        {Object.entries(formData).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-sm">
            <dt className="text-zinc-500">{k}:</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{String(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className="space-y-1">
      {schema.fields.map((field) => {
        const raw = formData[field.name];
        let display: string;
        if (field.type === "checkbox") {
          display = raw ? "Yes" : "No";
        } else if (field.type === "select" && field.options) {
          display = field.options.find((o) => o.value === String(raw))?.label ?? String(raw ?? "—");
        } else {
          display = raw != null ? String(raw) : "—";
        }
        return (
          <div key={field.name} className="flex gap-2 text-sm">
            <dt className="text-zinc-500 shrink-0">{field.label}:</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{display}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      {children}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
