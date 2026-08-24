import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  appendPrReviewMessage,
  createPrReview,
  deletePrReview,
  getPrReviewForUser,
  getPrReviewHistory,
  listPrReviewMessages,
  listPrReviews,
  savePrReviewBody,
} from "../services/pr-reviews";

const router: IRouter = Router();

function getAiBackendUrl(): string {
  const url = process.env.AI_BACKEND_URL ?? process.env.VITE_API_URL ?? "http://localhost:8001";
  return url.replace(/\/+$/, "");
}

function parsePrUrl(prUrl: string): { repo: string; prNumber: number } {
  const match = prUrl.trim().match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i,
  );
  if (!match) {
    throw new Error("Enter a GitHub pull request URL like https://github.com/owner/repo/pull/123");
  }
  return { repo: `${match[1]}/${match[2]}`, prNumber: Number(match[3]) };
}

function consumeSseTokens(chunk: string, buffer: string): { tokens: string[]; buffer: string } {
  const combined = buffer + chunk;
  const frames = combined.split("\n\n");
  const nextBuffer = frames.pop() ?? "";
  const tokens: string[] = [];

  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6);
      try {
        tokens.push(JSON.parse(raw) as string);
      } catch {
        tokens.push(raw);
      }
    }
  }

  return { tokens, buffer: nextBuffer };
}

function isMetaToken(token: string): boolean {
  return (
    token === "[DONE]" ||
    token.startsWith("[META:") ||
    token.startsWith("[CONTEXT:") ||
    token.startsWith("[PROVIDER:")
  );
}

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toReviewJson(row: {
  id: string;
  prUrl: string;
  repo: string;
  prNumber: number;
  title: string;
  review: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    prUrl: row.prUrl,
    repo: row.repo,
    prNumber: row.prNumber,
    title: row.title,
    review: row.review,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/pr-reviews", requireAuth, async (req, res) => {
  const rows = await listPrReviews(req.authUser!.id);
  res.json({ reviews: rows.map(toReviewJson) });
});

router.get("/pr-reviews/:id", requireAuth, async (req, res) => {
  const id = routeId(req.params.id);
  if (!id) {
    res.status(404).json({ message: "PR review not found." });
    return;
  }
  const row = await getPrReviewForUser(id, req.authUser!.id);
  if (!row) {
    res.status(404).json({ message: "PR review not found." });
    return;
  }
  const messages = await listPrReviewMessages(row.id);
  res.json({
    review: toReviewJson(row),
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    })),
  });
});

router.delete("/pr-reviews/:id", requireAuth, async (req, res) => {
  const id = routeId(req.params.id);
  if (!id) {
    res.status(404).json({ message: "PR review not found." });
    return;
  }
  const deleted = await deletePrReview(id, req.authUser!.id);
  if (!deleted) {
    res.status(404).json({ message: "PR review not found." });
    return;
  }
  res.json({ success: true });
});

router.post("/pr-reviews", requireAuth, async (req, res) => {
  const prUrl = typeof req.body?.prUrl === "string" ? req.body.prUrl.trim() : "";
  if (!prUrl) {
    res.status(400).json({ message: "prUrl is required." });
    return;
  }

  let parsed: { repo: string; prNumber: number };
  try {
    parsed = parsePrUrl(prUrl);
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Invalid PR URL." });
    return;
  }

  const saved = await createPrReview({
    userId: req.authUser!.id,
    prUrl,
    repo: parsed.repo,
    prNumber: parsed.prNumber,
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${getAiBackendUrl()}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pr_url: prUrl }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach ai-backend for PR review");
    res.status(502).json({ message: "Review service unavailable." });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    res.status(upstream.status === 200 ? 502 : upstream.status).json({
      message: text || "Review request failed.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Pr-Review-Id", saved.id);
  res.setHeader("Access-Control-Expose-Headers", "X-Pr-Review-Id");

  let sseBuffer = "";
  let reviewBody = "";
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
      const parsedTokens = consumeSseTokens(chunk, sseBuffer);
      sseBuffer = parsedTokens.buffer;
      for (const token of parsedTokens.tokens) {
        if (!isMetaToken(token)) {
          reviewBody += token;
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "PR review stream failed");
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  if (reviewBody.trim()) {
    try {
      await savePrReviewBody(saved.id, reviewBody);
    } catch (err) {
      logger.error({ err }, "Failed to persist PR review");
    }
  }

  res.end();
});

router.post("/pr-reviews/:id/ask", requireAuth, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ message: "message is required." });
    return;
  }

  const id = routeId(req.params.id);
  if (!id) {
    res.status(404).json({ message: "PR review not found." });
    return;
  }
  const saved = await getPrReviewForUser(id, req.authUser!.id);
  if (!saved) {
    res.status(404).json({ message: "PR review not found." });
    return;
  }
  if (!saved.review.trim()) {
    res.status(409).json({ message: "Wait for the review to finish before asking questions." });
    return;
  }

  const history = await getPrReviewHistory(saved.id);
  await appendPrReviewMessage(saved.id, "user", message);

  let upstream: Response;
  try {
    upstream = await fetch(`${getAiBackendUrl()}/review/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: message,
        review: saved.review,
        pr_url: saved.prUrl,
        repo: saved.repo,
        pr_number: saved.prNumber,
        history,
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach ai-backend for PR Q&A");
    res.status(502).json({ message: "Review chat unavailable." });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    res.status(upstream.status === 200 ? 502 : upstream.status).json({
      message: text || "Question failed.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let sseBuffer = "";
  let assistantContent = "";
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
      const parsedTokens = consumeSseTokens(chunk, sseBuffer);
      sseBuffer = parsedTokens.buffer;
      for (const token of parsedTokens.tokens) {
        if (!isMetaToken(token)) {
          assistantContent += token;
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "PR Q&A stream failed");
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  if (assistantContent.trim()) {
    try {
      await appendPrReviewMessage(saved.id, "assistant", assistantContent);
    } catch (err) {
      logger.error({ err }, "Failed to persist PR Q&A message");
    }
  }

  res.end();
});

export default router;
