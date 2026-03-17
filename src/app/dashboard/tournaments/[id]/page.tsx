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
      teams: { with: { class: true, inspections: true } },
      matches: true,
      userRoles: { with: { user: true } },
      volunteerApplications: true,
    },
  });

  if (!tournament) notFound();

  const userRole = tournament.userRoles.find(
    (r) => r.userId === session.user.id
  );
  const isDirector = userRole?.role === "DIRECTOR";

  const totalTeams = tournament.teams.length;
  const checkedInTeams = tournament.teams.filter((t) => t.checkedIn);
  const checkedInCount = checkedInTeams.length;
  const passedInspectionCount = checkedInTeams.filter((t) =>
    t.inspections.some((i) => i.passed)
  ).length;

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

      <div className="mb-4 flex flex-wrap gap-2">
        <QuickLink href={`/inspect/${id}`} label="Inspection" />
        <QuickLink href={`/referee/${id}/score`} label="Referee" />
        <QuickLink href={`/judge/${id}/score`} label="Judge" />
        <QuickLink href={`/tournaments/${id}/leaderboard`} label="Scoreboard" external />
        <QuickLink href={`/tournaments/${id}/schedule`} label="Schedule" external/>
        {isDirector && (
          <QuickLink href={`/dashboard/tournaments/${id}/volunteers`} label="Volunteers" />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>

      {isDirector && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Volunteers"
            count={tournament.volunteerApplications?.filter((a) => a.status === "PENDING").length ?? 0}
            href={`/dashboard/tournaments/${id}/volunteers`}
            action="Review"
          />
          <SummaryCard
          title="Roles"
          count={tournament.userRoles.length}
          href={`/dashboard/tournaments/${id}/settings`}
          action={isDirector ? "Manage" : "View"}
        />
        </div>
      )}

      {totalTeams > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ProgressWidget
            title="Checked In"
            count={checkedInCount}
            total={totalTeams}
            href={`/dashboard/tournaments/${id}/teams`}
          />
          <ProgressWidget
            title="Passed Inspection"
            count={passedInspectionCount}
            total={checkedInCount}
          />
        </div>
      )}

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

function QuickLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      {label}
      {external && <span className="ml-1 text-zinc-400">↗</span>}
    </Link>
  );
}

function ProgressWidget({
  title,
  count,
  total,
  href,
}: {
  title: string;
  count: number;
  total: number;
  href?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  const inner = (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">{title}</p>
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
          {count} / {total}
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-zinc-900 dark:bg-zinc-50 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-xs text-zinc-400">{pct}%</p>
    </div>
  );
  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
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
