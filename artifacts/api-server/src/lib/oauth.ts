import crypto from "node:crypto";

export type OAuthProvider = "google" | "github";

export interface OAuthProfile {
  providerUserId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export function createOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }
  return { clientId, clientSecret };
}

function getGitHubConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured.");
  }
  return { clientId, clientSecret };
}

export function getGoogleAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = getGoogleConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  const { clientId, clientSecret } = getGoogleConfig();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("Failed to exchange Google authorization code.");
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Google token response missing access_token.");
  }

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error("Failed to fetch Google user profile.");
  }

  const user = (await userRes.json()) as {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!user.id || !user.email) {
    throw new Error("Google profile missing required fields.");
  }

  return {
    providerUserId: user.id,
    email: user.email,
    name: user.name ?? null,
    avatarUrl: user.picture ?? null,
  };
}

export function getGitHubAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = getGitHubConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGitHubCode(
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  const { clientId, clientSecret } = getGitHubConfig();
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("Failed to exchange GitHub authorization code.");
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("GitHub token response missing access_token.");
  }

  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "DevMind",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) {
    throw new Error("Failed to fetch GitHub user profile.");
  }

  const user = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };

  if (!user.id) {
    throw new Error("GitHub profile missing user id.");
  }

  let email = user.email ?? null;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers,
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((entry) => entry.primary && entry.verified);
      email = primary?.email ?? emails[0]?.email ?? null;
    }
  }

  if (!email) {
    throw new Error("GitHub account has no accessible email address.");
  }

  return {
    providerUserId: String(user.id),
    email,
    name: user.name ?? user.login ?? null,
    avatarUrl: user.avatar_url ?? null,
  };
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === "google") {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    );
  }
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}
