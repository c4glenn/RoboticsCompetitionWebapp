import type { LeaderboardRow } from "@/db/queries/leaderboard";
import type { ScoreAggregation } from "@/db/schema";
import Image from "next/image";

interface Props {
  rows: LeaderboardRow[];
  showJudging?: boolean;
  showLogos: boolean;
  matchesPerTeam: number;
  scoreAggregation: ScoreAggregation;
  /** If set, only rows with this classId are shown. null = all classes. */
  classFilter?: string | null;
}

function aggColumnLabel(agg: ScoreAggregation, hasJudging: boolean): string {
  if (hasJudging) return "Total";
  if (agg.method === "best_n") return `Best ${agg.n ?? 1}`;
  if (agg.method === "average") return "Avg";
  return "Total";
}

export function LeaderboardTable({
  rows,
  showJudging,
  showLogos,
  matchesPerTeam,
  scoreAggregation,
  classFilter,
}: Props) {
  const filtered =
    classFilter == null
      ? rows
      : rows.filter((r) => r.classId === classFilter);

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        No teams yet.
      </p>
    );
  }

  const finalColLabel = aggColumnLabel(scoreAggregation, !!showJudging);

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 dark:border-zinc-800">
            {showLogos && (
              <th className="w-10 px-3 py-3" aria-label="Logo" />
            )}
            <th className="w-10 px-4 py-3 text-left font-medium text-zinc-500">
              #
            </th>
            <th className="w-12 px-4 py-3 text-left font-medium text-zinc-500">
              Pit
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-500">
              Team
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-500">
              Class
            </th>
            {Array.from({ length: matchesPerTeam }, (_, i) => (
              <th key={i} className="px-3 py-3 text-right font-medium text-zinc-400">
                Q{i + 1}
              </th>
            ))}
            {showJudging && (
              <th className="px-4 py-3 text-right font-medium text-zinc-500">
                Judging
              </th>
            )}
            <th className="px-4 py-3 text-right font-medium text-zinc-500">
              {finalColLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => (
            <tr
              key={row.teamId}
              className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
            >
              {showLogos && (
                <td className="px-3 py-2">
                  {row.logoUrl ? (
                    <Image
                      src={row.logoUrl}
                      alt={`${row.teamName} logo`}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded object-contain"
                    />
                  ) : (
                    <div className="h-8 w-8" />
                  )}
                </td>
              )}
              <td className="px-4 py-3 text-zinc-400">{idx + 1}</td>
              <td className="px-4 py-3 tabular-nums text-zinc-500">
                {row.pitNumber ?? "—"}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {row.teamName}
                </p>
                {row.schoolOrOrg && (
                  <p className="text-xs text-zinc-400">{row.schoolOrOrg}</p>
                )}
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {row.className ?? "—"}
              </td>
              {row.individualScores.map((score, i) => (
                <td key={i} className="px-3 py-3 text-right tabular-nums text-zinc-400">
                  {score != null ? score : <span className="text-zinc-200 dark:text-zinc-700">—</span>}
                </td>
              ))}
              {showJudging && (
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                  {row.judgingScore}
                </td>
              )}
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                {row.totalScore}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
