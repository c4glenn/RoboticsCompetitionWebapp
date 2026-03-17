"use client";

import { use } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

export default function VolunteersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const utils = trpc.useUtils();
  const { data: applications, isLoading } =
    trpc.volunteerApplications.listApplications.useQuery({
      tournamentId,
      status: "ALL",
    });

  const updateStatus = trpc.volunteerApplications.updateStatus.useMutation({
    onSuccess: () =>
      utils.volunteerApplications.listApplications.invalidate({ tournamentId }),
  });

  const pending = applications?.filter((a) => a.status === "PENDING") ?? [];
  const decided = applications?.filter((a) => a.status !== "PENDING") ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/tournaments/${tournamentId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Tournament
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Volunteer Applications
        </h1>
      </div>

      {isLoading && (
        <p className="text-sm text-zinc-400">Loading applications…</p>
      )}

      {/* Pending applications */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-400">No pending applications.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Applied
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {pending.map((app) => (
                  <tr key={app.id}>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {app.name}
                      {!app.userId && (
                        <span className="ml-2 text-xs text-zinc-400">
                          (device)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={app.requestedRole} />
                    </td>
                    <td className="max-w-xs px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {app.message ? (
                        <span className="line-clamp-2">{app.message}</span>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() =>
                            updateStatus.mutate({
                              applicationId: app.id,
                              tournamentId,
                              status: "APPROVED",
                            })
                          }
                          disabled={updateStatus.isPending}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            updateStatus.mutate({
                              applicationId: app.id,
                              tournamentId,
                              status: "REJECTED",
                            })
                          }
                          disabled={updateStatus.isPending}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Decided applications */}
      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            History ({decided.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Applied
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {decided.map((app) => (
                  <tr key={app.id} className="opacity-75">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {app.name}
                      {!app.userId && app.status === "APPROVED" && (
                        <span className="ml-2 text-xs text-amber-500" title="No linked account — role not assigned">
                          ⚠ no account
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={app.requestedRole} />
                    </td>
                    <td className="max-w-xs px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {app.message ? (
                        <span className="line-clamp-2">{app.message}</span>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  VOLUNTEER: "General Volunteer",
  REFEREE: "Referee",
  JUDGE: "Judge",
  CHECK_IN_TABLE: "Check-In Table",
  DIRECTOR: "Director",
  TEAM_LEAD: "Team Lead",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Approved
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
      Rejected
    </span>
  );
}
