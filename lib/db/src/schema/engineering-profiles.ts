import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type EngineeringProfileStatus =
  | "ready"
  | "building"
  | "stale"
  | "insufficient_data";

export type EngineeringEvidenceStats = {
  pushCount: number;
  prCount: number;
  reviewCount: number;
  diffCount: number;
};

export const engineeringProfilesTable = pgTable(
  "engineering_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().$type<EngineeringProfileStatus>(),
    summary: text("summary"),
    evidenceStats: jsonb("evidence_stats")
      .$type<EngineeringEvidenceStats>()
      .notNull()
      .default({
        pushCount: 0,
        prCount: 0,
        reviewCount: 0,
        diffCount: 0,
      }),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("engineering_profiles_user_uidx").on(table.userId),
    index("engineering_profiles_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export type EngineeringProfile = typeof engineeringProfilesTable.$inferSelect;
export type InsertEngineeringProfile = typeof engineeringProfilesTable.$inferInsert;
