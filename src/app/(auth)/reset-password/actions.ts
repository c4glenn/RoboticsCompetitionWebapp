"use server";

import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordResult = { success: true } | { success: false; error: string };

export async function resetPassword(
  token: string,
  password: string
): Promise<ResetPasswordResult> {
  const parsed = resetSchema.safeParse({ token, password });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const now = new Date();
  const record = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.token, token),
      gt(verificationTokens.expires, now)
    ),
  });

  if (!record) {
    return { success: false, error: "This reset link is invalid or has expired." };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, record.identifier),
  });

  if (!user) {
    return { success: false, error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, record.identifier),
        eq(verificationTokens.token, token)
      )
    );

  return { success: true };
}
