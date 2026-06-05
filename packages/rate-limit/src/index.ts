import { createHash } from "node:crypto";

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

export function createNoopRateLimiter(): RateLimiter {
  return new NoopRateLimiter();
}

export function createPostgresRateLimiter(
  options: PostgresRateLimiterOptions
): RateLimiter {
  return new PostgresRateLimiter(options);
}

export function hashRateLimitSubject(subject: RateLimitSubject): string {
  return createHash("sha256")
    .update(`${subject.type}:${normalizeSubjectValue(subject)}`, "utf8")
    .digest("base64url");
}

function normalizeSubjectValue(subject: RateLimitSubject): string {
  return subject.value.trim().toLowerCase();
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
