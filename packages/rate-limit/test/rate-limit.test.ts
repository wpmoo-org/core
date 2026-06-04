import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createNoopRateLimiter,
  NoopRateLimiter,
  type RateLimitCheck,
  type RateLimiter,
  type RateLimitResult
} from "../src/index.js";

describe("@wpmoo/rate-limit", () => {
  it("allows every check with the local no-op implementation", async () => {
    const limiter: RateLimiter = new NoopRateLimiter();
    const now = new Date("2026-06-04T12:00:00.000Z");
    const check = {
      bucket: "auth.login",
      identifier: "ip:127.0.0.1",
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
      bucket: "bootstrap.admin",
      identifier: "email:admin@example.test",
      limit: 1,
      windowSeconds: 30,
      now: new Date("2026-06-04T12:00:00.000Z")
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.retryAfterSeconds).toBeNull();
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
