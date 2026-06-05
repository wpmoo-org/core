import { authSchema } from "@wpmoo/db/schema/auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createPlaygroundEnv } from "../config/env";

const schema = authSchema;

type PgPool = InstanceType<typeof Pool>;

type GlobalWithPool = typeof globalThis & {
  __wpmooPlaygroundPool?: PgPool;
};

function getPool(): PgPool {
  const globalForPool = globalThis as GlobalWithPool;

  if (globalForPool.__wpmooPlaygroundPool !== undefined) {
    return globalForPool.__wpmooPlaygroundPool;
  }

  const env = createPlaygroundEnv(process.env);
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  if (env.NODE_ENV !== "production") {
    globalForPool.__wpmooPlaygroundPool = pool;
  }

  return pool;
}

export function createPlaygroundDatabase() {
  return drizzle(getPool(), { schema });
}

export function createPlaygroundQueryClient() {
  const pool = getPool();

  return {
    async query(sql: string, parameters?: readonly unknown[]) {
      const result = await pool.query(sql, parameters as unknown[] | undefined);

      return {
        rowCount: result.rowCount,
        rows: result.rows as readonly Record<string, unknown>[]
      };
    }
  };
}
