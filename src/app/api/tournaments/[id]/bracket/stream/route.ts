import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 5_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      async function send() {
        try {
          const allMatches = await db.query.matches.findMany({
            where: eq(matches.tournamentId, tournamentId),
            with: {
              matchTeams: { with: { team: true } },
              scores: true,
            },
          });

          const bracketMatches = allMatches.filter(
            (m) => m.matchType === "ELIMINATION"
          );

          const payload = JSON.stringify({
            matches: bracketMatches,
            updatedAt: new Date().toISOString(),
          });

          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          clearInterval(intervalId);
          controller.close();
        }
      }

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
      "X-Accel-Buffering": "no",
    },
  });
}
