"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

interface Booking {
  id: string;
  fieldId: string;
  teamId: string;
  teamName: string;
  bookedByUserId: string | null;
  startTime: string;
  endTime: string;
}

interface Field {
  id: string;
  name: string;
}

interface SlotData {
  slotDurationMinutes: number;
  maxFuturePracticeSlots: number;
  slotBoundaries: string[];
  fields: Field[];
  bookings: Booking[];
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

function slotKey(fieldId: string, startTime: string) {
  return `${fieldId}|${startTime}`;
}

export default function PracticeFieldsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const [slotData, setSlotData] = useState<SlotData | null>(null);
  // Overlay bookings added optimistically before the SSE confirms them.
  const [optimisticBookings, setOptimisticBookings] = useState<Booking[]>([]);
  // Slots currently being cancelled (keyed by booking id).
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const [pendingBook, setPendingBook] = useState<{ fieldId: string; startTime: string } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [bookError, setBookError] = useState<string | null>(null);
  // Track which slot key is actively being submitted (for per-cell loading state).
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const { data: me } = trpc.practiceFields.whoAmI.useQuery();
  const currentUserId = me?.id;

  const { data: myTeam } = trpc.practiceFields.myTeam.useQuery({ tournamentId });
  const { data: tournament } = trpc.tournaments.getById.useQuery({ id: tournamentId });
  const { data: allTeams } = trpc.practiceFields.listTeams.useQuery({ tournamentId });

  const isDirector = tournament?.userRoles?.some(
    (r) => r.userId === currentUserId && r.role === "DIRECTOR"
  );

  const bookMutation = trpc.practiceFields.book.useMutation({
    onSuccess: (slot) => {
      // Optimistically show the booking immediately; SSE will confirm within 5s.
      const teamName =
        myTeam?.name ??
        allTeams?.find((t) => t.id === slot.teamId)?.name ??
        "Unknown team";
      const startIso = new Date(slot.startTime).toISOString();
      const endIso = new Date(slot.endTime).toISOString();
      setOptimisticBookings((prev) => [
        ...prev.filter(
          (o) => !(o.fieldId === slot.fieldId && o.startTime === startIso)
        ),
        {
          id: slot.id,
          fieldId: slot.fieldId,
          teamId: slot.teamId,
          teamName,
          bookedByUserId: currentUserId ?? null,
          startTime: startIso,
          endTime: endIso,
        },
      ]);
      setPendingBook(null);
      setSelectedTeamId("");
      setBookError(null);
      setSubmittingKey(null);
    },
    onError: (e) => {
      setBookError(e.message);
      setSubmittingKey(null);
    },
  });

