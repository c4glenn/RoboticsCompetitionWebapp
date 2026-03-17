"use client";

import { useState, use, useRef } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

type CsvRow = {
  name: string;
  className: string;
  classId: string | null;
  pitNumber: number | undefined;
  schoolOrOrg: string | undefined;
  error: string | null;
};

export default function TeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const { data: tournament } = trpc.tournaments.getById.useQuery({
    id: tournamentId,
  });
  const { data: teams, refetch } = trpc.teams.list.useQuery({ tournamentId });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [pitNumber, setPitNumber] = useState("");
  const [schoolOrOrg, setSchoolOrOrg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvImportDone, setCsvImportDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirector = tournament?.userRoles?.some((r) => r.role === "DIRECTOR");
  const canEditTeams =
    isDirector ||
    tournament?.userRoles?.some((r) => r.role === "CHECK_IN_TABLE");

  const create = trpc.teams.create.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setError(e.message),
  });

  const update = trpc.teams.update.useMutation({
    onSuccess: () => { refetch(); resetForm(); },
    onError: (e) => setError(e.message),
  });

  const del = trpc.teams.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const bulkCreate = trpc.teams.bulkCreate.useMutation({
    onSuccess: () => { refetch(); setCsvRows([]); setCsvImportDone(true); },
    onError: (e) => setCsvError(e.message),
  });

  const utils = trpc.useUtils();
  const checkIn = trpc.teams.checkIn.useMutation({
    onSuccess: (updated) => {
      utils.teams.list.setData({ tournamentId }, (prev) =>
        prev?.map((t) => (t.id === updated.id ? { ...t, checkedIn: updated.checkedIn } : t))
      );
    },
  });

  function parseCsv(text: string) {
    setCsvError(null);
    setCsvImportDone(false);
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) { setCsvError("Empty file"); return; }

    // detect header row
    const first = lines[0].toLowerCase();
    const hasHeader = first.includes("name") || first.includes("class");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const classes = tournament?.classes ?? [];
    const rows: CsvRow[] = dataLines
      .filter((l) => l.trim())
      .map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const [rawName = "", rawClass = "", rawPit = "", rawOrg = ""] = cols;
        const matched = classes.find(
          (c) => c.name.toLowerCase() === rawClass.toLowerCase()
        );
        const pit = rawPit ? parseInt(rawPit) : undefined;
        return {
          name: rawName,
          className: rawClass,
          classId: matched?.id ?? null,
          pitNumber: pit && !isNaN(pit) ? pit : undefined,
          schoolOrOrg: rawOrg || undefined,
          error: !rawName
            ? "Missing name"
            : !matched
            ? `Unknown class "${rawClass}"`
            : null,
        };
      });
    setCsvRows(rows);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseCsv(ev.target?.result as string);
    reader.readAsText(file);
  }

  function closeCsvImport() {
    setShowCsvImport(false);
    setCsvRows([]);
    setCsvError(null);
    setCsvImportDone(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submitCsvImport() {
    setCsvError(null);
    const valid = csvRows.filter((r) => !r.error && r.classId);
    if (valid.length === 0) { setCsvError("No valid rows to import"); return; }
    bulkCreate.mutate({
      tournamentId,
      teams: valid.map((r) => ({
        name: r.name,
        classId: r.classId!,
        pitNumber: r.pitNumber,
        schoolOrOrg: r.schoolOrOrg,
      })),
    });
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setName("");
    setClassId("");
    setPitNumber("");
    setSchoolOrOrg("");
    setError(null);
  }

  function openEdit(team: NonNullable<typeof teams>[number]) {
    setEditId(team.id);
    setName(team.name);
    setClassId(team.classId);
    setPitNumber(team.pitNumber?.toString() ?? "");
    setSchoolOrOrg(team.schoolOrOrg ?? "");
    setShowForm(true);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pit = pitNumber ? parseInt(pitNumber) : undefined;
    if (editId) {
      update.mutate({
        id: editId,
        tournamentId,
        name,
        classId,
        pitNumber: pit ?? null,
        schoolOrOrg: schoolOrOrg || null,
      });
    } else {
      create.mutate({
        tournamentId,
        name,
        classId,
        pitNumber: pit,
        schoolOrOrg: schoolOrOrg || undefined,
      });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/tournaments/${tournamentId}`}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            ← {tournament?.name ?? "Tournament"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Teams
          </h1>
        </div>
        {isDirector && !showForm && !showCsvImport && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCsvImport(true)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Import CSV
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Add Team
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {editId ? "Edit Team" : "New Team"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className={inputCls}
            />
            <select
              required
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select class…</option>
              {tournament?.classes?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={pitNumber}
              onChange={(e) => setPitNumber(e.target.value)}
              placeholder="Pit number (optional)"
              className={inputCls}
            />
            <input
              value={schoolOrOrg}
              onChange={(e) => setSchoolOrOrg(e.target.value)}
              placeholder="School / Org (optional)"
              className={inputCls}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {editId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showCsvImport && (
        <div className="mb-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Import Teams from CSV</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Columns: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">name, class, pitNumber (optional), schoolOrOrg (optional)</code>
              <br />
              Class must match one of: {tournament?.classes?.map((c) => c.name).join(", ")}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-50 dark:file:text-zinc-900"
          />

          {csvRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <th className="px-3 py-2 text-left font-medium text-zinc-500">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-500">Class</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-500">Pit</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-500">School/Org</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, i) => (
                    <tr key={i} className={`border-b border-zinc-50 last:border-0 dark:border-zinc-800 ${row.error ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{row.name || <span className="text-zinc-400">—</span>}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.className || <span className="text-zinc-400">—</span>}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.pitNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.schoolOrOrg ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.error
                          ? <span className="text-red-600 dark:text-red-400">{row.error}</span>
                          : <span className="text-green-600 dark:text-green-400">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-zinc-500">
                {csvRows.filter((r) => !r.error).length} valid / {csvRows.filter((r) => !!r.error).length} errors
              </p>
            </div>
          )}

          {csvImportDone && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Import successful!
            </p>
          )}
          {csvError && <p className="text-sm text-red-600 dark:text-red-400">{csvError}</p>}

          <div className="flex gap-2">
            <button
              onClick={submitCsvImport}
              disabled={csvRows.filter((r) => !r.error).length === 0 || bulkCreate.isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {bulkCreate.isPending ? "Importing…" : `Import ${csvRows.filter((r) => !r.error).length} Teams`}
            </button>
            <button
              type="button"
              onClick={closeCsvImport}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {!teams || teams.length === 0 ? (
          <p className="p-6 text-sm text-zinc-400">No teams yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Class</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Pit</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">School/Org</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Checked In</th>
                {canEditTeams && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr
                  key={team.id}
                  className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{team.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{team.class?.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{team.pitNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-500">{team.schoolOrOrg ?? "—"}</td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={team.checkedIn}
                      disabled={!canEditTeams || checkIn.isPending}
                      onChange={(e) =>
                        checkIn.mutate({
                          id: team.id,
                          tournamentId,
                          checkedIn: e.target.checked,
                        })
                      }
                      className="h-4 w-4 cursor-pointer accent-zinc-900 dark:accent-zinc-50 disabled:cursor-default"
                    />
                  </td>
                  {canEditTeams && (
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => openEdit(team)}
                          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                        >
                          Edit
                        </button>
                        {isDirector && (
                          <button
                            onClick={() => del.mutate({ id: team.id, tournamentId })}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
