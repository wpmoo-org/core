import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCircuitBreakerRateLimiter,
  createRateLimitIpSubject,
  createRateLimitConfig,
  createPostgresRateLimiter,
  createNoopRateLimiter,
  deleteExpiredRateLimitBuckets,
  hashRateLimitSubject,
  NoopRateLimiter,
  type RateLimitCheck,
  type RateLimitQueryClient,
  type RateLimiter,
  type RateLimitResult
} from "../src/index.js";

function createQueryClient(rows: Array<Record<string, unknown>>): {
  client: RateLimitQueryClient;
  queries: Array<{ sql: string; parameters: readonly unknown[] }>;
} {
  const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  const client: RateLimitQueryClient = {
    async query(sql, parameters) {
      queries.push({
        sql,
        parameters: parameters ?? []
      });

      const row = rows.shift();

      return {
        rowCount: row === undefined ? 0 : 1,
        rows: row === undefined ? [] : [row]
      };
    }
  };

  return { client, queries };
}

describe("@wpmoo/rate-limit", () => {
  it("defaults to the Postgres provider with auth-safe limits", () => {
    expect(createRateLimitConfig({ NODE_ENV: "test" })).toEqual({
      provider: "postgres",
      windowSeconds: 60,
      maxRequests: 20
    });
  });

  it("allows the no-op provider only outside production", () => {
    expect(
      createRateLimitConfig({
        NODE_ENV: "test",
        RATE_LIMIT_PROVIDER: "none"
      }).provider
    ).toBe("none");
    expect(() =>
      createRateLimitConfig({
        NODE_ENV: "production",
        RATE_LIMIT_PROVIDER: "none"
      })
    ).toThrow("RATE_LIMIT_PROVIDER=none is forbidden in production.");
  });

  it("rejects invalid numeric limits", () => {
    expect(() =>
      createRateLimitConfig({
        NODE_ENV: "test",
        RATE_LIMIT_MAX_REQUESTS: "0"
      })
    ).toThrow("RATE_LIMIT_MAX_REQUESTS must be a positive integer.");
    expect(() =>
      createRateLimitConfig({
        NODE_ENV: "test",
        RATE_LIMIT_WINDOW_SECONDS: "0"
      })
    ).toThrow("RATE_LIMIT_WINDOW_SECONDS must be a positive integer.");
  });

  it("allows every check with the local no-op implementation", async () => {
    const limiter: RateLimiter = new NoopRateLimiter();
    const now = new Date("2026-06-04T12:00:00.000Z");
    const check = {
      scope: "auth.login",
      subject: {
        type: "ip",
        value: "127.0.0.1"
      },
      limit: 3,
      windowSeconds: 60,
      now
    } satisfies RateLimitCheck;

    const result: RateLimitResult = await limiter.check(check);

    expect(result).toEqual({
      allowed: true,
      limit: 3,
      remaining: 3,
      resetAt: new Date("2026-06-04T12:01:00.000Z"),
      retryAfterSeconds: null
    });
  });

  it("exposes a no-op factory for composition roots and tests", async () => {
    const result = await createNoopRateLimiter().check({
      scope: "auth.bootstrap",
      subject: {
        type: "emailHash",
        value: "already-hashed-email"
      },
      limit: 1,
      windowSeconds: 30,
      now: new Date("2026-06-04T12:00:00.000Z")
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it("hashes rate-limit subjects before persistence", () => {
    expect(hashRateLimitSubject({ type: "ip", value: "127.0.0.1" })).toMatch(
      /^[A-Za-z0-9_-]{43}$/
    );
    expect(hashRateLimitSubject({ type: "ip", value: "127.0.0.1" })).not.toContain(
      "127.0.0.1"
    );
    expect(hashRateLimitSubject({ type: "emailHash", value: "abc" })).not.toBe(
      hashRateLimitSubject({ type: "user", value: "abc" })
    );
    expect(
      hashRateLimitSubject({
        type: "ip",
        value: "2001:0DB8:0000:0000:0000:0000:0000:0001"
      })
    ).toBe(hashRateLimitSubject({ type: "ip", value: "2001:db8::1" }));
    expect(
      hashRateLimitSubject({ type: "ip", value: "::ffff:192.0.2.10" })
    ).toBe(hashRateLimitSubject({ type: "ip", value: "192.0.2.10" }));
  });

  it("uses forwarded headers only when trusted by the composition root", () => {
    expect(
      createRateLimitIpSubject({
        headers: {
          "X-Forwarded-For": "203.0.113.10, 10.0.0.1",
          "x-real-ip": "198.51.100.20"
        },
        remoteAddress: "192.0.2.30",
        trustForwardedHeaders: true
      })
    ).toEqual({
      type: "ip",
      value: "203.0.113.10"
    });
    expect(
      createRateLimitIpSubject({
        headers: {
          "x-forwarded-for": "203.0.113.10"
        },
        remoteAddress: "192.0.2.30",
        trustForwardedHeaders: false
      })
    ).toEqual({
      type: "ip",
      value: "192.0.2.30"
    });
  });

  it("normalizes IPv6 subjects before rate-limit persistence", () => {
    expect(
      createRateLimitIpSubject({
        remoteAddress: "[2001:0DB8:0000:0000:0000:0000:0000:0001]"
      })
    ).toEqual({
      type: "ip",
      value: "2001:db8::1"
    });
    expect(() =>
      createRateLimitIpSubject({
        headers: {
          "x-forwarded-for": "not-an-ip"
        },
        remoteAddress: "192.0.2.30",
        trustForwardedHeaders: true
      })
    ).toThrow("Invalid IP address for rate-limit subject.");
    expect(() =>
      createRateLimitIpSubject({
        headers: {
          "x-forwarded-for": "unknown"
        },
        remoteAddress: "192.0.2.30",
        trustForwardedHeaders: true
      })
    ).toThrow("Invalid IP address for rate-limit subject.");
  });

  it("uses an atomic per-bucket Postgres upsert", async () => {
    const { client, queries } = createQueryClient([
      {
        attempts: 1,
        expires_at: new Date("2026-06-04T12:01:00.000Z")
      }
    ]);
    const limiter = createPostgresRateLimiter({ client });

    const result = await limiter.check({
      scope: "auth.login",
      subject: {
        type: "ip",
        value: "127.0.0.1"
      },
      limit: 3,
      windowSeconds: 60,
      now: new Date("2026-06-04T12:00:30.000Z")
    });

    expect(result).toEqual({
      allowed: true,
      limit: 3,
      remaining: 2,
      resetAt: new Date("2026-06-04T12:01:00.000Z"),
      retryAfterSeconds: null
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain(
      "ON CONFLICT (scope, identifier_hash, window_start) DO UPDATE"
    );
    expect(queries[0]?.parameters[0]).toBe("auth.login");
    expect(queries[0]?.parameters[1]).not.toBe("127.0.0.1");
  });

  it("keeps concurrent bucket checks on the same atomic upsert shape", async () => {
    const { client, queries } = createQueryClient([
      {
        attempts: 1,
        expires_at: new Date("2026-06-04T12:01:00.000Z")
      },
      {
        attempts: 2,
        expires_at: new Date("2026-06-04T12:01:00.000Z")
      },
      {
        attempts: 3,
        expires_at: new Date("2026-06-04T12:01:00.000Z")
      }
    ]);
    const limiter = createPostgresRateLimiter({ client });
    const baseCheck = {
      scope: "auth.login",
      subject: {
        type: "ip",
        value: "2001:0db8:0000:0000:0000:0000:0000:0001"
      },
      limit: 3,
      windowSeconds: 60,
      now: new Date("2026-06-04T12:00:30.000Z")
    } satisfies RateLimitCheck;

    await Promise.all([limiter.check(baseCheck), limiter.check(baseCheck), limiter.check(baseCheck)]);

    expect(queries).toHaveLength(3);
    expect(
      queries.every((query) =>
        query.sql.includes(
          "ON CONFLICT (scope, identifier_hash, window_start) DO UPDATE"
        )
      )
    ).toBe(true);
    expect(new Set(queries.map((query) => query.parameters[1])).size).toBe(1);
  });

  it("denies when the Postgres bucket exceeds the limit", async () => {
    const { client } = createQueryClient([
      {
        attempts: 4,
        expires_at: new Date("2026-06-04T12:01:00.000Z")
      }
    ]);
    const limiter = createPostgresRateLimiter({ client });

    await expect(
      limiter.check({
        scope: "auth.login",
        subject: {
          type: "ip",
          value: "127.0.0.1"
        },
        limit: 3,
        windowSeconds: 60,
        now: new Date("2026-06-04T12:00:45.000Z")
      })
    ).resolves.toEqual({
      allowed: false,
      limit: 3,
      remaining: 0,
      resetAt: new Date("2026-06-04T12:01:00.000Z"),
      retryAfterSeconds: 15,
      reason: "limit_exceeded"
    });
  });

  it("fails closed when the Postgres store is unavailable", async () => {
    const client: RateLimitQueryClient = {
      async query() {
        throw new Error("database unavailable");
      }
    };
    const limiter = createPostgresRateLimiter({ client });

    await expect(
      limiter.check({
        scope: "auth.bootstrap",
        subject: {
          type: "ip",
          value: "127.0.0.1"
        },
        limit: 1,
        windowSeconds: 30,
        now: new Date("2026-06-04T12:00:00.000Z")
      })
    ).resolves.toEqual({
      allowed: false,
      limit: 1,
      remaining: 0,
      resetAt: new Date("2026-06-04T12:00:30.000Z"),
      retryAfterSeconds: 30,
      reason: "store_unavailable"
    });
  });

  it("opens a fail-closed circuit after repeated store failures", async () => {
    let calls = 0;
    const limiter: RateLimiter = {
      async check(check) {
        calls += 1;

        return {
          allowed: false,
          limit: check.limit,
          remaining: 0,
          resetAt: new Date("2026-06-04T12:00:30.000Z"),
          retryAfterSeconds: 30,
          reason: "store_unavailable"
        };
      }
    };
    const breaker = createCircuitBreakerRateLimiter({
      cooldownMs: 5_000,
      failureThreshold: 2,
      limiter
    });
    const check = {
      scope: "auth.bootstrap",
      subject: {
        type: "ip",
        value: "127.0.0.1"
      },
      limit: 1,
      windowSeconds: 30,
      now: new Date("2026-06-04T12:00:00.000Z")
    } satisfies RateLimitCheck;

    await expect(breaker.check(check)).resolves.toMatchObject({
      allowed: false,
      reason: "store_unavailable"
    });
    await expect(breaker.check(check)).resolves.toMatchObject({
      allowed: false,
      reason: "store_unavailable"
    });
    await expect(
      breaker.check({
        ...check,
        now: new Date("2026-06-04T12:00:01.000Z")
      })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "store_unavailable"
    });
    expect(calls).toBe(2);
  });

  it("recovers the circuit breaker after cooldown when the limiter is healthy", async () => {
    let calls = 0;
    const limiter: RateLimiter = {
      async check(check) {
        calls += 1;

        if (calls <= 2) {
          return {
            allowed: false,
            limit: check.limit,
            remaining: 0,
            resetAt: new Date("2026-06-04T12:00:30.000Z"),
            retryAfterSeconds: 30,
            reason: "store_unavailable"
          };
        }

        return {
          allowed: true,
          limit: check.limit,
          remaining: check.limit - 1,
          resetAt: new Date("2026-06-04T12:01:00.000Z"),
          retryAfterSeconds: null
        };
      }
    };
    const breaker = createCircuitBreakerRateLimiter({
      cooldownMs: 5_000,
      failureThreshold: 2,
      limiter
    });
    const check = {
      scope: "auth.bootstrap",
      subject: {
        type: "ip",
        value: "127.0.0.1"
      },
      limit: 1,
      windowSeconds: 30,
      now: new Date("2026-06-04T12:00:00.000Z")
    } satisfies RateLimitCheck;

    await breaker.check(check);
    await breaker.check(check);
    await expect(
      breaker.check({
        ...check,
        now: new Date("2026-06-04T12:00:06.000Z")
      })
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0
    });
    expect(calls).toBe(3);
  });

  it("deletes expired Postgres buckets for the cleanup job", async () => {
    const { client, queries } = createQueryClient([]);

    await expect(
      deleteExpiredRateLimitBuckets(client, new Date("2026-06-04T12:00:00.000Z"))
    ).resolves.toBe(0);
    expect(queries[0]?.sql).toContain("DELETE FROM rate_limit_bucket");
    expect(queries[0]?.sql).toContain("WHERE expires_at < $1");
    expect(queries[0]?.parameters).toEqual([
      new Date("2026-06-04T12:00:00.000Z")
    ]);
  });

  it("records no Redis or Upstash dependency in the package manifest", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const dependencyNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies
    });

    expect(dependencyNames).not.toContain("redis");
    expect(dependencyNames).not.toContain("@upstash/redis");
    expect(dependencyNames.filter((name) => /redis|upstash/i.test(name))).toEqual(
      []
    );
  });
});
