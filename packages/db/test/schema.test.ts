import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { authSchema } from "../src/schema/auth.js";
import { coreSchema } from "../src/schema/core.js";
import { phase2DeferredTables } from "../src/seed-data.js";

describe("Phase 2 database schema", () => {
  it("keeps auth tables and adds the first secure slice tables", () => {
    const tableNames = new Set([
      ...Object.values(authSchema).map((table) => getTableName(table)),
      ...Object.values(coreSchema).map((table) => getTableName(table))
    ]);

    expect(tableNames).toEqual(
      new Set([
        "account",
        "audit_event",
        "passkey",
        "permission",
        "rate_limit_bucket",
        "role",
        "role_permission",
        "session",
        "system_setting",
        "two_factor",
        "user",
        "user_lifecycle",
        "user_role",
        "verification"
      ])
    );
  });

  it("defers direct permission overrides and admin invitations beyond Phase 2", () => {
    const phase2TableNames = new Set(
      Object.values(coreSchema).map((table) => getTableName(table))
    );

    for (const tableName of phase2DeferredTables) {
      expect(phase2TableNames.has(tableName)).toBe(false);
    }
  });
});
