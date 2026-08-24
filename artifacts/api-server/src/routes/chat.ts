import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import {
  canUserSendChat,
  getChatUsageSummary,
  recordChatUsage,
} from "../services/usage";
import {
  appendMessage,
  createConversation,
  getConversationForUser,
  getRecentHistory,
  setConversationTitle,
  titleFromMessage,
} from "../services/conversations";
import { GetChatUsageResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getAiBackendUrl(): string {
  const url = process.env.AI_BACKEND_URL ?? process.env.VITE_API_URL ?? "http://localhost:8001";
  return url.replace(/\/+$/, "");
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
    token.startsWith("[CONTEXT:") ||
    token.startsWith("[PROVIDER:")
  );
}

router.get("/chat/usage", requireAuth, async (req, res) => {
  const summary = await getChatUsageSummary(req.authUser!.id);
  const data = GetChatUsageResponse.parse(summary);
  res.json(data);
});

router.post("/chat", requireAuth, async (req, res) => {
  const user = req.authUser!;
  const message = req.body?.message;

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ message: "message is required." });
    return;
  }

  const usage = await canUserSendChat(user.id);
  if (!usage.canSend) {
    res.status(402).json({
      code: "quota_exceeded",
      used: usage.used,
      limit: usage.limit,
      resetsAt: usage.resetsAt,
    });
    return;
  }

  const trimmed = message.trim();
  let conversationId =
    typeof req.body?.conversationId === "string" ? req.body.conversationId : "";

  if (conversationId) {
    const existing = await getConversationForUser(conversationId, user.id);
    if (!existing) {
      res.status(404).json({ message: "Conversation not found." });
      return;
    }
  } else {
    const created = await createConversation(user.id, titleFromMessage(trimmed));
    conversationId = created.id;
  }

  const history = await getRecentHistory(conversationId);
  await appendMessage(conversationId, "user", trimmed);
  if (history.length === 0) {
    await setConversationTitle(conversationId, titleFromMessage(trimmed));
  }

  const provider = req.body?.provider;
  const payload: Record<string, unknown> = {
    message: trimmed,
    user_id: user.id,
    history,
  };
  if (typeof provider === "string" && provider) {
    payload.provider = provider;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getAiBackendUrl()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach ai-backend");
    res.status(502).json({ message: "Chat service unavailable." });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    res.status(upstream.status).json({
      message: text || "Chat request failed.",
    });
    return;
  }

  if (!upstream.body) {
    res.status(502).json({ message: "Chat service returned empty body." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Conversation-Id", conversationId);
  res.setHeader("Access-Control-Expose-Headers", "X-Conversation-Id");

  let recorded = false;
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

      const parsed = consumeSseTokens(chunk, sseBuffer);
      sseBuffer = parsed.buffer;
      for (const token of parsed.tokens) {
        if (!isMetaToken(token)) {
          assistantContent += token;
        }
      }

      if (!recorded && chunk.includes("[DONE]")) {
        await recordChatUsage(user.id);
        recorded = true;
      }
    }
  } catch (err) {
    logger.error({ err }, "Chat stream proxy failed");
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  if (!recorded) {
    await recordChatUsage(user.id);
  }

  if (assistantContent.trim()) {
    try {
      await appendMessage(conversationId, "assistant", assistantContent);
    } catch (err) {
      logger.error({ err }, "Failed to persist assistant message");
    }
  }

  res.end();
});

export default router;
