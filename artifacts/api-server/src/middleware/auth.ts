import type { NextFunction, Request, Response } from "express";
import { findUserById, toAuthUser } from "../services/auth";
import type { User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      authUser?: User;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  const user = await findUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {
      res.status(401).json({ message: "Authentication required." });
    });
    return;
  }

  req.authUser = user;
  next();
}

export function toPublicUser(user: User) {
  return toAuthUser(user);
}
