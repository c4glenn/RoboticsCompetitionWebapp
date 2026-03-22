"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/router";
import type { FormField } from "@/db/schema/tournaments";
import { FormSchemaBuilder } from "./FormSchemaBuilder";
import {
  ScoringLogicBuilder,
  rulesToDrafts,
  draftsToRules,
  type DraftRule,
} from "./ScoringLogicBuilder";

// ── Types ─────────────────────────────────────────────────────────────────────

type RouterOutput = inferRouterOutputs<AppRouter>;
type CompType = RouterOutput["competitionTypes"]["list"][number];

// ── Component ─────────────────────────────────────────────────────────────────

export function CompetitionTypesClient({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const utils = trpc.useUtils();
  const { data: types, isLoading } = trpc.competitionTypes.list.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Basic fields
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [matchDuration, setMatchDuration] = useState("5");

  // Schema builders
  const [inspectionFields, setInspectionFields] = useState<FormField[]>([]);
  const [refereeFields, setRefereeFields] = useState<FormField[]>([]);
  const [judgingFields, setJudgingFields] = useState<FormField[]>([]);
  const [hasJudging, setHasJudging] = useState(false);
  const [scoringRules, setScoringRules] = useState<DraftRule[]>([]);

  const [error, setError] = useState<string | null>(null);

  function canEdit(ct: CompType) {
    return ct.createdByUserId === currentUserId;
  }

  function resetForm() {
    setEditId(null);
    setName("");
    setIsPublic(true);
    setMatchDuration("5");
    setInspectionFields([]);
    setRefereeFields([]);
    setJudgingFields([]);
    setHasJudging(false);
    setScoringRules([]);
    setError(null);
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(ct: CompType) {
    setEditId(ct.id);
    setName(ct.name);
    setIsPublic(ct.isPublic);
    setMatchDuration(String(ct.matchDurationMinutes));
    setInspectionFields(ct.inspectionFormSchema.fields);
    setRefereeFields(ct.refereeFormSchema.fields);
    const judging = ct.judgingFormSchema;
    setHasJudging(!!judging);
    setJudgingFields(judging ? judging.fields : []);
    setScoringRules(rulesToDrafts(ct.scoringLogic.rules));
    setError(null);
    setShowForm(true);
  }

  const create = trpc.competitionTypes.create.useMutation({
    onSuccess: () => {
      utils.competitionTypes.list.invalidate();
      setShowForm(false);
      resetForm();
    },
    onError: (e) => setError(e.message),
  });

  const update = trpc.competitionTypes.update.useMutation({
    onSuccess: () => {
      utils.competitionTypes.list.invalidate();
      setShowForm(false);
      resetForm();
    },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const duration = parseInt(matchDuration, 10);
    if (isNaN(duration) || duration < 1) {
      setError("Match duration must be a positive integer.");
      return;
    }

    const inspectionFormSchema = { fields: inspectionFields };
    const refereeFormSchema = { fields: refereeFields };
    const judgingFormSchema = hasJudging ? { fields: judgingFields } : undefined;
    const scoringLogic = { rules: draftsToRules(scoringRules) };

    if (editId) {
      update.mutate({
        id: editId,
        name,
        isPublic,
        matchDurationMinutes: duration,
        inspectionFormSchema,
        refereeFormSchema,
        judgingFormSchema: hasJudging ? judgingFormSchema : null,
        scoringLogic,
      });
    } else {
      create.mutate({
        name,
        isPublic,
        matchDurationMinutes: duration,
        inspectionFormSchema,
        refereeFormSchema,
        judgingFormSchema,
        scoringLogic,
      });
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Competition Types
        </h1>
        {!showForm && (
          <button
            onClick={openAdd}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
          >
            New Type
          </button>
        )}
      </div>

      {/* ── Add / Edit form ──────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {editId ? "Edit Competition Type" : "New Competition Type"}
          </h2>

          {/* Basic info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="IEEE Robotics 2026"
              />
            </Field>
            <Field label="Match Duration" hint="minutes">
              <input
                type="number"
                required
                min={1}
                value={matchDuration}
                onChange={(e) => setMatchDuration(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-50"
            />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Public{" "}
              <span className="font-normal text-zinc-400">
                (anyone can use this type when creating a tournament)
              </span>
            </span>
          </label>

          {/* Inspection form */}
          <Section title="Inspection Form Fields">
            <FormSchemaBuilder
              fields={inspectionFields}
              onChange={setInspectionFields}
            />
          </Section>

          {/* Referee form */}
          <Section title="Referee Form Fields">
            <FormSchemaBuilder
              fields={refereeFields}
              onChange={setRefereeFields}
            />
          </Section>

          {/* Scoring logic — driven by referee fields */}
          <Section title="Scoring Logic">
            <ScoringLogicBuilder
              rules={scoringRules}
              refereeFields={refereeFields}
              onChange={setScoringRules}
            />
          </Section>

          {/* Optional judging form */}
          <Section
            title="Judging Form Fields"
            hint="optional"
            action={
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={hasJudging}
                  onChange={(e) => setHasJudging(e.target.checked)}
                  className="accent-zinc-900 dark:accent-zinc-50"
                />
                Enable
              </label>
            }
          >
            {hasJudging ? (
              <FormSchemaBuilder
                fields={judgingFields}
                onChange={setJudgingFields}
              />
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Judging is disabled for this type.
              </p>
            )}
          </Section>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
            >
              {isPending ? "Saving…" : editId ? "Save Changes" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Type list ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : types?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">No competition types yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {types?.map((ct) => (
            <div
              key={ct.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {ct.name}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {ct.matchDurationMinutes} min / match
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    ct.isPublic
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {ct.isPublic ? "Public" : "Private"}
                </span>
                {canEdit(ct) && (
                  <button
                    onClick={() => openEdit(ct)}
                    className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {title}
          {hint && (
            <span className="ml-1 font-normal text-zinc-400">({hint})</span>
          )}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-zinc-400">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500";
