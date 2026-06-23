import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

// We only initialize connection if DATABASE_URL is provided by user environment.
export const createPool = () => {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL is not set. Database features will be unavailable.",
    );
    return null;
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

if (pool) {
  pool.on("error", (err) => {
    console.error("Unexpected error on idle SQL pool client:", err);
  });
}

// Export db instance
// You can use `db` in your API routes if initialized.
export const db = pool ? drizzle(pool, { schema }) : null;
