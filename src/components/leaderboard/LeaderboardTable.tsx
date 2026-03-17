import type { LeaderboardRow } from "@/db/queries/leaderboard";

interface Props {
  rows: LeaderboardRow[];
  showJudging?: boolean;
  /** If set, only rows with this classId are shown. null = all classes. */
  classFilter?: string | null;
}

export function LeaderboardTable({ rows, showJudging, classFilter }: Props) {
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

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 dark:border-zinc-800">
            <th className="w-10 px-4 py-3 text-left font-medium text-zinc-500">
              #
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-500">
              Team
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-500">
              Class
            </th>
            <th className="px-4 py-3 text-right font-medium text-zinc-500">
              Match
            </th>
            {showJudging && (
              <th className="px-4 py-3 text-right font-medium text-zinc-500">
                Judging
              </th>
            )}
            <th className="px-4 py-3 text-right font-medium text-zinc-500">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => (
            <tr
              key={row.teamId}
              className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
            >
              <td className="px-4 py-3 text-zinc-400">{idx + 1}</td>
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
              <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                {row.matchScore}
              </td>
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
