import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type RateLimitScope =
  | "auth.login"
  | "auth.bootstrap"
  | "auth.password_reset"
  | "auth.invite_accept"
  | (string & {});

export type RateLimitSubject = Readonly<
  | {
      type: "ip";
      value: string;
    }
  | {
      type: "emailHash";
      value: string;
    }
  | {
      type: "user";
      value: string;
    }
>;

export type RateLimitProviderKind = "postgres" | "none";

export type RateLimitConfig = Readonly<{
  provider: RateLimitProviderKind;
  windowSeconds: number;
  maxRequests: number;
}>;

export type RateLimitCheck = Readonly<{
  scope: RateLimitScope;
  subject: RateLimitSubject;
  limit: number;
  windowSeconds: number;
  now?: Date;
}>;

export type RateLimitAllowedResult = Readonly<{
  allowed: true;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: null;
}>;

export type RateLimitDeniedReason =
  | "limit_exceeded"
  | "store_unavailable";

export type RateLimitDeniedResult = Readonly<{
  allowed: false;
  limit: number;
  remaining: 0;
  resetAt: Date;
  retryAfterSeconds: number;
  reason: RateLimitDeniedReason;
}>;

export type RateLimitResult =
  | RateLimitAllowedResult
  | RateLimitDeniedResult;

export interface RateLimiter {
  check(check: RateLimitCheck): Promise<RateLimitResult>;
}

export type RateLimitIpSubjectInput = Readonly<{
  headers?: Readonly<Record<string, string | undefined>>;
  remoteAddress?: string;
  trustForwardedHeaders?: boolean;
}>;

export type CircuitBreakerRateLimiterOptions = Readonly<{
  cooldownMs: number;
  failureThreshold: number;
  limiter: RateLimiter;
  now?: () => Date;
}>;

export function createRateLimitConfig(
  runtimeEnv: Record<string, string | undefined>
): RateLimitConfig {
  const provider = parseRateLimitProvider(runtimeEnv.RATE_LIMIT_PROVIDER);

  if (runtimeEnv.NODE_ENV === "production" && provider === "none") {
    throw new Error("RATE_LIMIT_PROVIDER=none is forbidden in production.");
  }

  return {
    provider,
    windowSeconds: parsePositiveInteger(
      runtimeEnv.RATE_LIMIT_WINDOW_SECONDS,
      "RATE_LIMIT_WINDOW_SECONDS",
      60
    ),
    maxRequests: parsePositiveInteger(
      runtimeEnv.RATE_LIMIT_MAX_REQUESTS,
      "RATE_LIMIT_MAX_REQUESTS",
      20
    )
  };
}

export type RateLimitQueryResult = Readonly<{
  rowCount: number | null;
  rows: readonly Record<string, unknown>[];
}>;

export type RateLimitQueryClient = Readonly<{
  query(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<RateLimitQueryResult>;
}>;

export type PostgresRateLimiterOptions = Readonly<{
  client: RateLimitQueryClient;
}>;

export class NoopRateLimiter implements RateLimiter {
  async check(check: RateLimitCheck): Promise<RateLimitAllowedResult> {
    const now = check.now ?? new Date();

    return {
      allowed: true,
      limit: check.limit,
      remaining: check.limit,
      resetAt: new Date(now.getTime() + check.windowSeconds * 1000),
      retryAfterSeconds: null
    };
  }
}

export class PostgresRateLimiter implements RateLimiter {
  readonly #client: RateLimitQueryClient;

  constructor(options: PostgresRateLimiterOptions) {
    this.#client = options.client;
  }

  async check(check: RateLimitCheck): Promise<RateLimitResult> {
    const now = check.now ?? new Date();
    const windowStart = getWindowStart(now, check.windowSeconds);
    const resetAt = new Date(windowStart.getTime() + check.windowSeconds * 1000);

    try {
      const result = await this.#client.query(
        `
          INSERT INTO rate_limit_bucket (
            scope,
            identifier_hash,
            window_start,
            window_seconds,
            max_attempts,
            attempts,
            expires_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 1, $6, now())
          ON CONFLICT (scope, identifier_hash, window_start) DO UPDATE SET
            attempts = rate_limit_bucket.attempts + 1,
            window_seconds = EXCLUDED.window_seconds,
            max_attempts = EXCLUDED.max_attempts,
            expires_at = EXCLUDED.expires_at,
            updated_at = now()
          RETURNING attempts, expires_at
        `,
        [
          check.scope,
          hashRateLimitSubject(check.subject),
          windowStart,
          check.windowSeconds,
          check.limit,
          resetAt
        ]
      );
      const row = result.rows[0];
      const attempts = readInteger(row?.attempts);
      const actualResetAt = readDate(row?.expires_at) ?? resetAt;

      if (attempts <= check.limit) {
        return {
          allowed: true,
          limit: check.limit,
          remaining: Math.max(check.limit - attempts, 0),
          resetAt: actualResetAt,
          retryAfterSeconds: null
        };
      }

      return {
        allowed: false,
        limit: check.limit,
        remaining: 0,
        resetAt: actualResetAt,
        retryAfterSeconds: secondsUntil(now, actualResetAt),
        reason: "limit_exceeded"
      };
    } catch {
      return {
        allowed: false,
        limit: check.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: check.windowSeconds,
        reason: "store_unavailable"
      };
    }
  }
}

