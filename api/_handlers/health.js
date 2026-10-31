import pg from "pg";

const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
      ssl: { rejectUnauthorized: true },
    });
  }
  return pool;
}

export function createHealthHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ status: "method_not_allowed" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ status: "unavailable", database: "not_configured" });
    }

    try {
      await database.query("SELECT 1");
    } catch {
      return res.status(503).json({ status: "unavailable", database: "unreachable" });
    }

    let schema = "unknown";
    try {
      const result = await database.query(
        `SELECT to_regclass('public.listings') IS NOT NULL AS listings_ok,
                to_regclass('public.profiles') IS NOT NULL AS profiles_ok`
      );
      const row = result.rows?.[0] || {};
      if (row.listings_ok && row.profiles_ok) schema = "ready";
      else if (!row.listings_ok && !row.profiles_ok) schema = "missing_foundation";
      else schema = "incomplete";
    } catch {
      schema = "check_failed";
    }

    const ok = schema === "ready";
    return res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      database: "connected",
      schema,
      hint:
        schema === "ready"
          ? undefined
          : "Apply database/migrations/001_marketplace_foundation.sql on the Neon project used by DATABASE_URL",
    });
  };
}

export default createHealthHandler();
