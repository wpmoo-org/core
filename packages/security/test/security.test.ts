import { describe, expect, it } from "vitest";
import {
  ENCRYPTION_ALGORITHM,
  EncryptionUnavailableError,
  constantTimeEqual,
  createEncryptionHelper,
  createSecurityHeaders,
  hashToken,
  verifyTokenHash
} from "../src/index.js";

describe("@wpmoo/security", () => {
  it("compares strings and byte arrays without throwing on length mismatch", () => {
    expect(constantTimeEqual("bootstrap-token", "bootstrap-token")).toBe(true);
    expect(constantTimeEqual("bootstrap-token", "bootstrap-taken")).toBe(false);
    expect(constantTimeEqual("bootstrap-token", "short")).toBe(false);
    expect(
      constantTimeEqual(
        new Uint8Array([1, 2, 3]),
        new Uint8Array([1, 2, 3])
      )
    ).toBe(true);
  });

  it("hashes tokens with a deterministic one-way SHA-256 helper", () => {
    const tokenHash = hashToken("raw bearer token");

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken("raw bearer token"));
    expect(tokenHash).not.toBe("raw bearer token");
    expect(verifyTokenHash("raw bearer token", tokenHash)).toBe(true);
    expect(verifyTokenHash("wrong token", tokenHash)).toBe(false);
  });

  it("encrypts and decrypts secrets with a key-versioned envelope", () => {
    const helper = createEncryptionHelper({
      appEncryptionKey: Buffer.alloc(32, 7).toString("base64url"),
      environment: "development",
      keyVersion: "local-dev"
    });
    const envelope = helper.encryptSecret("secret");

    expect(helper.algorithm).toBe(ENCRYPTION_ALGORITHM);
    expect(helper.keyVersion).toBe("local-dev");
    expect(envelope).toMatchObject({
      algorithm: ENCRYPTION_ALGORITHM,
      keyVersion: "local-dev",
      version: 1
    });
    expect(envelope.ciphertext).not.toBe("secret");
    expect(helper.decryptSecret(envelope)).toBe("secret");
  });

  it("requires APP_ENCRYPTION_KEY before production encryption helper use", () => {
    expect(() =>
      createEncryptionHelper({
        environment: "production",
        keyVersion: "v1"
      })
    ).toThrow(EncryptionUnavailableError);
  });

  it("requires a 32-byte encryption key before encrypting in any environment", () => {
    expect(() =>
      createEncryptionHelper({
        appEncryptionKey: Buffer.alloc(16, 7).toString("base64url"),
        environment: "development",
        keyVersion: "v1"
      })
    ).toThrow("APP_ENCRYPTION_KEY must decode to 32 bytes");
  });

  it("rejects unsupported encrypted secret envelope versions", () => {
    const helper = createEncryptionHelper({
      appEncryptionKey: Buffer.alloc(32, 7).toString("base64url"),
      environment: "development",
      keyVersion: "v1"
    });
    const envelope = helper.encryptSecret("secret");

    expect(() =>
      helper.decryptSecret({
        ...envelope,
        version: 2
      })
    ).toThrow("Unsupported encrypted secret version");
  });

  it("creates strict baseline production security headers", () => {
    const headers = createSecurityHeaders({
      cspNonce: "nonce-value",
      environment: "production"
    });

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain(
      "script-src 'self' 'nonce-nonce-value'"
    );
    expect(headers["Content-Security-Policy"]).not.toContain(
      "script-src 'self' 'unsafe-inline'"
    );
  });

  it("fails closed when production CSP is requested without a nonce", () => {
    expect(() => createSecurityHeaders({ environment: "production" })).toThrow(
      "Production security headers require a CSP nonce"
    );
  });
});
