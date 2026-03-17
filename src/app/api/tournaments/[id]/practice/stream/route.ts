import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { tournaments, fields, practiceFieldSlots } from "@/db/schema";
import {
  generateSlotBoundaries,
  DEFAULT_PRACTICE_WINDOW_MS,
} from "@/lib/practiceSlots";

// Keep Node.js runtime so setInterval and long-lived connections are supported.
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
          const tournament = await db.query.tournaments.findFirst({
            where: eq(tournaments.id, tournamentId),
            columns: { practiceSlotDurationMinutes: true },
          });
          if (!tournament) {
            clearInterval(intervalId);
            controller.close();
            return;
          }

          const slotDurationMs = tournament.practiceSlotDurationMinutes * 60_000;
          const now = new Date();
          const windowEnd = new Date(now.getTime() + DEFAULT_PRACTICE_WINDOW_MS);

          const [practiceFields, bookings] = await Promise.all([
            db.query.fields.findMany({
              where: and(
                eq(fields.tournamentId, tournamentId),
                eq(fields.isPractice, true)
              ),
              orderBy: (f, { asc }) => [asc(f.name)],
            }),
            db.query.practiceFieldSlots.findMany({
              where: and(
                eq(practiceFieldSlots.tournamentId, tournamentId),
                gte(practiceFieldSlots.startTime, now),
                lt(practiceFieldSlots.startTime, windowEnd)
              ),
              with: { team: { columns: { id: true, name: true } } },
            }),
          ]);

          const slotBoundaries = generateSlotBoundaries(
            now,
            slotDurationMs,
            DEFAULT_PRACTICE_WINDOW_MS
          );

          const payload = JSON.stringify({
            slotDurationMinutes: tournament.practiceSlotDurationMinutes,
            slotBoundaries: slotBoundaries.map((d) => d.toISOString()),
            fields: practiceFields,
            bookings: bookings.map((b) => ({
              id: b.id,
              fieldId: b.fieldId,
              teamId: b.teamId,
              teamName: b.team.name,
              bookedByUserId: b.bookedByUserId,
              startTime: b.startTime.toISOString(),
              endTime: b.endTime.toISOString(),
            })),
            updatedAt: now.toISOString(),
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
      // Required for Cloudflare to pass SSE through without buffering
      "X-Accel-Buffering": "no",
    },
  });
}