  const cancelMutation = trpc.practiceFields.cancel.useMutation({
    onMutate: ({ slotId }) => {
      setCancellingIds((prev) => new Set(prev).add(slotId));
    },
    onSuccess: (_, { slotId }) => {
      // Remove from both optimistic and real bookings immediately.
      setOptimisticBookings((prev) => prev.filter((o) => o.id !== slotId));
      setSlotData((prev) =>
        prev
          ? { ...prev, bookings: prev.bookings.filter((b) => b.id !== slotId) }
          : prev
      );
      setCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(slotId);
        return next;
      });
    },
    onError: (e, { slotId }) => {
      alert(e.message);
      setCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(slotId);
        return next;
      });
    },
  });

  const hasMyTeam = !!myTeam;

  // SSE subscription — when new data arrives, drop any optimistic bookings that
  // the server has now confirmed (matched by fieldId + startTime).
  useEffect(() => {
    const es = new EventSource(`/api/tournaments/${tournamentId}/practice/stream`);
    es.onmessage = (event) => {
      try {
        const data: SlotData = JSON.parse(event.data);
        setSlotData(data);
        setNow(new Date());
        // Drop optimistic entries that are now in the real data.
        setOptimisticBookings((prev) =>
          prev.filter(
            (o) =>
              !data.bookings.some(
                (b) => b.fieldId === o.fieldId && b.startTime === o.startTime
              )
          )
        );
      } catch {}
    };
    return () => es.close();
  }, [tournamentId]);

  // Tick now every 30s so past slots grey out.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function handleBookClick(fieldId: string, startTime: string) {
    setBookError(null);
    if (hasMyTeam) {
      setSubmittingKey(slotKey(fieldId, startTime));
      bookMutation.mutate({ tournamentId, fieldId, startTime });
    } else {
      setPendingBook({ fieldId, startTime });
    }
  }

  function handleBookConfirm() {
    if (!pendingBook || !selectedTeamId) return;
    setSubmittingKey(slotKey(pendingBook.fieldId, pendingBook.startTime));
    bookMutation.mutate({
      tournamentId,
      fieldId: pendingBook.fieldId,
      startTime: pendingBook.startTime,
      teamId: selectedTeamId,
    });
  }

  // Merge SSE bookings with optimistic overlay.
  const mergedBookings = [
    ...(slotData?.bookings ?? []).filter(
      (b) =>
        !optimisticBookings.some(
          (o) => o.fieldId === b.fieldId && o.startTime === b.startTime
        )
    ),
    ...optimisticBookings,
  ];
  const bookingMap = buildBookingMap(mergedBookings);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/dashboard/tournaments/${tournamentId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Tournament
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Practice Fields
        </h1>
        {slotData && (
          <p className="text-sm text-zinc-500">
            {slotData.slotDurationMinutes}-minute slots · up to{" "}
            {slotData.maxFuturePracticeSlots} future booking
            {slotData.maxFuturePracticeSlots !== 1 ? "s" : ""} per team
          </p>
        )}
      </div>

      {hasMyTeam && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Booking as:{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {myTeam!.name}
          </span>
        </p>
      )}

      {bookError && !pendingBook && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          <span>{bookError}</span>
          <button
            onClick={() => setBookError(null)}
            className="ml-4 text-red-500 hover:text-red-700 dark:text-red-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Team selector modal for VOLUNTEER / DIRECTOR */}
      {pendingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Select a team for {formatSlotTime(pendingBook.startTime)}
            </h2>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="">— pick a team —</option>
              {allTeams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {bookError && (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {bookError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleBookConfirm}
                disabled={!selectedTeamId || bookMutation.isPending}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {bookMutation.isPending ? "Booking…" : "Book"}
              </button>
              <button
                onClick={() => {
                  setPendingBook(null);
                  setBookError(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!slotData ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : slotData.fields.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No practice fields configured. Add practice fields in the{" "}
          <Link
            href={`/dashboard/tournaments/${tournamentId}/fields`}
            className="underline"
          >
            Fields
          </Link>{" "}
          settings.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="w-24 px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {formatSlotTime(slotIso)}
                    </td>
                    {slotData.fields.map((f) => {
                      const booking = bookingMap[f.id]?.[slotIso];
                      const key = slotKey(f.id, slotIso);
                      const isSubmitting = submittingKey === key;
                      const isMyTeamBooking =
                        booking && myTeam && booking.teamId === myTeam.id;
                      const isCancelling =
                        booking && cancellingIds.has(booking.id);
                      const canCancel =
                        !isPast &&
                        booking &&
                        !isCancelling &&
                        (isDirector ||
                          isMyTeamBooking ||
                          (currentUserId &&
                            booking.bookedByUserId === currentUserId));

                      return (
                        <td key={f.id} className="px-4 py-3">
                          {isSubmitting ? (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              Booking…
                            </span>
                          ) : booking ? (
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={
                                  isCancelling
                                    ? "text-sm text-zinc-400 line-through dark:text-zinc-500"
                                    : isMyTeamBooking
                                    ? "text-sm font-medium text-green-700 dark:text-green-400"
                                    : "text-sm text-zinc-500 dark:text-zinc-400"
                                }
                              >
                                {booking.teamName}
                              </span>
                              {canCancel && (
                                <button
                                  onClick={() =>
                                    cancelMutation.mutate({
                                      slotId: booking.id,
                                      tournamentId,
                                    })
                                  }
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          ) : !isPast ? (
                            <button
                              onClick={() => handleBookClick(f.id, slotIso)}
                              disabled={isSubmitting}
                              className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              Book
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-300 dark:text-zinc-600">
                              —
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
      )}
    </div>
  );
}
