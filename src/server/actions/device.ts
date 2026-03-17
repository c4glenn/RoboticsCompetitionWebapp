"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Idempotent: finds an existing device user by token or creates a new one.
 * Called from the client before signing in with the "device" credentials provider.
 */
export async function ensureDeviceUser(
  token: string
): Promise<{ name: string }> {
  const existing = await db.query.users.findFirst({
    where: eq(users.deviceToken, token),
  });

  if (existing) {
    return { name: existing.name ?? "Device User" };
  }

  const shortId = token.slice(0, 6).toUpperCase();
  const autoName = `Device-${shortId}`;

  const [user] = await db
    .insert(users)
    .values({ name: autoName, deviceToken: token })
    .returning({ name: users.name });

  return { name: user.name ?? autoName };
}
