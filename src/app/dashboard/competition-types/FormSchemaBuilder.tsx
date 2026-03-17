"use client";

import type { FormField } from "@/db/schema/tournaments";

const FIELD_TYPES: FormField["type"][] = [
  "text",
  "textarea",
  "number",
  "select",
  "checkbox",
];

export function FormSchemaBuilder({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  function update(i: number, patch: Partial<FormField>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function remove(i: number) {
    onChange(fields.filter((_, idx) => idx !== i));
  }

  function addField() {
    onChange([...fields, { name: "", label: "", type: "text", required: false }]);
  }

  return (
    <div className="space-y-2">
      {fields.length === 0 && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No fields yet.</p>
      )}
      {fields.map((field, i) => (
        <FieldCard
          key={i}
          index={i}
          field={field}
          onChange={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
        />
      ))}
      <button
        type="button"
        onClick={addField}
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
      >
        + Add field
      </button>
    </div>
  );
}

function FieldCard({
  index,
  field,
  onChange,
  onRemove,
}: {
  index: number;
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}) {
  function updateOption(i: number, patch: Partial<{ value: string; label: string }>) {
    const options = (field.options ?? []).map((o, idx) =>
      idx === i ? { ...o, ...patch } : o
    );
    onChange({ options });
  }

  function addOption() {
    onChange({ options: [...(field.options ?? []), { value: "", label: "" }] });
  }

  function removeOption(i: number) {
    onChange({ options: (field.options ?? []).filter((_, idx) => idx !== i) });
  }

  function changeType(newType: FormField["type"]) {
    onChange({ type: newType, options: undefined, min: undefined, max: undefined });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      {/* Top row: name, label, type, remove */}
      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={labelCls}>Field name</label>
            <input
              required
              value={field.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="teleopRings"
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Label</label>
            <input
              required
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Teleop rings scored"
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Type</label>
            <select
              value={field.type}
              onChange={(e) => changeType(e.target.value as FormField["type"])}
              className={inputCls}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mb-0.5 shrink-0 text-zinc-400 hover:text-red-500"
          title="Remove field"
        >
          ✕
        </button>
      </div>

      {/* number: min / max */}
      {field.type === "number" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelCls}>Min</label>
            <input
              type="number"
              value={field.min ?? ""}
              onChange={(e) =>
                onChange({ min: e.target.value !== "" ? Number(e.target.value) : undefined })
              }
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Max</label>
            <input
              type="number"
              value={field.max ?? ""}
              onChange={(e) =>
                onChange({ max: e.target.value !== "" ? Number(e.target.value) : undefined })
              }
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* select: options */}
      {field.type === "select" && (
        <div className="mt-2 space-y-1.5">
          <p className={labelCls}>Options</p>
          {(field.options ?? []).length === 0 && (
            <p className="text-xs text-zinc-400">No options yet.</p>
          )}
          {(field.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                required
                value={opt.value}
                onChange={(e) => updateOption(i, { value: e.target.value })}
                placeholder="value"
                className={`${inputCls} flex-1`}
              />
              <input
                required
                value={opt.label}
                onChange={(e) => updateOption(i, { label: e.target.value })}
                placeholder="label"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="text-zinc-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            + Add option
          </button>
        </div>
      )}

      {/* required toggle */}
      <label className="mt-2 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={field.required ?? false}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-50"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Required</span>
      </label>
    </div>
  );
}

const labelCls = "block text-xs font-medium text-zinc-500 dark:text-zinc-400";
const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500";
