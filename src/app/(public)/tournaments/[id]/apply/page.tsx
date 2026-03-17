import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { ApplyFlow } from "./ApplyFlow";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ApplyPage({ params }: Props) {
  const { id: tournamentId } = await params;

  const [session, tournament] = await Promise.all([
    auth(),
    db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
    }),
  ]);

  if (!tournament) notFound();

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <ApplyFlow
        tournamentId={tournamentId}
        tournamentName={tournament.name}
        initialSession={
          session
            ? { name: session.user.name ?? null, id: session.user.id }
            : null
        }
      />
    </div>
  );
}
