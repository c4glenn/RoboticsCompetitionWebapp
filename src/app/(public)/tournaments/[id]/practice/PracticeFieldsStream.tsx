"use client";

import { useEffect, useState } from "react";

interface Booking {
  id: string;
  fieldId: string;
  teamId: string;
  teamName: string;
  startTime: string;
  endTime: string;
}

interface Field {
  id: string;
  name: string;
}

export interface PracticeSlotData {
  slotDurationMinutes: number;
  maxFuturePracticeSlots: number;
  slotBoundaries: string[];
  fields: Field[];
  bookings: Booking[];
  updatedAt?: string;
}

function buildBookingMap(bookings: Booking[]): Record<string, Record<string, Booking>> {
  const map: Record<string, Record<string, Booking>> = {};
  for (const b of bookings) {
    if (!map[b.fieldId]) map[b.fieldId] = {};
    map[b.fieldId][b.startTime] = b;
  }
  return map;
}

function formatSlotTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  tournamentId: string;
  initialData: PracticeSlotData;
}

export function PracticeFieldsStream({ tournamentId, initialData }: Props) {
  const [slotData, setSlotData] = useState<PracticeSlotData>(initialData);
  const [now, setNow] = useState(() => new Date());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/tournaments/${tournamentId}/practice/stream`);
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      try {
        setSlotData(JSON.parse(event.data));
        setNow(new Date());
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [tournamentId]);

  // Tick now every 30s so past slots grey out
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const bookingMap = buildBookingMap(slotData.bookings);

  if (slotData.fields.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No practice fields are currently configured.</p>
    );
  }

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
          {connected ? "Live" : "Connecting…"} · {slotData.slotDurationMinutes}-min slots
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 w-24">
                Time
              </th>
              {slotData.fields.map((f) => (
                <th
                  key={f.id}
                  className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                >
                  {f.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800/50 dark:bg-zinc-950">
            {slotData.slotBoundaries.map((slotIso) => {
              const isPast = new Date(slotIso) <= now;
              return (
                <tr key={slotIso} className={isPast ? "opacity-40" : ""}>
                  <td className="px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {formatSlotTime(slotIso)}
                  </td>
                  {slotData.fields.map((f) => {
                    const booking = bookingMap[f.id]?.[slotIso];
                    return (
                      <td key={f.id} className="px-4 py-3">
                        {booking ? (
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {booking.teamName}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            {isPast ? "—" : "Available"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
