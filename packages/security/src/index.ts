import { createHash, timingSafeEqual } from "node:crypto";

export type ConstantTimeComparable = string | Uint8Array;

export const TOKEN_HASH_ALGORITHM = "sha256";

export function constantTimeEqual(
  left: ConstantTimeComparable,
  right: ConstantTimeComparable
): boolean {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);
  const compareLength = Math.max(leftBuffer.length, rightBuffer.length);
  const paddedLeft = Buffer.alloc(compareLength);
  const paddedRight = Buffer.alloc(compareLength);

  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);

  return (
    timingSafeEqual(paddedLeft, paddedRight) &&
    leftBuffer.length === rightBuffer.length
  );
}

export function hashToken(token: ConstantTimeComparable): string {
  return createHash(TOKEN_HASH_ALGORITHM).update(toBuffer(token)).digest("hex");
}

export function verifyTokenHash(
  token: ConstantTimeComparable,
  expectedHash: string
): boolean {
  return constantTimeEqual(hashToken(token), expectedHash.toLowerCase());
}

export const ENCRYPTION_ALGORITHM = "aes-256-gcm";
export const ENCRYPTED_SECRET_VERSION = 1;

export type RuntimeEnvironment = "development" | "production" | "test";

export type EncryptedSecretEnvelope = Readonly<{
  algorithm: typeof ENCRYPTION_ALGORITHM;
  ciphertext: string;
  keyVersion: string;
  nonce: string;
  tag: string;
  version: typeof ENCRYPTED_SECRET_VERSION;
}>;

export class EncryptionUnavailableError extends Error {
  readonly code = "security.encryption_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "EncryptionUnavailableError";
  }
}

export type EncryptionHelperOptions = Readonly<{
  appEncryptionKey?: string;
  environment?: RuntimeEnvironment;
  keyVersion?: string;
}>;

export type EncryptionHelper = Readonly<{
  algorithm: typeof ENCRYPTION_ALGORITHM;
  decryptSecret: (envelope: EncryptedSecretEnvelope) => never;
  encryptSecret: (plaintext: ConstantTimeComparable) => never;
  keyVersion: string;
}>;

export function requireAppEncryptionKey(
  options: EncryptionHelperOptions
): string | undefined {
  const environment = options.environment ?? "development";
  const key = options.appEncryptionKey?.trim();

  if (environment === "production" && !key) {
    throw new EncryptionUnavailableError(
      "APP_ENCRYPTION_KEY is required before encrypted secret persistence can run in production."
    );
  }

  return key;
}

export function createEncryptionHelper(
  options: EncryptionHelperOptions = {}
): EncryptionHelper {
  requireAppEncryptionKey(options);

  return {
    algorithm: ENCRYPTION_ALGORITHM,
    decryptSecret(envelope) {
      void envelope;
      throw new EncryptionUnavailableError(
        "Encrypted secret persistence is not implemented in Phase 1."
      );
    },
    encryptSecret(plaintext) {
      void plaintext;
      throw new EncryptionUnavailableError(
        "Encrypted secret persistence is not implemented in Phase 1."
      );
    },
    keyVersion: options.keyVersion ?? "default"
  };
}

export type SecurityHeadersOptions = Readonly<{
  cspNonce?: string;
  environment?: RuntimeEnvironment;
  paymentFrameOrigins?: readonly string[];
  paymentScriptOrigins?: readonly string[];
  storageOrigins?: readonly string[];
}>;

export function createSecurityHeaders(
  options: SecurityHeadersOptions = {}
): Record<string, string> {
  const environment = options.environment ?? "development";
  const contentSecurityPolicy = createContentSecurityPolicy(options, environment);
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy,
    "Permissions-Policy": [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()"
    ].join(", "),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  if (environment === "production") {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  }

  return headers;
}

function toBuffer(value: ConstantTimeComparable): Buffer {
  return typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
}

function createContentSecurityPolicy(
  options: SecurityHeadersOptions,
  environment: RuntimeEnvironment
): string {
  const storageOrigins = options.storageOrigins ?? [];
  const paymentScriptOrigins = options.paymentScriptOrigins ?? [];
  const paymentFrameOrigins = options.paymentFrameOrigins ?? [];
  const scriptSrc =
    environment === "production"
      ? ["'self'", createProductionNonceSource(options.cspNonce), ...paymentScriptOrigins]
      : ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...paymentScriptOrigins];
  const frameSrc =
    paymentFrameOrigins.length > 0 ? ["'self'", ...paymentFrameOrigins] : ["'none'"];
  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["img-src", "'self'", "data:", "blob:", ...storageOrigins],
    ["font-src", "'self'", "data:"],
    ["connect-src", "'self'", ...storageOrigins],
    ["script-src", ...scriptSrc],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["form-action", "'self'"],
    ["frame-src", ...frameSrc]
  ];

  if (environment === "production") {
    directives.push(["upgrade-insecure-requests"]);
  }

  return directives.map((directive) => directive.join(" ")).join("; ");
}

function createProductionNonceSource(nonce: string | undefined): string {
  if (!nonce) {
    throw new Error("Production security headers require a CSP nonce.");
  }

  if (!/^[A-Za-z0-9+/_=-]+$/.test(nonce)) {
    throw new Error("CSP nonce may not contain whitespace or directive separators.");
  }

  return `'nonce-${nonce}'`;
}
