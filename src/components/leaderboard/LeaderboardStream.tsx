"use client";

import { useEffect, useRef, useState } from "react";
import { LeaderboardTable } from "./LeaderboardTable";
import type { LeaderboardRow } from "@/db/queries/leaderboard";

interface Props {
  tournamentId: string;
  initialRows: LeaderboardRow[];
  classes: { id: string; name: string }[];
  showJudging: boolean;
}

export function LeaderboardStream({
  tournamentId,
  initialRows,
  classes,
  showJudging,
}: Props) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initialRows);
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
          updatedAt: string;
        };
        setRows(data.teams);
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

  const allClasses = classes;

  return (
    <div>
      {/* Class filter tabs */}
      {allClasses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setClassFilter(null)}
            className={tabCls(classFilter === null)}
          >
            All
          </button>
          {allClasses.map((c) => (
            <button
              key={c.id}
              onClick={() => setClassFilter(c.id)}
              className={tabCls(classFilter === c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <LeaderboardTable
        rows={rows}
        showJudging={showJudging}
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

function tabCls(active: boolean) {
  return [
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400",
  ].join(" ");
}
