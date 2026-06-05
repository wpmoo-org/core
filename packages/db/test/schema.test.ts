import { getTableName } from "drizzle-orm";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
        "user_permission",
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

  it("defers admin invitations beyond Phase 2", () => {
    const phase2TableNames = new Set(
      Object.values(coreSchema).map((table) => getTableName(table))
    );

    for (const tableName of phase2DeferredTables) {
      expect(phase2TableNames.has(tableName)).toBe(false);
    }
  });

  it("keeps drizzle migration journal and snapshots in sync", () => {
    const drizzleDir = path.join(process.cwd(), "packages/db/drizzle");
    const metaDir = path.join(drizzleDir, "meta");
    const journal = JSON.parse(
      readFileSync(path.join(metaDir, "_journal.json"), "utf8")
    ) as {
      entries: Array<{
        idx: number;
        tag: string;
      }>;
    };

    const migrationFiles = readdirSync(drizzleDir).filter((fileName) =>
      /^\d+_.+\.sql$/.test(fileName)
    );
    const snapshotFiles = readdirSync(metaDir).filter((fileName) =>
      /^\d+_snapshot\.json$/.test(fileName)
    );

    const sortNumbers = (left: number, right: number) => left - right;
    const journalIndexes = journal.entries.map((entry) => entry.idx).sort(sortNumbers);
    const snapshotIndexes = snapshotFiles
      .map((fileName) => Number(fileName.split("_")[0]))
      .filter((index) => Number.isInteger(index))
      .sort(sortNumbers);
    const migrationIndexes = migrationFiles
      .map((fileName) => Number(fileName.split("_")[0]))
      .filter((index) => Number.isInteger(index))
      .sort(sortNumbers);

    expect(snapshotIndexes).toEqual(journalIndexes);
    expect(migrationIndexes).toEqual(journalIndexes);

    const migrationFileNames = new Set(migrationFiles);
    for (const entry of journal.entries) {
      expect(migrationFileNames.has(`${entry.tag}.sql`)).toBe(true);
      const snapshotFileName = String(entry.idx).padStart(4, "0") + "_snapshot.json";
      expect(snapshotFiles).toContain(snapshotFileName);
    }
  });
});
