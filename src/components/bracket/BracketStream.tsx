"use client";

import { useEffect, useState } from "react";
import { BracketVisualization, type BracketMatch } from "./BracketVisualization";

interface Props {
  tournamentId: string;
  initialMatches: BracketMatch[];
}

export function BracketStream({ tournamentId, initialMatches }: Props) {
  const [bracketMatches, setBracketMatches] =
    useState<BracketMatch[]>(initialMatches);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(
      `/api/tournaments/${tournamentId}/bracket/stream`
    );
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setBracketMatches(data.matches);
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [tournamentId]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={[
            "h-2 w-2 rounded-full",
            connected ? "bg-green-500" : "bg-zinc-400",
          ].join(" ")}
        />
        <span className="text-xs text-zinc-500">
          {connected ? "Live" : "Connecting…"}
        </span>
      </div>

      {bracketMatches.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-400">
            No elimination bracket has been generated yet.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <BracketVisualization matches={bracketMatches} />
        </div>
      )}
    </div>
  );
}
