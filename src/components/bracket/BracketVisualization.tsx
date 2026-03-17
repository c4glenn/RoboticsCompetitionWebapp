/**
 * SVG-based single-elimination bracket visualization.
 *
 * Expects matches with bracketPosition in "round-slot" format (e.g. "1-1", "2-1").
 * Server-renderable (no client-only hooks).
 */

export interface BracketMatch {
  id: string;
  roundNumber: number | null;
  bracketPosition: string | null;
  status: string;
  matchTeams: {
    teamId: string;
    side: string | null;
    team: { name: string };
  }[];
  scores: {
    teamId: string;
    calculatedScore: number | null;
  }[];
}

interface Props {
  matches: BracketMatch[];
}

// Layout constants
const CARD_W = 160;
const CARD_H = 56;
const ROUND_GAP = 80; // horizontal gap between rounds
const SLOT_GAP = 20;  // minimum vertical gap between match cards in the same round

/**
 * Compute the vertical center y-coordinate for a match given its bracket position.
 * In round R, slot S (1-indexed):
 *   Each slot occupies (CARD_H + SLOT_GAP) * 2^(R-1) pixels of vertical space.
 *   The center of slot S in round R sits at: (S - 0.5) * slotHeight
 */
function matchY(round: number, slot: number, totalRounds: number): number {
  const slotHeight = (CARD_H + SLOT_GAP) * Math.pow(2, round - 1);
  // Align to round 1's total height so higher rounds are vertically centred
  return (slot - 0.5) * slotHeight;
}

function matchX(round: number): number {
  return (round - 1) * (CARD_W + ROUND_GAP);
}

export function BracketVisualization({ matches }: Props) {
  if (matches.length === 0) {
    return <p className="text-sm text-zinc-400">No elimination matches yet.</p>;
  }

  // Parse bracket positions
  const parsed = matches
    .filter((m) => m.roundNumber && m.bracketPosition)
    .map((m) => {
      const [, slotStr] = m.bracketPosition!.split("-");
      return { match: m, round: m.roundNumber!, slot: parseInt(slotStr, 10) };
    });

  if (parsed.length === 0) {
    return <p className="text-sm text-zinc-400">No bracket positions assigned yet.</p>;
  }

  const totalRounds = Math.max(...parsed.map((p) => p.round));
  const round1SlotCount = Math.pow(2, totalRounds - 1);

  // SVG dimensions
  const svgW = totalRounds * (CARD_W + ROUND_GAP) - ROUND_GAP + 20;
  const svgH = round1SlotCount * (CARD_H + SLOT_GAP) + 40;

  // Round labels
  const roundLabels: string[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) roundLabels.push("Final");
    else if (r === totalRounds - 1) roundLabels.push("Semi-finals");
    else roundLabels.push(`Round ${r}`);
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgW}
        height={svgH + 32}
        viewBox={`0 -32 ${svgW} ${svgH + 32}`}
        className="font-sans"
      >
        {/* Round labels */}
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
          <text
            key={`label-${r}`}
            x={matchX(r) + CARD_W / 2}
            y={-12}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            className="fill-zinc-400"
          >
            {roundLabels[r - 1]}
          </text>
        ))}

        {/* Connector lines */}
        {parsed
          .filter((p) => p.round < totalRounds)
          .map((p) => {
            const cy = matchY(p.round, p.slot, totalRounds) + CARD_H / 2;
            const cx = matchX(p.round) + CARD_W;
            const nextSlot = Math.ceil(p.slot / 2);
            const ncy = matchY(p.round + 1, nextSlot, totalRounds) + CARD_H / 2;
            const ncx = matchX(p.round + 1);
            const midX = cx + ROUND_GAP / 2;
            return (
              <path
                key={`conn-${p.match.id}`}
                d={`M ${cx} ${cy} H ${midX} V ${ncy} H ${ncx}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="stroke-zinc-300 dark:stroke-zinc-700"
              />
            );
          })}

        {/* Match cards */}
        {parsed.map((p) => {
          const x = matchX(p.round);
          const y = matchY(p.round, p.slot, totalRounds);

          const teamA = p.match.matchTeams.find((mt) => mt.side === "HOME") ?? p.match.matchTeams[0];
          const teamB = p.match.matchTeams.find((mt) => mt.side === "AWAY") ?? p.match.matchTeams[1];

          const scoreA = teamA
            ? p.match.scores.find((s) => s.teamId === teamA.teamId)?.calculatedScore
            : null;
          const scoreB = teamB
            ? p.match.scores.find((s) => s.teamId === teamB.teamId)?.calculatedScore
            : null;

          const isComplete = p.match.status === "COMPLETE";
          const winnerTeamId =
            isComplete && scoreA != null && scoreB != null
              ? scoreA >= scoreB
                ? teamA?.teamId
                : teamB?.teamId
              : null;

          const rowH = CARD_H / 2;

          return (
            <g key={p.match.id}>
              {/* Card background */}
              <rect
                x={x}
                y={y}
                width={CARD_W}
                height={CARD_H}
                rx={6}
                fill="white"
                stroke="currentColor"
                strokeWidth={1}
                className="fill-white stroke-zinc-200 dark:fill-zinc-900 dark:stroke-zinc-700"
              />
              {/* Divider */}
              <line
                x1={x}
                y1={y + rowH}
                x2={x + CARD_W}
                y2={y + rowH}
                stroke="currentColor"
                strokeWidth={1}
                className="stroke-zinc-100 dark:stroke-zinc-800"
              />

              {/* Team A row */}
              <TeamRow
                x={x}
                y={y}
                w={CARD_W}
                h={rowH}
                name={teamA?.team.name ?? "TBD"}
                score={scoreA}
                isWinner={winnerTeamId === teamA?.teamId}
              />
              {/* Team B row */}
              <TeamRow
                x={x}
                y={y + rowH}
                w={CARD_W}
                h={rowH}
                name={teamB?.team.name ?? "TBD"}
                score={scoreB}
                isWinner={winnerTeamId === teamB?.teamId}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TeamRow({
  x,
  y,
  w,
  h,
  name,
  score,
  isWinner,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  score: number | null | undefined;
  isWinner: boolean;
}) {
  const padding = 8;
  const cy = y + h / 2;

  return (
    <>
      {isWinner && (
        <rect
          x={x + 1}
          y={y + 1}
          width={w - 2}
          height={h - 2}
          rx={5}
          fill="currentColor"
          className="fill-violet-50 dark:fill-violet-900/20"
        />
      )}
      <text
        x={x + padding}
        y={cy}
        dominantBaseline="middle"
        fontSize={11}
        fill="currentColor"
        className={isWinner ? "fill-violet-700 dark:fill-violet-400 font-semibold" : "fill-zinc-700 dark:fill-zinc-300"}
      >
        {truncate(name, 18)}
      </text>
      {score != null && (
        <text
          x={x + w - padding}
          y={cy}
          dominantBaseline="middle"
          textAnchor="end"
          fontSize={11}
          fontWeight={isWinner ? "bold" : "normal"}
          fill="currentColor"
          className={isWinner ? "fill-violet-700 dark:fill-violet-400" : "fill-zinc-500 dark:fill-zinc-400"}
        >
          {score}
        </text>
      )}
    </>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