export class CircuitBreakerRateLimiter implements RateLimiter {
  readonly #cooldownMs: number;
  readonly #failureThreshold: number;
  readonly #limiter: RateLimiter;
  readonly #now: () => Date;
  #consecutiveStoreFailures = 0;
  #openedUntil: Date | null = null;

  constructor(options: CircuitBreakerRateLimiterOptions) {
    this.#cooldownMs = options.cooldownMs;
    this.#failureThreshold = options.failureThreshold;
    this.#limiter = options.limiter;
    this.#now = options.now ?? (() => new Date());
  }

  async check(check: RateLimitCheck): Promise<RateLimitResult> {
    const now = check.now ?? this.#now();

    if (this.#openedUntil !== null && this.#openedUntil.getTime() > now.getTime()) {
      return createStoreUnavailableResult(check, now);
    }

    const result = await this.#limiter.check(check);

    if (result.allowed || result.reason !== "store_unavailable") {
      this.#consecutiveStoreFailures = 0;
      this.#openedUntil = null;

      return result;
    }

    this.#consecutiveStoreFailures += 1;

    if (this.#consecutiveStoreFailures >= this.#failureThreshold) {
      this.#openedUntil = new Date(now.getTime() + this.#cooldownMs);
    }

    return result;
  }
}

export function createNoopRateLimiter(): RateLimiter {
  return new NoopRateLimiter();
}

export function createPostgresRateLimiter(
  options: PostgresRateLimiterOptions
): RateLimiter {
  return new PostgresRateLimiter(options);
}

export function createCircuitBreakerRateLimiter(
  options: CircuitBreakerRateLimiterOptions
): RateLimiter {
  return new CircuitBreakerRateLimiter(options);
}

export async function deleteExpiredRateLimitBuckets(
  client: RateLimitQueryClient,
  now: Date = new Date()
): Promise<number> {
  const result = await client.query(
    `
      DELETE FROM rate_limit_bucket
      WHERE expires_at < $1
    `,
    [now]
  );

  return result.rowCount ?? 0;
}

export function createRateLimitIpSubject(
  input: RateLimitIpSubjectInput
): RateLimitSubject {
  return {
    type: "ip",
    value: normalizeIpAddress(selectIpAddress(input))
  };
}

export function hashRateLimitSubject(subject: RateLimitSubject): string {
  return createHash("sha256")
    .update(`${subject.type}:${normalizeSubjectValue(subject)}`, "utf8")
    .digest("base64url");
}

function normalizeSubjectValue(subject: RateLimitSubject): string {
  if (subject.type === "ip") {
    return normalizeIpAddress(subject.value);
  }

  return subject.value.trim().toLowerCase();
}

