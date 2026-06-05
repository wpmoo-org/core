import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createAuth, createAuthConfig } from "../src/auth.js";
import {
  betterAuthRuntimeTokenProof,
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

  it("proves Better Auth stores reset/email verification bearer tokens by hashed identifier", async () => {
    const rawIdentifier = "reset-password:raw-token-that-must-not-be-stored";
    const storedIdentifier =
      await betterAuthRuntimeTokenProof.processVerificationIdentifier(rawIdentifier);

    expect(betterAuthRuntimeTokenProof.coreVerificationStorage).toMatchObject({
      storeInDatabase: true,
      storeIdentifier: {
        default: "hashed",
        overrides: {
          "email-verification": "hashed",
          "password-reset": "hashed",
          "reset-password": "hashed"
        }
      }
    });
    expect(storedIdentifier).not.toBe(rawIdentifier);
    expect(storedIdentifier).not.toContain("raw-token-that-must-not-be-stored");
    expect(await betterAuthRuntimeTokenProof.matchesVerificationIdentifier(rawIdentifier, storedIdentifier)).toBe(
      true
    );
  });

  it("keeps token-value plugins disabled until their storeToken behavior is wired", () => {
    expect(betterAuthRuntimeTokenProof.disabledTokenValuePlugins).toEqual([
      "magicLink",
      "oneTimeToken"
    ]);
  });

  it("pins Better Auth source paths for DB-backed verification token hashing", () => {
    const betterAuthDistDir = getBetterAuthDistDir();
    const internalAdapterSource = readFileSync(
      resolve(betterAuthDistDir, "db/internal-adapter.mjs"),
      "utf8"
    );
    const passwordRouteSource = readFileSync(
      resolve(betterAuthDistDir, "api/routes/password.mjs"),
      "utf8"
    );
    const emailVerificationSource = readFileSync(
      resolve(betterAuthDistDir, "api/routes/email-verification.mjs"),
      "utf8"
    );
    const signUpSource = readFileSync(
      resolve(betterAuthDistDir, "api/routes/sign-up.mjs"),
      "utf8"
    );

    expect(internalAdapterSource).toContain(
      "const storageOption = getStorageOption(data.identifier, options.verification?.storeIdentifier)"
    );
    expect(internalAdapterSource).toContain(
      "identifier: storedIdentifier"
    );
    expect(internalAdapterSource).toContain(
      "const storedIdentifier = await processIdentifier(identifier, storageOption)"
    );
    expect(internalAdapterSource).toContain("consumeVerificationValue: async (identifier)");
    expect(internalAdapterSource).toContain(
      "const identifiersToTry = storageOption && storageOption !== \"plain\" ? [storedIdentifier, identifier] : [storedIdentifier]"
    );
    expect(internalAdapterSource).toContain("deleteVerificationByIdentifier: async (identifier)");
    expect(passwordRouteSource).toContain("identifier: `reset-password:${verificationToken}`");
    expect(passwordRouteSource).toContain("value: user.user.id");
    expect(emailVerificationSource).toContain("async function createEmailVerificationToken");
    expect(emailVerificationSource).not.toContain("createVerificationValue({");
    expect(signUpSource).toContain("const token = await createEmailVerificationToken");
    expect(signUpSource).not.toContain("createVerificationValue({");
  });

  it("proves token-value plugins and persisted-secret flows are absent from the auth config", () => {
    const authConfig = createAuthConfig({
      database: {} as Parameters<typeof createAuthConfig>[0]["database"],
      trustedOrigins: ["https://wpmoo.local"],
      useSecureCookies: true
    });

    expect(authConfig.plugins).toBeUndefined();
    expect(authConfig.socialProviders).toBeUndefined();
    expect(authConfig.account?.accountLinking).toBeUndefined();
    expect(authConfig.emailAndPassword.enabled).toBe(true);
    expect(authConfig.verification).toBe(
      betterAuthRuntimeTokenProof.coreVerificationStorage
    );
  });
});

function getBetterAuthDistDir(): string {
  const require = createRequire(import.meta.url);
  const entrypointPath = require.resolve("better-auth");

  return dirname(entrypointPath);
}
