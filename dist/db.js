import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js"; // compiled to .js by tsc
const { Pool } = pg;
const connStr = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!connStr) {
    throw new Error("NEON_DATABASE_URL must be set.");
}
export const pool = new Pool({ connectionString: connStr });
export const db = drizzle(pool, { schema });
export * from "./schema.js";
