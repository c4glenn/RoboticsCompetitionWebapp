"use client";

import type { FormField, ScoringRule } from "@/db/schema/tournaments";

// ── Draft types ───────────────────────────────────────────────────────────────
// We represent the values map as an ordered array of pairs so that key edits
// don't cause collisions while the user is mid-type.

export type ValueEntry = { key: string; points: number };

export type DraftRule = {
  field: string;
  mode: "pointsPer" | "map";
  pointsPer: number;
  valueEntries: ValueEntry[];
};

// ── Conversion helpers ────────────────────────────────────────────────────────

export function rulesToDrafts(rules: ScoringRule[]): DraftRule[] {
  return rules.map((r) => {
    if (r.values !== undefined) {
      return {
        field: r.field,
        mode: "map",
        pointsPer: 1,
        valueEntries: Object.entries(r.values).map(([key, points]) => ({
          key,
          points,
        })),
      };
    }
    return {
      field: r.field,
      mode: "pointsPer",
      pointsPer: r.pointsPer ?? 1,
      valueEntries: [],
    };
  });
}

export function draftsToRules(drafts: DraftRule[]): ScoringRule[] {
  return drafts.map((d) => {
    if (d.mode === "map") {
      const values: Record<string, number> = {};
      d.valueEntries.forEach(({ key, points }) => {
        if (key !== "") values[key] = points;
      });
      return { field: d.field, values };
    }
    return { field: d.field, pointsPer: d.pointsPer };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScoringLogicBuilder({
  rules,
  refereeFields,
  onChange,
}: {
  rules: DraftRule[];
  refereeFields: FormField[];
  onChange: (rules: DraftRule[]) => void;
}) {
  function update(i: number, patch: Partial<DraftRule>) {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  function addRule() {
    onChange([
      ...rules,
      { field: "", mode: "pointsPer", pointsPer: 1, valueEntries: [] },
    ]);
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No rules yet.</p>
      )}
      {rules.map((rule, i) => (
        <RuleCard
          key={i}
          rule={rule}
          refereeFields={refereeFields}
          onChange={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
        />
      ))}
      <button
        type="button"
        onClick={addRule}
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
      >
        + Add rule
      </button>
    </div>
  );
}

function RuleCard({
  rule,
  refereeFields,
  onChange,
  onRemove,
}: {
  rule: DraftRule;
  refereeFields: FormField[];
  onChange: (patch: Partial<DraftRule>) => void;
  onRemove: () => void;
}) {
  const namedFields = refereeFields.filter((f) => f.name);

  function setMode(mode: "pointsPer" | "map") {
    onChange({ mode, pointsPer: rule.pointsPer, valueEntries: rule.valueEntries });
  }

  function updateEntry(i: number, patch: Partial<ValueEntry>) {
    onChange({
      valueEntries: rule.valueEntries.map((e, idx) =>
        idx === i ? { ...e, ...patch } : e
      ),
    });
  }

  function addEntry() {
    onChange({ valueEntries: [...rule.valueEntries, { key: "", points: 0 }] });
  }

  function removeEntry(i: number) {
    onChange({
      valueEntries: rule.valueEntries.filter((_, idx) => idx !== i),
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      {/* Field selector */}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className={labelCls}>Field</label>
          <select
            required
            value={rule.field}
            onChange={(e) => onChange({ field: e.target.value })}
            className={inputCls}
          >
            <option value="">Select a field…</option>
            {namedFields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
                {f.label ? ` — ${f.label}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mb-0.5 shrink-0 text-zinc-400 hover:text-red-500"
        >
          ✕
        </button>
      </div>

      {/* Mode toggle */}
      <div className="mt-2 flex gap-4">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="radio"
            checked={rule.mode === "pointsPer"}
            onChange={() => setMode("pointsPer")}
            className="accent-zinc-900 dark:accent-zinc-50"
          />
          Points per value
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="radio"
            checked={rule.mode === "map"}
            onChange={() => setMode("map")}
            className="accent-zinc-900 dark:accent-zinc-50"
          />
          Value map
        </label>
      </div>

      {/* Points per value */}
      {rule.mode === "pointsPer" && (
        <div className="mt-2 space-y-1">
          <label className={labelCls}>Points per unit</label>
          <input
            type="number"
            required
            value={rule.pointsPer}
            onChange={(e) => onChange({ pointsPer: Number(e.target.value) })}
            className={`${inputCls} max-w-30`}
          />
        </div>
      )}

      {/* Value map */}
      {rule.mode === "map" && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className={`${labelCls} flex-1`}>Value</p>
            <p className={`${labelCls} w-20`}>Points</p>
            <div className="w-4" />
          </div>
          {rule.valueEntries.length === 0 && (
            <p className="text-xs text-zinc-400">No entries yet.</p>
          )}
          {rule.valueEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                required
                value={entry.key}
                onChange={(e) => updateEntry(i, { key: e.target.value })}
                placeholder="value"
                className={`${inputCls} flex-1`}
              />
              <span className="text-zinc-400">→</span>
              <input
                type="number"
                required
                value={entry.points}
                onChange={(e) => updateEntry(i, { points: Number(e.target.value) })}
                className={`${inputCls} w-20`}
              />
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="text-zinc-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addEntry}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            + Add entry
          </button>
        </div>
      )}
    </div>
  );
}

const labelCls = "block text-xs font-medium text-zinc-500 dark:text-zinc-400";
const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500";
