import pg from "pg";

const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 3000,
    ssl: { rejectUnauthorized: true },
  });
  return pool;
}

export function createHealthHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
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
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ status: "ok", database: "connected" });
    } catch {
      return res.status(503).json({ status: "unavailable", database: "unreachable" });
    }
  };
}

export default createHealthHandler();
