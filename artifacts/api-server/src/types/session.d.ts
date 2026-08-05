import type { SessionData } from "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
  }
}

export type { SessionData };
