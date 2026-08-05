import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import type { Express } from "express";

const PgSession = connectPgSimple(session);

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is required for auth sessions.",
    );
  }
  return secret;
}

export function getAppOrigin(): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin) {
    throw new Error(
      "APP_ORIGIN environment variable is required for OAuth redirects.",
    );
  }
  return origin.replace(/\/+$/, "");
}

export function getOAuthCallbackUrl(provider: "google" | "github"): string {
  return `${getAppOrigin()}/api/auth/${provider}/callback`;
}

export function configureSession(app: Express): void {
  const isProduction = process.env.NODE_ENV === "production";

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: true,
      }),
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );
}
