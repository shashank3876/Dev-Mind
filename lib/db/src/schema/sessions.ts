import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Managed by connect-pg-simple (express-session). Declared here so drizzle-kit
// does not treat it as an orphan table during push.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export type Session = typeof sessionsTable.$inferSelect;

