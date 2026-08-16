import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const chatUsageTable = pgTable("chat_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ChatUsage = typeof chatUsageTable.$inferSelect;
export type InsertChatUsage = typeof chatUsageTable.$inferInsert;
