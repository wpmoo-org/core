import { Client } from "pg";
import {
  corePermissionSeeds,
  coreRolePermissionSeeds,
  coreRoleSeeds
} from "./seed-data.js";

export type SeedResult = {
  inserted: number;
  updated: number;
};

export type SeedDatabaseClient = {
  query: (
    sql: string,
    parameters?: readonly unknown[]
  ) => Promise<{ rowCount: number | null; rows?: Array<{ inserted?: boolean }> }>;
};

type SeedCoreOptions = {
  client?: SeedDatabaseClient;
  databaseUrl?: string;
};

async function upsertSeedRow(
  client: SeedDatabaseClient,
  sql: string,
  parameters: readonly unknown[]
): Promise<SeedResult> {
  const result = await client.query(sql, parameters);

  if (result.rowCount === 0) {
    return { inserted: 0, updated: 0 };
  }

  const inserted = result.rows?.[0]?.inserted;

  return {
    inserted: inserted === false ? 0 : 1,
    updated: inserted === false ? 1 : 0
  };
}

function addSeedResults(left: SeedResult, right: SeedResult): SeedResult {
  return {
    inserted: left.inserted + right.inserted,
    updated: left.updated + right.updated
  };
}

export async function seedCore(options: SeedCoreOptions = {}): Promise<SeedResult> {
  if (options.client !== undefined) {
    return seedCoreWithClient(options.client);
  }

  const databaseUrl =
    options.databaseUrl ?? process.env.RBAC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL or RBAC_TEST_DATABASE_URL is required for db:seed.");
  }

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    return await seedCoreWithClient(client);
  } finally {
    await client.end();
  }
}

async function seedCoreWithClient(client: SeedDatabaseClient): Promise<SeedResult> {
  let total: SeedResult = { inserted: 0, updated: 0 };

  for (const role of coreRoleSeeds) {
    total = addSeedResults(
      total,
      await upsertSeedRow(
        client,
        `
          INSERT INTO role (id, name, label, description, kind, stage)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            kind = EXCLUDED.kind,
            stage = EXCLUDED.stage,
            updated_at = now()
          WHERE
            role.name IS DISTINCT FROM EXCLUDED.name OR
            role.label IS DISTINCT FROM EXCLUDED.label OR
            role.description IS DISTINCT FROM EXCLUDED.description OR
            role.kind IS DISTINCT FROM EXCLUDED.kind OR
            role.stage IS DISTINCT FROM EXCLUDED.stage
          RETURNING (xmax = 0) AS inserted
        `,
        [role.id, role.name, role.label, role.description, role.kind, role.stage]
      )
    );
  }

  for (const permission of corePermissionSeeds) {
    total = addSeedResults(
      total,
      await upsertSeedRow(
        client,
        `
          INSERT INTO permission (
            id,
            resource,
            action,
            label,
            category,
            description,
            risk
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            resource = EXCLUDED.resource,
            action = EXCLUDED.action,
            label = EXCLUDED.label,
            category = EXCLUDED.category,
            description = EXCLUDED.description,
            risk = EXCLUDED.risk,
            updated_at = now()
          WHERE
            permission.resource IS DISTINCT FROM EXCLUDED.resource OR
            permission.action IS DISTINCT FROM EXCLUDED.action OR
            permission.label IS DISTINCT FROM EXCLUDED.label OR
            permission.category IS DISTINCT FROM EXCLUDED.category OR
            permission.description IS DISTINCT FROM EXCLUDED.description OR
            permission.risk IS DISTINCT FROM EXCLUDED.risk
          RETURNING (xmax = 0) AS inserted
        `,
        [
          permission.id,
          permission.resource,
          permission.action,
          permission.label,
          permission.category,
          permission.description,
          permission.risk
        ]
      )
    );
  }

  for (const rolePermission of coreRolePermissionSeeds) {
    total = addSeedResults(
      total,
      await upsertSeedRow(
        client,
        `
          INSERT INTO role_permission (role_id, permission_id)
          VALUES ($1, $2)
          ON CONFLICT (role_id, permission_id) DO NOTHING
          RETURNING true AS inserted
        `,
        [rolePermission.roleId, rolePermission.permissionId]
      )
    );
  }

  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seedCore();
  console.log(`Seed complete: ${result.inserted} inserted, ${result.updated} updated.`);
}
