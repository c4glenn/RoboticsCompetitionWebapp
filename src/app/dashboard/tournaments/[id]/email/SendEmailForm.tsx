"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

type Role = "TEAM_LEAD" | "VOLUNTEER";

export default function SendEmailForm({ tournamentId }: { tournamentId: string }) {
  const [role, setRole] = useState<Role>("TEAM_LEAD");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = trpc.email.sendToRole.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setSubject("");
      setBody("");
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    send.mutate({ tournamentId, role, subject, body });
  }

  const roleLabel = role === "TEAM_LEAD" ? "Team Leads" : "Volunteers";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Recipients
        </label>
        <div className="flex gap-3">
          {(["TEAM_LEAD", "VOLUNTEER"] as Role[]).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                role === r
                  ? "border-violet-700 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="sr-only"
              />
              {r === "TEAM_LEAD" ? "Team Leads" : "Volunteers"}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="subject"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Subject
        </label>
        <input
          id="subject"
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          placeholder="e.g. Tournament Day Logistics"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="body"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Message
          </label>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {role === "TEAM_LEAD"
              ? "{{Name}}, {{TeamName}}, {{Class}}, {{Org}}, {{PitNumber}}, {{TournamentLink}}, {{AppUrl}}"
              : "{{Name}}, {{TournamentLink}}, {{AppUrl}}"}
          </span>
        </div>
        <textarea
          id="body"
          required
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          placeholder="Write your message here…"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Sent to {result.sent} {roleLabel.toLowerCase()}
          {result.skipped > 0 && ` (${result.skipped} skipped — no email address)`}.
        </p>
      )}

      <button
        type="submit"
        disabled={send.isPending}
        className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {send.isPending ? `Sending to ${roleLabel}…` : `Send to ${roleLabel}`}
      </button>
    </form>
  );
}
