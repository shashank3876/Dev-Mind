import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createConversation,
  deleteConversation,
  getConversationForUser,
  listConversations,
  listMessages,
} from "../services/conversations";

const router: IRouter = Router();

router.get("/conversations", requireAuth, async (req, res) => {
  const rows = await listConversations(req.authUser!.id);
  res.json({
    conversations: rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

router.post("/conversations", requireAuth, async (req, res) => {
  const row = await createConversation(req.authUser!.id);
  res.status(201).json({
    conversation: {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
});

router.get("/conversations/:id", requireAuth, async (req, res) => {
  const conversation = await getConversationForUser(req.params.id, req.authUser!.id);
  if (!conversation) {
    res.status(404).json({ message: "Conversation not found." });
    return;
  }

  const messages = await listMessages(conversation.id);
  res.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    },
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    })),
  });
});

router.delete("/conversations/:id", requireAuth, async (req, res) => {
  const deleted = await deleteConversation(req.params.id, req.authUser!.id);
  if (!deleted) {
    res.status(404).json({ message: "Conversation not found." });
    return;
  }
  res.json({ success: true });
});

export default router;