function selectIpAddress(input: RateLimitIpSubjectInput): string {
  if (input.trustForwardedHeaders === true) {
    const forwardedFor = readHeader(input.headers, "x-forwarded-for");
    const realIp = readHeader(input.headers, "x-real-ip");
    const firstForwardedIp = forwardedFor?.split(",").at(0)?.trim();

    if (firstForwardedIp !== undefined && firstForwardedIp.length > 0) {
      return firstForwardedIp;
    }

    if (realIp !== undefined && realIp.trim().length > 0) {
      return realIp;
    }
  }

  if (input.remoteAddress === undefined || input.remoteAddress.trim().length === 0) {
    throw new Error("A remote IP address is required for auth rate limiting.");
  }

  return input.remoteAddress;
}

function readHeader(
  headers: Readonly<Record<string, string | undefined>> | undefined,
  name: string
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const direct = headers[name];

  if (direct !== undefined) {
    return direct;
  }

  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name
  );

  return found?.[1];
}

function normalizeIpAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  const withoutZone = withoutBrackets.split("%", 1)[0] ?? withoutBrackets;
  const mappedIpv4 = withoutZone.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const mappedIpv4Address = mappedIpv4?.[1];

  if (mappedIpv4Address !== undefined && isIP(mappedIpv4Address) === 4) {
    return mappedIpv4Address;
  }

  if (isIP(withoutZone) === 4) {
    return withoutZone;
  }

  if (isIP(withoutZone) === 6) {
    return normalizeIpv6(withoutZone);
  }

  throw new Error("Invalid IP address for rate-limit subject.");
}

function normalizeIpv6(value: string): string {
  const [left = "", right = ""] = value.split("::", 2);
  const leftParts = left.length === 0 ? [] : left.split(":");
  const rightParts = right.length === 0 ? [] : right.split(":");
  const zeroFill = Array.from(
    { length: Math.max(8 - leftParts.length - rightParts.length, 0) },
    () => "0"
  );
  const parts = [...leftParts, ...zeroFill, ...rightParts].map((part) =>
    Number.parseInt(part, 16).toString(16)
  );
  const zeroRun = longestZeroRun(parts);

  if (zeroRun.length < 2) {
    return parts.join(":");
  }

  const before = parts.slice(0, zeroRun.start).join(":");
  const after = parts.slice(zeroRun.start + zeroRun.length).join(":");

  if (before.length === 0 && after.length === 0) {
    return "::";
  }

  if (before.length === 0) {
    return `::${after}`;
  }

  if (after.length === 0) {
    return `${before}::`;
  }

  return `${before}::${after}`;
}

function longestZeroRun(parts: readonly string[]): Readonly<{
  length: number;
  start: number;
}> {
  let best = { length: 0, start: -1 };
  let current = { length: 0, start: -1 };

  parts.forEach((part, index) => {
    if (part === "0") {
      if (current.length === 0) {
        current = { length: 1, start: index };
      } else {
        current = { ...current, length: current.length + 1 };
      }

      if (current.length > best.length) {
        best = current;
      }

      return;
    }

    current = { length: 0, start: -1 };
  });

  return best;
}

function parseRateLimitProvider(
  value: string | undefined
): RateLimitProviderKind {
  if (value === undefined || value.length === 0) {
    return "postgres";
  }

  if (value === "postgres" || value === "none") {
    return value;
  }

  throw new Error("RATE_LIMIT_PROVIDER must be postgres or none.");
}

function parsePositiveInteger(
  value: string | undefined,
  name: string,
  defaultValue: number
): number {
  if (value === undefined || value.length === 0) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function getWindowStart(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;

  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function secondsUntil(now: Date, resetAt: Date): number {
  return Math.max(Math.ceil((resetAt.getTime() - now.getTime()) / 1000), 0);
}

function readInteger(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }

  return 0;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    return new Date(value);
  }

  return null;
}

function createStoreUnavailableResult(
  check: RateLimitCheck,
  now: Date
): RateLimitDeniedResult {
  return {
    allowed: false,
    limit: check.limit,
    remaining: 0,
    resetAt: new Date(now.getTime() + check.windowSeconds * 1000),
    retryAfterSeconds: check.windowSeconds,
    reason: "store_unavailable"
  };
}
