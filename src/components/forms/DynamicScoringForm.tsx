"use client";

import { useState } from "react";
import type { FormSchema, FormField } from "@/db/schema";

interface Props {
  schema: FormSchema;
  onSubmit: (formData: Record<string, unknown>) => void;
  isPending?: boolean;
  submitLabel?: string;
  /** Extra fields rendered above the submit button (e.g. a "notes" textarea) */
  children?: React.ReactNode;
}

function initDefaults(fields: FormField[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      data[f.name] = f.defaultValue;
    } else if (f.type === "number") {
      data[f.name] = f.min ?? 0;
    } else if (f.type === "checkbox") {
      data[f.name] = false;
    } else {
      data[f.name] = "";
    }
  }
  return data;
}

export function DynamicScoringForm({
  schema,
  onSubmit,
  isPending,
  submitLabel = "Submit",
  children,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => initDefaults(schema.fields)
  );

  function set(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {schema.fields.map((field) => (
        <FieldInput key={field.name} field={field} value={values[field.name]} onChange={(v) => set(field.name, v)} />
      ))}
      {children}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {isPending ? "Submitting…" : submitLabel}
      </button>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base = inputCls;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {field.type === "number" && (
        <input
          type="number"
          required={field.required}
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className={base}
        />
      )}

      {field.type === "text" && (
        <input
          type="text"
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}

      {field.type === "textarea" && (
        <textarea
          required={field.required}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}

      {field.type === "select" && (
        <select
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === "checkbox" && (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
        />
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
