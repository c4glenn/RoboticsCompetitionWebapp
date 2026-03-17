import { notFound } from "next/navigation";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { tournaments, fields, practiceFieldSlots } from "@/db/schema";
import {
  generateSlotBoundaries,
  DEFAULT_PRACTICE_WINDOW_MS,
} from "@/lib/practiceSlots";
import { PracticeFieldsStream, type PracticeSlotData } from "./PracticeFieldsStream";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PracticePublicPage({ params }: Props) {
  const { id: tournamentId } = await params;

  const tournament = await db.query.tournaments.findFirst({
    where: eq(tournaments.id, tournamentId),
    columns: {
      id: true,
      name: true,
      practiceSlotDurationMinutes: true,
      maxFuturePracticeSlots: true,
    },
  });
  if (!tournament) notFound();

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

  const slotBoundaries = generateSlotBoundaries(now, slotDurationMs, DEFAULT_PRACTICE_WINDOW_MS);

  const initialData: PracticeSlotData = {
    slotDurationMinutes: tournament.practiceSlotDurationMinutes,
    maxFuturePracticeSlots: tournament.maxFuturePracticeSlots,
    slotBoundaries: slotBoundaries.map((d) => d.toISOString()),
    fields: practiceFields,
    bookings: bookings.map((b) => ({
      id: b.id,
      fieldId: b.fieldId,
      teamId: b.teamId,
      teamName: b.team.name,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
    })),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {tournament.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Practice Field Availability</p>
      </div>

      <PracticeFieldsStream tournamentId={tournamentId} initialData={initialData} />
    </div>
  );
}

// Revalidate every 30s so the SSR snapshot stays reasonably fresh
export const revalidate = 30;
