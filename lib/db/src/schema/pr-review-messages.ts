import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { prReviewsTable } from "./pr-reviews";

export const prReviewMessagesTable = pgTable(
  "pr_review_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => prReviewsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("pr_review_messages_review_created_idx").on(table.reviewId, table.createdAt),
  ],
);

export type PrReviewMessage = typeof prReviewMessagesTable.$inferSelect;
export type InsertPrReviewMessage = typeof prReviewMessagesTable.$inferInsert;
