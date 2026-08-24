import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

export const conversationMessagesTable = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conversation_messages_convo_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type ConversationMessage = typeof conversationMessagesTable.$inferSelect;
export type InsertConversationMessage = typeof conversationMessagesTable.$inferInsert;
