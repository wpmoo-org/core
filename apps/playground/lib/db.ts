import { authSchema } from "@wpmoo/db/schema/auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { BootstrapTransactionClient, BootstrapTransaction } from "./phase2-actions";
import { createPlaygroundEnv } from "../config/env";

const schema = authSchema;

type PgPool = InstanceType<typeof Pool>;
type PgPoolClient = Awaited<ReturnType<PgPool["connect"]>>;

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

function toQueryClient(client: PgPoolClient | PgPool): BootstrapTransactionClient {
  return {
    async query<Row extends Record<string, unknown>>(
      sql: string,
      parameters?: readonly unknown[]
    ) {
      const result = await client.query(sql, parameters as unknown[] | undefined);

      return {
        rowCount: result.rowCount,
        rows: result.rows as readonly Row[]
      };
    }
  };
}

export function createPlaygroundDatabase() {
  return drizzle(getPool(), { schema });
}

export function createPlaygroundQueryClient() {
  return toQueryClient(getPool());
}

export const createPlaygroundTransaction: BootstrapTransaction = async (callback) => {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(toQueryClient(client));
    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
