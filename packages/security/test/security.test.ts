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

  it("defines an encryption envelope skeleton without pretending to encrypt yet", () => {
    const helper = createEncryptionHelper({
      environment: "development",
      keyVersion: "local-dev"
    });

    expect(helper.algorithm).toBe(ENCRYPTION_ALGORITHM);
    expect(helper.keyVersion).toBe("local-dev");
    expect(() => helper.encryptSecret("secret")).toThrow(EncryptionUnavailableError);
    expect(() =>
      helper.decryptSecret({
        algorithm: ENCRYPTION_ALGORITHM,
        ciphertext: "ciphertext",
        keyVersion: "local-dev",
        nonce: "nonce",
        tag: "tag",
        version: 1
      })
    ).toThrow(EncryptionUnavailableError);
  });

  it("requires APP_ENCRYPTION_KEY before production encryption helper use", () => {
    expect(() =>
      createEncryptionHelper({
        environment: "production",
        keyVersion: "v1"
      })
    ).toThrow(EncryptionUnavailableError);
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
