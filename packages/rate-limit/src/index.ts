export type RateLimitCheck = Readonly<{
  bucket: string;
  identifier: string;
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

export function createNoopRateLimiter(): RateLimiter {
  return new NoopRateLimiter();
}
