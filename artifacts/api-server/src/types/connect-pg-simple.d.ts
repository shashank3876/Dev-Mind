declare module "connect-pg-simple" {
  import type session from "express-session";
  import type { Pool } from "pg";

  interface PgSessionOptions {
    pool: Pool;
    tableName?: string;
    createTableIfMissing?: boolean;
    pruneSessionInterval?: number;
    errorLog?: (...args: unknown[]) => void;
    schemaName?: string;
  }

  function connectPgSimple(
    sessionModule: typeof session,
  ): new (options: PgSessionOptions) => session.Store;

  export default connectPgSimple;
}
