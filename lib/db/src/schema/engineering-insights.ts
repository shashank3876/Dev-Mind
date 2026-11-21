import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { engineeringProfilesTable } from "./engineering-profiles";

export type EngineeringInsightCategory =
  | "backend"
  | "code_quality"
  | "system_design"
  | "database"
  | "testing"
  | "security"
  | "performance"
  | "error_handling";

export type EngineeringInsightKind =
  | "strength"
  | "improvement"
  | "pattern"
  | "recommendation";

export type EngineeringInsightConfidence =
  | "high"
  | "medium"
  | "low"
  | "insufficient";

export type EngineeringEvidenceRef = {
  type: "push" | "pr" | "review" | "diff" | "commit";
  repo: string;
  prNumber?: number | null;
  sha?: string | null;
  url?: string | null;
  excerpt?: string | null;
  evidenceId?: string | null;
};

export const engineeringInsightsTable = pgTable(
  "engineering_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => engineeringProfilesTable.id, { onDelete: "cascade" }),
    category: text("category").notNull().$type<EngineeringInsightCategory>(),
    kind: text("kind").notNull().$type<EngineeringInsightKind>(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    confidence: text("confidence")
      .notNull()
      .$type<EngineeringInsightConfidence>(),
    evidence: jsonb("evidence")
      .$type<EngineeringEvidenceRef[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("engineering_insights_user_category_idx").on(table.userId, table.category),
    index("engineering_insights_profile_idx").on(table.profileId),
  ],
);

export type EngineeringInsight = typeof engineeringInsightsTable.$inferSelect;
export type InsertEngineeringInsight = typeof engineeringInsightsTable.$inferInsert;
