import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth.js";
import {
  findProofColumn,
  pinnedBetterAuthVersion,
  schemaDiffsVsCoreContract,
  tokenPersistenceDecisions
} from "../src/proof.js";

describe("Better Auth proof pack", () => {
  it("wires email/password auth to the Drizzle-backed auth schema", () => {
    expect(typeof createAuth).toBe("function");
  });

  it("pins Better Auth and the Drizzle adapter to the same exact version", () => {
    const packageJsonPath = resolve(import.meta.dirname, "../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies: Record<string, string>;
    };

    expect(packageJson.dependencies["better-auth"]).toBe(pinnedBetterAuthVersion);
    expect(packageJson.dependencies["@better-auth/drizzle-adapter"]).toBe(
      pinnedBetterAuthVersion
    );
  });

  it("captures plugin-required Better Auth schema fields that SCHEMA.md must reconcile", () => {
    expect(findProofColumn("two_factor", "verified")).toMatchObject({
      type: "boolean",
      default: "true"
    });
    expect(findProofColumn("passkey", "aaguid")).toMatchObject({
      type: "text",
      required: false
    });
    expect(findProofColumn("passkey", "device_type")).toMatchObject({
      type: "text",
      required: true
    });
    expect(findProofColumn("passkey", "backed_up")).toMatchObject({
      type: "boolean",
      required: true
    });
  });

  it("records the expected schema diff report before migration generation", () => {
    expect(schemaDiffsVsCoreContract).toHaveLength(8);
    expect(schemaDiffsVsCoreContract.map((diff) => `${diff.table}.${diff.column}`)).toEqual([
      "all auth tables.*_at",
      "verification.created_at / updated_at",
      "two_factor.verified",
      "two_factor.user_id",
      "passkey.credential_id",
      "passkey.counter",
      "passkey.device_type / backed_up",
      "passkey.aaguid"
    ]);
  });

  it("chooses concrete token and secret persistence paths", () => {
    expect(tokenPersistenceDecisions.verificationAndMagicLinkTokens.path).toContain(
      "hashed"
    );
    expect(tokenPersistenceDecisions.oauthProviderTokens.path).toContain(
      "Do not persist"
    );
    expect(tokenPersistenceDecisions.totpSecret.path).toContain("encrypted adapter");
    expect(tokenPersistenceDecisions.backupCodes.path).toContain("one-way hashed");
  });
});
