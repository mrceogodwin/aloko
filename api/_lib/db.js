import pg from "pg";

const { Pool } = pg;
let pool;

/**
 * Shared server-only PostgreSQL pool.
 * Returns null when DATABASE_URL is not configured (fail closed for writes).
 */
export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: true },
    });
  }
  return pool;
}

/** Test helper: replace or clear the cached pool. */
export function setPoolForTests(nextPool) {
  pool = nextPool;
}
