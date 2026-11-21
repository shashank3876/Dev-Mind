import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  getEngineeringProfile,
  rebuildEngineeringProfile,
} from "../services/dna";

const router: IRouter = Router();

router.get("/dna", requireAuth, async (req, res) => {
  try {
    const profile = await getEngineeringProfile(req.authUser!.id);
    res.json({ profile });
  } catch (err) {
    logger.error({ err }, "Get DNA profile failed");
    res.status(500).json({ message: "Failed to load engineering profile." });
  }
});

router.post("/dna/rebuild", requireAuth, async (req, res) => {
  try {
    const profile = await rebuildEngineeringProfile(req.authUser!.id, {
      reason: "manual",
      syncFirst: true,
      enforceQuota: true,
    });
    res.json({ profile });
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
    logger.error({ err }, "DNA rebuild failed");
    res.status(502).json({ message: "Failed to rebuild engineering profile." });
  }
});

export default router;
