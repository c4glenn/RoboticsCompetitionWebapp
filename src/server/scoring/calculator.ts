import type { ScoringLogic } from "@/db/schema";

/**
 * Pure function — no I/O, no side effects.
 * Evaluates formData against the competition type's scoringLogic and
 * returns the integer point total.
 *
 * Two rule modes:
 *   pointsPer — numeric field value × pointsPer (e.g. rings * 5)
 *   values    — discrete map of field value → points (e.g. park level select)
 */
export function calculateScore(
  formData: Record<string, unknown>,
  scoringLogic: ScoringLogic
): number {
  let total = 0;

  for (const rule of scoringLogic.rules) {
    const raw = formData[rule.field];

    if (rule.pointsPer !== undefined) {
      // Numeric multiplier. Booleans count as 1 (checkbox scored per item).
      let num = 0;
      if (typeof raw === "number") num = raw;
      else if (raw === true) num = 1;
      else if (typeof raw === "string") num = parseFloat(raw) || 0;
      total += Math.round(num * rule.pointsPer);
    } else if (rule.values !== undefined) {
      // Discrete value map.
      const key = raw === undefined || raw === null ? "" : String(raw);
      total += rule.values[key] ?? 0;
    }
  }

  return total;
}
