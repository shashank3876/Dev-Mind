import { and, eq } from "drizzle-orm";
import {
  db,
  oauthAccountsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { OAuthProfile, OAuthProvider } from "../lib/oauth";

export async function findUserById(userId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ?? null;
}

export async function findOrCreateOAuthUser(
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<User> {
  const [existingAccount] = await db
    .select({ user: usersTable })
    .from(oauthAccountsTable)
    .innerJoin(usersTable, eq(oauthAccountsTable.userId, usersTable.id))
    .where(
      and(
        eq(oauthAccountsTable.provider, provider),
        eq(oauthAccountsTable.providerUserId, profile.providerUserId),
      ),
    )
    .limit(1);

  if (existingAccount) {
    const [updated] = await db
      .update(usersTable)
      .set({
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existingAccount.user.id))
      .returning();
    return updated ?? existingAccount.user;
  }

  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, profile.email))
    .limit(1);

  if (existingUser) {
    await db.insert(oauthAccountsTable).values({
      userId: existingUser.id,
      provider,
      providerUserId: profile.providerUserId,
    });

    const [updated] = await db
      .update(usersTable)
      .set({
        name: profile.name ?? existingUser.name,
        avatarUrl: profile.avatarUrl ?? existingUser.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existingUser.id))
      .returning();
    return updated ?? existingUser;
  }

  const [createdUser] = await db
    .insert(usersTable)
    .values({
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    })
    .returning();

  await db.insert(oauthAccountsTable).values({
    userId: createdUser.id,
    provider,
    providerUserId: profile.providerUserId,
  });

  return createdUser;
}

export function toAuthUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}
