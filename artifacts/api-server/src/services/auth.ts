import { and, eq } from "drizzle-orm";
import {
  db,
  oauthAccountsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { OAuthProfile, OAuthProvider } from "../lib/oauth";
import { encryptToken } from "../lib/token-crypto";

function oauthTokenFields(profile: OAuthProfile) {
  const fields: {
    providerLogin?: string | null;
    accessTokenEncrypted?: string | null;
    tokenScopes?: string | null;
    tokenUpdatedAt?: Date | null;
  } = {};

  if (profile.providerLogin !== undefined) {
    fields.providerLogin = profile.providerLogin;
  }
  if (profile.accessToken) {
    fields.accessTokenEncrypted = encryptToken(profile.accessToken);
    fields.tokenScopes = profile.tokenScopes ?? null;
    fields.tokenUpdatedAt = new Date();
  }
  return fields;
}

export async function findUserById(userId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ?? null;
}

export async function findGitHubLoginForUser(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ providerLogin: oauthAccountsTable.providerLogin })
    .from(oauthAccountsTable)
    .where(
      and(
        eq(oauthAccountsTable.userId, userId),
        eq(oauthAccountsTable.provider, "github"),
      ),
    )
    .limit(1);
  return row?.providerLogin ?? null;
}

export async function findUserIdByGitHubLogin(
  login: string,
): Promise<string | null> {
  const normalized = login.trim().toLowerCase();
  if (!normalized) return null;

  const accounts = await db
    .select({
      userId: oauthAccountsTable.userId,
      providerLogin: oauthAccountsTable.providerLogin,
    })
    .from(oauthAccountsTable)
    .where(eq(oauthAccountsTable.provider, "github"));

  const match = accounts.find(
    (row) => row.providerLogin?.toLowerCase() === normalized,
  );
  return match?.userId ?? null;
}

export async function getGitHubOAuthAccount(userId: string) {
  const [row] = await db
    .select()
    .from(oauthAccountsTable)
    .where(
      and(
        eq(oauthAccountsTable.userId, userId),
        eq(oauthAccountsTable.provider, "github"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function clearGitHubAccessToken(userId: string): Promise<void> {
  await db
    .update(oauthAccountsTable)
    .set({
      accessTokenEncrypted: null,
      tokenScopes: null,
      tokenUpdatedAt: null,
    })
    .where(
      and(
        eq(oauthAccountsTable.userId, userId),
        eq(oauthAccountsTable.provider, "github"),
      ),
    );
}

export async function findOrCreateOAuthUser(
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<User> {
  const tokenFields = oauthTokenFields(profile);

  const [existingAccount] = await db
    .select({
      user: usersTable,
      accountId: oauthAccountsTable.id,
    })
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
    if (Object.keys(tokenFields).length > 0) {
      await db
        .update(oauthAccountsTable)
        .set(tokenFields)
        .where(eq(oauthAccountsTable.id, existingAccount.accountId));
    }

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
      ...tokenFields,
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
    ...tokenFields,
  });

  return createdUser;
}

export async function toAuthUser(user: User) {
  const githubLogin = await findGitHubLoginForUser(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    githubLogin,
  };
}
