import { describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "@wpmoo/rate-limit";
import {
  createBootstrapClaimAction,
  createLoginAction,
  type BootstrapTransactionClient
} from "../lib/phase2-actions.js";

function createLimiter(allowed: boolean): RateLimiter {
  return {
    async check(check) {
      if (allowed) {
        return {
          allowed: true,
          limit: check.limit,
          remaining: check.limit - 1,
          resetAt: new Date("2026-06-04T12:01:00.000Z"),
          retryAfterSeconds: null
        };
      }

      return {
        allowed: false,
        limit: check.limit,
        remaining: 0,
        resetAt: new Date("2026-06-04T12:01:00.000Z"),
        retryAfterSeconds: 60,
        reason: "limit_exceeded"
      };
    }
  };
}

describe("Phase 2 auth actions", () => {
  it("rate-limits login before returning the generic invalid credentials code", async () => {
    const login = createLoginAction({
      rateLimit: {
        limit: 3,
        windowSeconds: 60
      },
      rateLimiter: createLimiter(false)
    });

    await expect(
      login({
        clientIp: "127.0.0.1",
        email: "admin@example.test",
        password: "incorrect-password"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.rate_limited"
      },
      ok: false
    });
  });

  it("keeps login account enumeration-safe after rate-limit passes", async () => {
    const login = createLoginAction({
      rateLimit: {
        limit: 3,
        windowSeconds: 60
      },
      rateLimiter: createLimiter(true)
    });

    await expect(
      login({
        clientIp: "127.0.0.1",
        email: "missing@example.test",
        password: "incorrect-password"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.invalid_credentials"
      },
      ok: false
    });
  });

  it("claims first admin inside one transaction and writes audit before commit", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const transactionClient: BootstrapTransactionClient = {
      async query(sql, parameters) {
        queries.push({
          sql,
          parameters: parameters ?? []
        });

        if (sql.includes("INSERT INTO system_setting")) {
          return {
            rowCount: 1,
            rows: [{ key: "bootstrap_used" }]
          };
        }

        return {
          rowCount: 1,
          rows: []
        };
      }
    };
    const claim = createBootstrapClaimAction({
      adminBootstrapToken: "a".repeat(32),
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "user_1"
      }),
      rateLimit: {
        limit: 1,
        windowSeconds: 30
      },
      rateLimiter: createLimiter(true),
      transaction: async (callback) => callback(transactionClient)
    });

    await expect(
      claim({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        token: "a".repeat(32)
      })
    ).resolves.toEqual({
      data: {
        claimed: true
      },
      ok: true
    });

    const sql = queries.map((query) => query.sql).join("\n");
    const auditQuery = queries.find((query) =>
      query.sql.includes("INSERT INTO audit_event")
    );

    expect(sql).toContain("INSERT INTO system_setting");
    expect(sql).toContain("INSERT INTO user_role");
    expect(sql).toContain("INSERT INTO audit_event");
    expect(sql).toContain("UPDATE system_setting");
    expect(auditQuery?.parameters).toEqual([
      expect.any(String),
      "user_1",
      "system.admin.bootstrap",
      "user",
      "user_1",
      "critical",
      {
        roleId: "admin"
      },
      "127.0.0.1",
      expect.any(Date)
    ]);
  });

  it("does not mark bootstrap used when role assignment fails", async () => {
    const queries: string[] = [];
    const claim = createBootstrapClaimAction({
      adminBootstrapToken: "a".repeat(32),
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "user_1"
      }),
      rateLimit: {
        limit: 1,
        windowSeconds: 30
      },
      rateLimiter: createLimiter(true),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (sql.includes("INSERT INTO system_setting")) {
              return {
                rowCount: 1,
                rows: [{ key: "bootstrap_used" }]
              };
            }

            if (sql.includes("INSERT INTO user_role")) {
              throw new Error("role assignment failed");
            }

            return {
              rowCount: 1,
              rows: []
            };
          }
        })
    });

    await expect(
      claim({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        token: "a".repeat(32)
      })
    ).resolves.toEqual({
      error: {
        code: "system.unexpected"
      },
      ok: false
    });
    expect(queries.join("\n")).not.toContain("UPDATE system_setting");
  });

  it("rejects a second bootstrap claim when the DB lock already exists", async () => {
    const claim = createBootstrapClaimAction({
      adminBootstrapToken: "a".repeat(32),
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "user_1"
      }),
      rateLimit: {
        limit: 1,
        windowSeconds: 30
      },
      rateLimiter: createLimiter(true),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            if (sql.includes("INSERT INTO system_setting")) {
              return {
                rowCount: 0,
                rows: []
              };
            }

            return {
              rowCount: 1,
              rows: []
            };
          }
        })
    });

    await expect(
      claim({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        token: "a".repeat(32)
      })
    ).resolves.toEqual({
      error: {
        code: "bootstrap.invalid_or_used"
      },
      ok: false
    });
  });

  it("rejects same-length bootstrap token mismatches", async () => {
    const claim = createBootstrapClaimAction({
      adminBootstrapToken: "a".repeat(32),
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "user_1"
      }),
      rateLimit: {
        limit: 1,
        windowSeconds: 30
      },
      rateLimiter: createLimiter(true),
      transaction: async () => {
        throw new Error("transaction should not run");
      }
    });

    await expect(
      claim({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        token: "b".repeat(32)
      })
    ).resolves.toEqual({
      error: {
        code: "bootstrap.invalid_or_used"
      },
      ok: false
    });
  });
});
