import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { CompetitionTypesClient } from "./CompetitionTypesClient";

export default async function CompetitionTypesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <CompetitionTypesClient currentUserId={session.user.id} />;
}
