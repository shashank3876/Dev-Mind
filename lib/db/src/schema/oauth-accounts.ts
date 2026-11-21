import { pgTable, text, timestamp, uniqueIndex, uuid, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const oauthAccountsTable = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    providerLogin: text("provider_login"),
    accessTokenEncrypted: text("access_token_encrypted"),
    tokenScopes: text("token_scopes"),
    tokenUpdatedAt: timestamp("token_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("oauth_provider_user_idx").on(
      table.provider,
      table.providerUserId,
    ),
    index("oauth_provider_login_idx").on(table.provider, table.providerLogin),
  ],
);

export type OAuthAccount = typeof oauthAccountsTable.$inferSelect;
export type InsertOAuthAccount = typeof oauthAccountsTable.$inferInsert;
