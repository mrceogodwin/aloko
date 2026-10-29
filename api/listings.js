import pg from "pg";
import { buildPublicListingsQuery } from "./listings-query.js";

const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: true },
  });
  return pool;
}

export function createListingsHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Marketplace listings are temporarily unavailable" });
    }

    try {
      const query = buildPublicListingsQuery(req.query ?? {});
      const result = await database.query(query.text, query.values);
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
      return res.status(200).json({
        items: result.rows.map((row) => ({
          ...row,
          price_naira: row.price_kobo === null ? null : Number(row.price_kobo) / 100,
        })),
        count: result.rowCount,
      });
    } catch {
      return res.status(500).json({ error: "Could not load marketplace listings" });
    }
  };
}

export default createListingsHandler();
