"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { ensureDeviceUser } from "@/server/actions/device";

type Screen = "AUTH_CHOICE" | "APPLY_FORM" | "CONFIRMATION";

type RequestedRole = "REFEREE" | "JUDGE" | "VOLUNTEER" | "CHECK_IN_TABLE";

const ROLE_OPTIONS: { value: RequestedRole; label: string }[] = [
  { value: "VOLUNTEER", label: "General Volunteer" },
  { value: "REFEREE", label: "Referee" },
  { value: "JUDGE", label: "Judge" },
  { value: "CHECK_IN_TABLE", label: "Check-In Table" },
];

interface Props {
  tournamentId: string;
  tournamentName: string;
  initialSession: { name: string | null; id: string } | null;
}

export function ApplyFlow({ tournamentId, tournamentName, initialSession }: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>(
    initialSession ? "APPLY_FORM" : "AUTH_CHOICE"
  );
  const [name, setName] = useState(initialSession?.name ?? "");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("VOLUNTEER");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);

  const applyMutation = trpc.volunteerApplications.submit.useMutation({
    onSuccess: () => setScreen("CONFIRMATION"),
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        setError("You have already applied to volunteer for this tournament.");
      } else if (err.data?.code === "UNAUTHORIZED") {
        setScreen("AUTH_CHOICE");
        setError("Please sign in before applying.");
      } else {
        setError(err.message);
      }
    },
  });

  async function handleDeviceMode() {
    setDeviceLoading(true);
    setError(null);
    try {
      let token = localStorage.getItem("device_token");
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem("device_token", token);
      }

      const { name: deviceName } = await ensureDeviceUser(token);

      const result = await signIn("device", { token, redirect: false });
      if (result?.error) {
        setError("Failed to set up device mode. Please try again.");
        return;
      }

      setName(deviceName);
      router.refresh();
      setScreen("APPLY_FORM");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeviceLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    applyMutation.mutate({ tournamentId, name, requestedRole, message: message || undefined });
  }

  const callbackUrl = encodeURIComponent(`/tournaments/${tournamentId}/apply`);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {tournamentName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Apply to Volunteer</p>
      </div>

      {screen === "AUTH_CHOICE" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Sign in to continue
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Choose how you&apos;d like to proceed.
          </p>

          {error && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <a
              href={`/login?callbackUrl=${callbackUrl}`}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Login with existing account
            </a>
            <a
              href={`/register?callbackUrl=${callbackUrl}`}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Create an account
            </a>
            <div className="relative my-1 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
              <span className="text-xs text-zinc-400">or</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <button
              onClick={handleDeviceMode}
              disabled={deviceLoading}
              className="rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {deviceLoading ? "Setting up…" : "Use Device Mode"}
            </button>
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
              Device mode doesn&apos;t require a password and works as long as
              this browser is available. Ideal for shared tablets.
            </p>
          </div>
        </div>
      )}

      {screen === "APPLY_FORM" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Your application
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            The tournament director will review your application and be in touch.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="vol-name"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Your name
              </label>
              <input
                id="vol-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                placeholder="Jane Smith"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="vol-role"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role applying for
              </label>
              <select
                id="vol-role"
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value as RequestedRole)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="vol-message"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Message{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <textarea
                id="vol-message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                placeholder="Any relevant experience or availability…"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={applyMutation.isPending}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {applyMutation.isPending ? "Submitting…" : "Submit Application"}
            </button>
          </form>
        </div>
      )}

      {screen === "CONFIRMATION" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 text-3xl">✓</div>
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Application submitted!
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            The tournament director will review your application and be in touch
            soon.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href={`/tournaments/${tournamentId}/leaderboard`}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              See Scoreboard
            </Link>
            <Link
              href={`/tournaments/${tournamentId}/schedule`}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              See Schedule
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
