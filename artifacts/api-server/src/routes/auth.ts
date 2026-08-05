import { Router, type IRouter, type Request, type Response } from "express";
import {
  createOAuthState,
  exchangeGitHubCode,
  exchangeGoogleCode,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
  isProviderConfigured,
  type OAuthProvider,
} from "../lib/oauth";
import { getAppOrigin, getOAuthCallbackUrl } from "../lib/session";
import {
  findOrCreateOAuthUser,
  findUserById,
  toAuthUser,
} from "../services/auth";
import { GetAuthMeResponse, AuthLogoutResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function redirectToLogin(res: Response, error?: string): void {
  const origin = getAppOrigin();
  const url = new URL(origin);
  url.searchParams.set("auth_error", error ?? "oauth_failed");
  res.redirect(url.toString());
}

function startOAuth(provider: OAuthProvider) {
  return (req: Request, res: Response): void => {
    if (!isProviderConfigured(provider)) {
      res.status(503).json({
        message: `${provider} OAuth is not configured on this server.`,
      });
      return;
    }

    const state = createOAuthState();
    req.session.oauthState = state;

    const redirectUri = getOAuthCallbackUrl(provider);
    const authUrl =
      provider === "google"
        ? getGoogleAuthUrl(state, redirectUri)
        : getGitHubAuthUrl(state, redirectUri);

    req.session.save((err) => {
      if (err) {
        res.status(500).json({ message: "Failed to start OAuth flow." });
        return;
      }
      res.redirect(authUrl);
    });
  };
}

function handleOAuthCallback(provider: OAuthProvider) {
  return async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query;

    if (typeof error === "string") {
      redirectToLogin(res, error);
      return;
    }

    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      !req.session.oauthState ||
      state !== req.session.oauthState
    ) {
      redirectToLogin(res, "invalid_state");
      return;
    }

    delete req.session.oauthState;

    try {
      const redirectUri = getOAuthCallbackUrl(provider);
      const profile =
        provider === "google"
          ? await exchangeGoogleCode(code, redirectUri)
          : await exchangeGitHubCode(code, redirectUri);

      const user = await findOrCreateOAuthUser(provider, profile);
      req.session.userId = user.id;

      req.session.save((saveErr) => {
        if (saveErr) {
          redirectToLogin(res, "session_error");
          return;
        }
        res.redirect(getAppOrigin());
      });
    } catch {
      redirectToLogin(res, "oauth_failed");
    }
  };
}

router.get("/auth/google", startOAuth("google"));
router.get("/auth/google/callback", handleOAuthCallback("google"));
router.get("/auth/github", startOAuth("github"));
router.get("/auth/github/callback", handleOAuthCallback("github"));

router.get("/auth/me", async (req, res) => {
  if (!req.session.userId) {
    const data = GetAuthMeResponse.parse({ user: null });
    res.json(data);
    return;
  }

  const user = await findUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {
      const data = GetAuthMeResponse.parse({ user: null });
      res.json(data);
    });
    return;
  }

  const data = GetAuthMeResponse.parse({ user: toAuthUser(user) });
  res.json(data);
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ message: "Failed to log out." });
      return;
    }
    res.clearCookie("connect.sid");
    const data = AuthLogoutResponse.parse({ success: true });
    res.json(data);
  });
});

export default router;
