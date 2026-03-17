/**
 * Unit tests for calculateScore() — pure function, no DB required.
 * Run with: pnpm test:run
 */
import { describe, it, expect } from "vitest";
import { calculateScore } from "@/server/scoring/calculator";
import type { ScoringLogic } from "@/db/schema";

// ── pointsPer (numeric multiplier) ────────────────────────────────────────────

describe("pointsPer rules", () => {
  const logic: ScoringLogic = {
    rules: [
      { field: "autonomousTasks", pointsPer: 10 },
      { field: "teleopRings", pointsPer: 5 },
      { field: "penalty", pointsPer: -5 },
    ],
  };

  it("multiplies numeric field values by pointsPer", () => {
    const score = calculateScore(
      { autonomousTasks: 3, teleopRings: 4, penalty: 1 },
      logic
    );
    // 3*10 + 4*5 + 1*(-5) = 30 + 20 - 5 = 45
    expect(score).toBe(45);
  });

  it("returns 0 for missing fields", () => {
    expect(calculateScore({}, logic)).toBe(0);
  });

  it("handles zero values correctly", () => {
    expect(calculateScore({ autonomousTasks: 0, teleopRings: 0, penalty: 0 }, logic)).toBe(0);
  });

  it("treats boolean true as 1 (checkbox)", () => {
    const checkLogic: ScoringLogic = { rules: [{ field: "parked", pointsPer: 10 }] };
    expect(calculateScore({ parked: true }, checkLogic)).toBe(10);
  });

  it("treats boolean false as 0", () => {
    const checkLogic: ScoringLogic = { rules: [{ field: "parked", pointsPer: 10 }] };
    expect(calculateScore({ parked: false }, checkLogic)).toBe(0);
  });

  it("parses numeric strings", () => {
    expect(calculateScore({ autonomousTasks: "3" }, logic)).toBe(30);
  });

  it("treats non-numeric strings as 0", () => {
    expect(calculateScore({ autonomousTasks: "abc" }, logic)).toBe(0);
  });

  it("handles negative scores (penalties)", () => {
    const penaltyOnly: ScoringLogic = { rules: [{ field: "penalty", pointsPer: -5 }] };
    expect(calculateScore({ penalty: 3 }, penaltyOnly)).toBe(-15);
  });
});

// ── values (discrete select map) ─────────────────────────────────────────────

describe("values rules", () => {
  const logic: ScoringLogic = {
    rules: [
      {
        field: "endgameParkLevel",
        values: { "1": 5, "2": 10, "3": 15 },
      },
    ],
  };

  it("looks up points by field value", () => {
    expect(calculateScore({ endgameParkLevel: "2" }, logic)).toBe(10);
  });

  it("returns 0 for an unmapped value", () => {
    expect(calculateScore({ endgameParkLevel: "4" }, logic)).toBe(0);
  });

  it("returns 0 for missing field", () => {
    expect(calculateScore({}, logic)).toBe(0);
  });

  it("coerces numeric field values to string for lookup", () => {
    expect(calculateScore({ endgameParkLevel: 3 }, logic)).toBe(15);
  });
});

// ── combined rules ─────────────────────────────────────────────────────────────

describe("combined scoring logic", () => {
  const logic: ScoringLogic = {
    rules: [
      { field: "autonomousTasks", pointsPer: 10 },
      { field: "teleopRings", pointsPer: 5 },
      { field: "endgameParkLevel", values: { "1": 5, "2": 10, "3": 15 } },
      { field: "penalty", pointsPer: -5 },
    ],
  };

  it("sums all rule types correctly", () => {
    const score = calculateScore(
      {
        autonomousTasks: 2,   // 20
        teleopRings: 6,       // 30
        endgameParkLevel: "3", // 15
        penalty: 1,           // -5
      },
      logic
    );
    expect(score).toBe(60);
  });

  it("empty formData yields 0", () => {
    expect(calculateScore({}, logic)).toBe(0);
  });

  it("ignores extra formData fields not in rules", () => {
    const score = calculateScore(
      { autonomousTasks: 1, unknownField: 999 },
      logic
    );
    expect(score).toBe(10);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty rules array", () => {
    expect(calculateScore({ anything: 100 }, { rules: [] })).toBe(0);
  });

  it("handles null field value as 0 for pointsPer", () => {
    const logic: ScoringLogic = { rules: [{ field: "x", pointsPer: 5 }] };
    expect(calculateScore({ x: null }, logic)).toBe(0);
  });

  it("handles undefined field value for values map (empty string key)", () => {
    const logic: ScoringLogic = {
      rules: [{ field: "x", values: { "": 99, a: 1 } }],
    };
    // missing field → key becomes "" → maps to 99
    expect(calculateScore({}, logic)).toBe(99);
  });

  it("rounds fractional results from pointsPer", () => {
    const logic: ScoringLogic = { rules: [{ field: "x", pointsPer: 3 }] };
    // 2.5 * 3 = 7.5 → rounds to 8
    expect(calculateScore({ x: 2.5 }, logic)).toBe(8);
  });
});
