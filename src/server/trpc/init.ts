import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/server/auth";
import { db } from "@/db";
import { hasRole } from "@/db/queries/auth";

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth();
  return { db, session, headers: opts.headers };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Authenticated procedure — throws UNAUTHORIZED if no session.
 * Downstream ctx gains a non-null `user` object with a guaranteed `id`.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.session.user as { id: string; name?: string | null; email?: string | null },
    },
  });
});

/**
 * Asserts that the currently authenticated user is a DIRECTOR of the given
 * tournament. Call this at the top of any director-only procedure handler.
 */
export async function assertDirector(
  userId: string,
  tournamentId: string
): Promise<void> {
  const ok = await hasRole(userId, tournamentId, "DIRECTOR");
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only tournament directors can perform this action.",
    });
  }
}

/**
 * Asserts that the user is a DIRECTOR or CHECK_IN_TABLE for the given tournament.
 */
export async function assertDirectorOrCheckIn(
  userId: string,
  tournamentId: string
): Promise<void> {
  const ok = await hasRole(userId, tournamentId, "DIRECTOR", "CHECK_IN_TABLE");
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only directors or check-in table staff can perform this action.",
    });
  }
}
