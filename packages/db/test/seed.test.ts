import { describe, expect, it } from "vitest";
import {
  corePermissionSeeds,
  coreRolePermissionSeeds,
  coreRoleSeeds
} from "../src/seed-data.js";
import { seedCore, type SeedDatabaseClient } from "../src/seed.js";

function createSeedClient(result: { rowCount: number; inserted?: boolean }) {
  const queries: string[] = [];
  const client: SeedDatabaseClient = {
    async query(sql) {
      queries.push(sql);

      return {
        rowCount: result.rowCount,
        rows: result.rowCount === 0 ? [] : [{ inserted: result.inserted }]
      };
    }
  };

  return { client, queries };
}

describe("seedCore", () => {
  const expectedSeedRows =
    coreRoleSeeds.length +
    corePermissionSeeds.length +
    coreRolePermissionSeeds.length;

  it("seeds the Phase 2 admin/user roles and permission catalog", () => {
    expect(coreRoleSeeds.map((role) => role.id)).toEqual(["admin", "user"]);
    expect(corePermissionSeeds.map((permission) => permission.id)).toEqual([
      "admin.users:read",
      "admin.users:update",
      "admin.audit:read"
    ]);
    expect(coreRolePermissionSeeds).toEqual(
      corePermissionSeeds.map((permission) => ({
        roleId: "admin",
        permissionId: permission.id
      }))
    );
  });

  it("reports inserted rows when the catalog is first seeded", async () => {
    const { client, queries } = createSeedClient({
      rowCount: 1,
      inserted: true
    });

    await expect(seedCore({ client })).resolves.toEqual({
      inserted: expectedSeedRows,
      updated: 0
    });

    expect(queries).toHaveLength(expectedSeedRows);
  });

  it("reports updated rows only when existing catalog metadata changes", async () => {
    const { client } = createSeedClient({
      rowCount: 1,
      inserted: false
    });

    await expect(seedCore({ client })).resolves.toEqual({
      inserted: 0,
      updated: expectedSeedRows
    });
  });

  it("is idempotent when no seed row changes", async () => {
    const { client } = createSeedClient({
      rowCount: 0
    });

    await expect(seedCore({ client })).resolves.toEqual({
      inserted: 0,
      updated: 0
    });
  });
});
