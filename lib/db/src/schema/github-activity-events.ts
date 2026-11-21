import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type ActivitySource = "oauth_push" | "oauth_pr" | "webhook_pr";

export type ActivityCommit = {
  sha: string;
  message: string;
};

export const githubActivityEventsTable = pgTable(
  "github_activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    source: text("source").notNull().$type<ActivitySource>(),
    dedupKey: text("dedup_key").notNull(),
    repo: text("repo").notNull(),
    ref: text("ref"),
    branch: text("branch"),
    sha: text("sha"),
    commits: jsonb("commits").$type<ActivityCommit[]>().notNull().default([]),
    prNumber: integer("pr_number"),
    summary: text("summary"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("github_activity_dedup_idx").on(table.userId, table.dedupKey),
    index("github_activity_user_occurred_idx").on(table.userId, table.occurredAt),
  ],
);

export type GithubActivityEvent = typeof githubActivityEventsTable.$inferSelect;
export type InsertGithubActivityEvent = typeof githubActivityEventsTable.$inferInsert;
