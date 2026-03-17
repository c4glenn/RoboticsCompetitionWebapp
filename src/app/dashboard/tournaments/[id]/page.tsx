import Link from "next/link";
import { auth } from "@/server/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { tournaments } from "@/db/schema";
import { notFound, redirect } from "next/navigation";

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const tournament = await db.query.tournaments.findFirst({
    where: eq(tournaments.id, id),
    with: {
      competitionType: true,
      classes: true,
      fields: true,
      teams: { with: { class: true } },
      matches: true,
      userRoles: { with: { user: true } },
    },
  });

  if (!tournament) notFound();

  const userRole = tournament.userRoles.find(
    (r) => r.userId === session.user.id
  );
  const isDirector = userRole?.role === "DIRECTOR";

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Dashboard
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {tournament.name}
            </h1>
            <p className="text-sm text-zinc-500">{tournament.competitionType.name}</p>
          </div>
          {isDirector && (
            <Link
              href={`/dashboard/tournaments/${id}/settings`}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              Settings
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard
          title="Teams"
          count={tournament.teams.length}
          href={`/dashboard/tournaments/${id}/teams`}
          action={isDirector ? "Manage" : "View"}
        />
        <SummaryCard
          title="Matches"
          count={tournament.matches.length}
          href={`/dashboard/tournaments/${id}/matches`}
          action={isDirector ? "Manage" : "View"}
        />
        <SummaryCard
          title="Fields"
          count={tournament.fields.length}
          href={`/dashboard/tournaments/${id}/fields`}
          action={isDirector ? "Manage" : "View"}
        />
        <SummaryCard
          title="Roles"
          count={tournament.userRoles.length}
          href={`/dashboard/tournaments/${id}/settings`}
          action={isDirector ? "Manage" : "View"}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Classes
          </h2>
          {tournament.classes.length === 0 ? (
            <p className="text-sm text-zinc-400">No classes.</p>
          ) : (
            <ul className="space-y-1">
              {tournament.classes.map((c) => (
                <li key={c.id} className="text-sm text-zinc-600 dark:text-zinc-400">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Team Members
          </h2>
          {tournament.userRoles.length === 0 ? (
            <p className="text-sm text-zinc-400">No roles assigned.</p>
          ) : (
            <ul className="space-y-1">
              {tournament.userRoles.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {r.user.name ?? r.user.email}
                  </span>
                  <span className="text-xs text-zinc-400">{r.role}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  count,
  href,
  action,
}: {
  title: string;
  count: number;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        {count}
      </p>
      <Link
        href={href}
        className="mt-2 inline-block text-xs font-medium text-zinc-500 underline-offset-4 hover:underline"
      >
        {action} →
      </Link>
    </div>
  );
}
