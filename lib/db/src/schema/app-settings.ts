import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;
export type InsertAppSetting = typeof appSettingsTable.$inferInsert;

export const FREE_CHAT_MESSAGE_LIMIT_KEY = "free_chat_message_limit";
