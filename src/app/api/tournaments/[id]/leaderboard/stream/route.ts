import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import {
  getLeaderboard,
  getLastCompletedMatch,
  getInProgressMatches,
  getNextQueuedMatch,
} from "@/db/queries/leaderboard";

// Keep Node.js runtime so setInterval and long-lived connections are supported.
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 5_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const encoder = new TextEncoder();

  // Fetch match duration once — used to compute the "queuing now" visibility window.
  const tournament = await db.query.tournaments.findFirst({
    where: eq(tournaments.id, tournamentId),
    with: { competitionType: { columns: { matchDurationMinutes: true } } },
    columns: {},
  });
  const matchDurationMs =
    (tournament?.competitionType?.matchDurationMinutes ?? 5) * 60_000;
  // Only show "Queuing Now" if the match starts within 4× the match duration.
  const queueCutoffMs = 4 * matchDurationMs;

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      async function send() {
        try {
          const [rows, lastMatch, inProgressMatches, nextMatch] = await Promise.all([
            getLeaderboard(tournamentId),
            getLastCompletedMatch(tournamentId),
            getInProgressMatches(tournamentId),
            getNextQueuedMatch(tournamentId, db, { maxAheadMs: queueCutoffMs }),
          ]);
          const payload = JSON.stringify({
            teams: rows,
            lastMatch,
            inProgressMatches,
            nextMatch,
            updatedAt: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // DB error — close cleanly rather than leaving the stream dangling
          clearInterval(intervalId);
          controller.close();
        }
      }

      // Send the initial snapshot immediately, then poll.
      await send();
      intervalId = setInterval(send, POLL_INTERVAL_MS);
    },
    cancel() {
      clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Required for Cloudflare to pass SSE through without buffering
      "X-Accel-Buffering": "no",
    },
  });
}
