import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createRateLimitConfig,
  createPostgresRateLimiter,
  createNoopRateLimiter,
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
