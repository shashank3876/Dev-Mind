import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  listActivityForUser,
  recordWebhookPrActivity,
  summarizeRecentPushes,
  syncPushActivity,
} from "../services/activity";
import { findUserIdByGitHubLogin } from "../services/auth";

const router: IRouter = Router();

function getInternalSecret(): string {
  return process.env.INTERNAL_API_SECRET?.trim() || "";
}

router.get("/activity", requireAuth, async (req, res) => {
  const events = await listActivityForUser(req.authUser!.id);
  res.json({ events });
});

router.post("/activity/sync", requireAuth, async (req, res) => {
  try {
    const result = await syncPushActivity(req.authUser!.id);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Activity sync failed");
    res.status(502).json({ message: "Failed to sync GitHub activity." });
  }
});

router.post("/activity/summarize", requireAuth, async (req, res) => {
  try {
    const result = await summarizeRecentPushes(req.authUser!.id);
    res.json(result);
  } catch (err) {
    const e = err as Error & {
      code?: string;
      used?: number;
      limit?: number;
      resetsAt?: string;
    };
    if (e.code === "quota_exceeded") {
      res.status(402).json({
        code: "quota_exceeded",
        used: e.used,
        limit: e.limit,
        resetsAt: e.resetsAt,
      });
      return;
    }
    logger.error({ err }, "Activity summarize failed");
    res.status(502).json({ message: e.message || "Failed to summarize pushes." });
  }
});

/** Internal callback from the PR worker — links webhook reviews to OAuth users. */
router.post("/internal/webhook-pr-activity", async (req, res) => {
  const expected = getInternalSecret();
  if (!expected) {
    res.status(503).json({ message: "INTERNAL_API_SECRET is not configured." });
    return;
  }

  const provided = req.header("X-Internal-Secret")?.trim() || "";
  if (provided !== expected) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  const body = req.body as {
    githubLogin?: string;
    repo?: string;
    prNumber?: number;
    sha?: string;
    branch?: string;
    review?: string;
    occurredAt?: string;
  };

  if (
    typeof body.githubLogin !== "string" ||
    !body.githubLogin.trim() ||
    typeof body.repo !== "string" ||
    !body.repo.trim() ||
    typeof body.prNumber !== "number" ||
    !Number.isFinite(body.prNumber)
  ) {
    res.status(400).json({
      message: "githubLogin, repo, and prNumber are required.",
    });
    return;
  }

  const userId = await findUserIdByGitHubLogin(body.githubLogin);
  if (!userId) {
    res.json({ linked: false, reason: "no_matching_user" });
    return;
  }

  try {
    const result = await recordWebhookPrActivity(userId, {
      githubLogin: body.githubLogin,
      repo: body.repo.trim(),
      prNumber: body.prNumber,
      sha: body.sha,
      branch: body.branch,
      review: body.review,
      occurredAt: body.occurredAt,
    });
    res.json({ linked: true, userId, ...result });
  } catch (err) {
    logger.error({ err }, "Failed to record webhook PR activity");
    res.status(500).json({ message: "Failed to record activity." });
  }
});

export default router;
