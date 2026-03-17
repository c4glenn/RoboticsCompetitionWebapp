"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LeaderboardTable } from "./LeaderboardTable";
import type { LeaderboardRow, LastMatch, LiveMatch } from "@/db/queries/leaderboard";
import type { ScoreAggregation } from "@/db/schema";

interface Props {
  tournamentId: string;
  initialRows: LeaderboardRow[];
  classes: { id: string; name: string }[];
  showJudging: boolean;
  matchesPerTeam: number;
  scoreAggregation: ScoreAggregation;
  hasElimination: boolean;
}

export function LeaderboardStream({
  tournamentId,
  initialRows,
  classes,
  showJudging,
  matchesPerTeam,
  scoreAggregation,
  hasElimination,
}: Props) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initialRows);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [inProgressMatches, setInProgressMatches] = useState<LiveMatch[]>([]);
  const [nextMatch, setNextMatch] = useState<LiveMatch | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(
      `/api/tournaments/${tournamentId}/leaderboard/stream`
    );
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          teams: LeaderboardRow[];
          lastMatch: LastMatch | null;
          inProgressMatches: LiveMatch[];
          nextMatch: LiveMatch | null;
          updatedAt: string;
        };
        setRows(data.teams);
        setLastMatch(data.lastMatch);
        setInProgressMatches(data.inProgressMatches ?? []);
        setNextMatch(data.nextMatch ?? null);
        setUpdatedAt(data.updatedAt);
      } catch {
        // malformed event — ignore
      }
    };

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [tournamentId]);

  const showLogos = rows.some((r) => r.logoUrl != null);

  return (
    <div>
      {/* Class filter tabs + bracket link */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {classes.length > 0 && (
          <>
            <button
              onClick={() => setClassFilter(null)}
              className={tabCls(classFilter === null)}
            >
              All
            </button>
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => setClassFilter(c.id)}
                className={tabCls(classFilter === c.id)}
              >
                {c.name}
              </button>
            ))}
          </>
        )}

        {hasElimination && (
          <Link
            href={`/tournaments/${tournamentId}/bracket`}
            className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            View Bracket →
          </Link>
        )}
      </div>

      {inProgressMatches.length > 0 && (
        <div className="mb-3 space-y-2">
          {inProgressMatches.map((m) => (
            <MatchBanner key={m.matchId} match={m} label="Now Playing" accent="blue" />
          ))}
        </div>
      )}

      {nextMatch && (
        <div className="mb-3">
          <MatchBanner match={nextMatch} label="Queuing Now" accent="amber" />
        </div>
      )}

      {lastMatch && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Last Completed Match
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {lastMatch.matchNumber != null
                ? `Match #${lastMatch.matchNumber}`
                : lastMatch.roundNumber != null
                  ? `Round ${lastMatch.roundNumber}`
                  : "Match"}
            </span>
            <span className="text-xs text-zinc-300 dark:text-zinc-600">·</span>
            {lastMatch.teams.map((t) => (
              <span key={t.teamId} className="flex items-center gap-1.5 text-sm">
                {t.side && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                    {t.side}
                  </span>
                )}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{t.teamName}</span>
                {t.score != null && (
                  <span className="tabular-nums text-zinc-500">{t.score} pts</span>
                )}
              </span>
            ))}
            <span className="ml-auto text-xs text-zinc-400">
              {new Date(lastMatch.completedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}

      <LeaderboardTable
        rows={rows}
        showJudging={showJudging}
        showLogos={showLogos}
        matchesPerTeam={matchesPerTeam}
        scoreAggregation={scoreAggregation}
        classFilter={classFilter}
      />

      {/* Live status indicator */}
      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-green-400" : "bg-zinc-400"
          }`}
        />
        {connected ? "Live" : "Connecting…"}
        {updatedAt && (
          <span>· Updated {new Date(updatedAt).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}

function matchLabel(m: LiveMatch) {
  if (m.matchNumber != null) return `Match #${m.matchNumber}`;
  if (m.roundNumber != null) return `Round ${m.roundNumber}`;
  return "Match";
}

function MatchBanner({
  match,
  label,
  accent,
}: {
  match: LiveMatch;
  label: string;
  accent: "blue" | "amber";
}) {
  const colors = {
    blue: {
      border: "border-blue-200 dark:border-blue-800",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      dot: "bg-blue-400",
    },
    amber: {
      border: "border-amber-200 dark:border-amber-800",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      dot: "bg-amber-400",
    },
  }[accent];

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${colors.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {label}
        </span>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {matchLabel(match)}
        </span>
        {match.teams.length > 0 && (
          <>
            <span className="text-xs text-zinc-300 dark:text-zinc-600">·</span>
            {match.teams.map((t) => (
              <span key={t.teamId} className="flex items-center gap-1 text-sm">
                {t.side && (
                  <span className="rounded bg-white/60 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                    {t.side}
                  </span>
                )}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{t.teamName}</span>
                {t.fieldName && (
                  <span className="text-xs text-zinc-400">@ {t.fieldName}</span>
                )}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function tabCls(active: boolean) {
  return [
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400",
  ].join(" ");
}
