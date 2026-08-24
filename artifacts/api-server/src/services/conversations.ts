import { and, asc, desc, eq } from "drizzle-orm";
import {
  conversationMessagesTable,
  conversationsTable,
  db,
  type Conversation,
  type ConversationMessage,
} from "@workspace/db";

const HISTORY_LIMIT = 20;

export function titleFromMessage(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length <= 48 ? compact : `${compact.slice(0, 45)}...`;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  return db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .orderBy(desc(conversationsTable.updatedAt));
}

export async function getConversationForUser(
  conversationId: string,
  userId: string,
): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createConversation(
  userId: string,
  title = "New chat",
): Promise<Conversation> {
  const [row] = await db
    .insert(conversationsTable)
    .values({ userId, title })
    .returning();
  if (!row) {
    throw new Error("Failed to create conversation.");
  }
  return row;
}

export async function deleteConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, userId),
      ),
    )
    .returning({ id: conversationsTable.id });
  return deleted.length > 0;
}

export async function listMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  return db
    .select()
    .from(conversationMessagesTable)
    .where(eq(conversationMessagesTable.conversationId, conversationId))
    .orderBy(asc(conversationMessagesTable.createdAt));
}

export async function getRecentHistory(
  conversationId: string,
): Promise<Array<{ role: string; content: string }>> {
  const rows = await db
    .select({
      role: conversationMessagesTable.role,
      content: conversationMessagesTable.content,
    })
    .from(conversationMessagesTable)
    .where(eq(conversationMessagesTable.conversationId, conversationId))
    .orderBy(desc(conversationMessagesTable.createdAt))
    .limit(HISTORY_LIMIT);

  return rows.reverse();
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<ConversationMessage> {
  const [row] = await db
    .insert(conversationMessagesTable)
    .values({ conversationId, role, content })
    .returning();
  if (!row) {
    throw new Error("Failed to save message.");
  }

  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  return row;
}

export async function setConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  await db
    .update(conversationsTable)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));
}
