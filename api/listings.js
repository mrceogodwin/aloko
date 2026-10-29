import pg from "pg";
import { buildPublicListingsQuery } from "./listings-query.js";

const { Pool } = pg;
let pool;

function getPool() {
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

function readQueryParams(req) {
  if (req.query && typeof req.query === "object") return req.query;
  try {
    const host = req.headers?.host || "localhost";
    const url = new URL(req.url || "/", `https://${host}`);
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

function classifyDbError(error) {
  const code = error?.code;
  const message = String(error?.message || "");
  // PostgreSQL undefined_table
  if (code === "42P01" || /relation .* does not exist/i.test(message)) {
    return {
      status: 503,
      body: {
        error: "Marketplace schema is not ready",
        detail: "listings table is missing — apply migration 001 on the Neon database linked to this deployment",
      },
    };
  }
  if (code === "28P01" || code === "28000") {
    return {
      status: 503,
      body: { error: "Database authentication failed" },
    };
  }
  return {
    status: 500,
    body: { error: "Could not load marketplace listings" },
  };
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
      const params = readQueryParams(req);
      const query = buildPublicListingsQuery(params);
      const result = await database.query(query.text, query.values);
      const hasMore = result.rows.length > query.limit;
      const pageRows = result.rows.slice(0, query.limit);
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
      return res.status(200).json({
        items: pageRows.map((row) => ({
          ...row,
          price_naira: row.price_kobo === null ? null : Number(row.price_kobo) / 100,
        })),
        count: pageRows.length,
        has_more: hasMore,
      });
    } catch (error) {
      const classified = classifyDbError(error);
      res.setHeader("Cache-Control", "no-store");
      return res.status(classified.status).json(classified.body);
    }
  };
}

export default createListingsHandler();
