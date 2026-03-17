/** How far ahead to show practice field slots (5 hours). */
export const DEFAULT_PRACTICE_WINDOW_MS = 5 * 60 * 60 * 1000;

/**
 * Returns an array of slot start times aligned to Unix epoch mod slotDurationMs.
 * For example, 15-minute slots always fall on :00, :15, :30, :45 regardless of when
 * this function is called.
 *
 * @param now            Current time
 * @param slotDurationMs Duration of one slot in milliseconds
 * @param windowMs       How far ahead to generate slots
 */
export function generateSlotBoundaries(
  now: Date,
  slotDurationMs: number,
  windowMs: number
): Date[] {
  const nowMs = now.getTime();
  const firstSlotMs = Math.ceil(nowMs / slotDurationMs) * slotDurationMs;
  const slots: Date[] = [];
  const endMs = nowMs + windowMs;
  for (let t = firstSlotMs; t < endMs; t += slotDurationMs) {
    slots.push(new Date(t));
  }
  return slots;
}
