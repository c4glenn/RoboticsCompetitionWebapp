"use client";

import { use } from "react";
import Link from "next/link";
import SendEmailForm from "./SendEmailForm";

export default function EmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/tournaments/${tournamentId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Tournament
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Send Email
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Send a plain-text email to all team leads or volunteers at this tournament.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <SendEmailForm tournamentId={tournamentId} />
      </div>
    </div>
  );
}
