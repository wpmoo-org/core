import { describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "@wpmoo/rate-limit";
import {
  createAssignRoleAction,
  createBootstrapClaimAction,
  createLoginAction,
  createRevokeRoleAction,
  createSaveRolePermissionsAction,
  createSetUserPermissionOverrideAction,
  type BootstrapTransactionClient
} from "../lib/phase2-actions.js";

const normalizeQuery = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();
const queryContains = (sql: string, fragment: string) =>
  normalizeQuery(sql).includes(fragment);

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
    const rateLimitSubjects: string[] = [];
    const login = createLoginAction({
      rateLimit: {
        limit: 3,
        windowSeconds: 60
      },
      rateLimiter: {
        async check(check) {
          rateLimitSubjects.push(`${check.subject.type}:${check.subject.value}`);

          return {
            allowed: true,
            limit: check.limit,
            remaining: check.limit - 1,
            resetAt: new Date("2026-06-04T12:01:00.000Z"),
            retryAfterSeconds: null
          };
        }
      }
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
    await expect(
      login({
        clientIp: "127.0.0.1",
        email: "admin@example.test",
        password: "incorrect-password"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.invalid_credentials"
      },
      ok: false
    });
    expect(rateLimitSubjects).toEqual(["ip:127.0.0.1", "ip:127.0.0.1"]);
  });

  it("claims first admin inside one transaction and writes audit before commit", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const transactionClient: BootstrapTransactionClient = {
      async query(sql, parameters) {
        queries.push({
          sql,
          parameters: parameters ?? []
        });

        if (queryContains(sql, "insert into system_setting")) {
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
      queryContains(query.sql, "insert into audit_event")
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

            if (queryContains(sql, "insert into system_setting")) {
              return {
                rowCount: 1,
                rows: [{ key: "bootstrap_used" }]
              };
            }

            if (queryContains(sql, "insert into user_role")) {
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

  it("rolls back the transaction when bootstrap fails after writing audit", async () => {
    const queries: string[] = [];
    const committedStatements: string[] = [];
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
      transaction: async (callback) => {
        const transactionStatements: string[] = [];
        const result = await callback({
          async query(sql) {
            queries.push(sql);
            transactionStatements.push(sql);

            if (queryContains(sql, "insert into system_setting")) {
              return {
                rowCount: 1,
                rows: [{ key: "bootstrap_used" }]
              };
            }

            if (queryContains(sql, "update system_setting")) {
              throw new Error("commit marker failed");
            }

            return {
              rowCount: 1,
              rows: []
            };
          }
        });

        committedStatements.push(...transactionStatements);

        return result;
      }
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
    expect(queries.join("\n")).toContain("INSERT INTO audit_event");
    expect(committedStatements.join("\n")).not.toContain("INSERT INTO audit_event");
  });

  it("rejects a second bootstrap claim when the DB lock already exists", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
            if (queryContains(sql, "insert into system_setting")) {
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

    const result = await claim({
      clientIp: "127.0.0.1",
      csrfCookie: "csrf-cookie-secret",
      csrfToken: "csrf-cookie-secret",
      token: "a".repeat(32)
    });

    expect(result).toEqual({
      error: {
        code: "bootstrap.invalid_or_used"
      },
      ok: false
    });
    expect(JSON.stringify(result)).not.toContain("csrf-cookie-secret");
    expect(JSON.stringify(result)).not.toContain("a".repeat(32));
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleInfo.mockRestore();
    consoleWarn.mockRestore();
  });

  it("does not expose raw login credentials in invalid credential responses or logs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const login = createLoginAction({
      rateLimit: {
        limit: 3,
        windowSeconds: 60
      },
      rateLimiter: createLimiter(true)
    });

    const result = await login({
      clientIp: "127.0.0.1",
      email: "missing@example.test",
      password: "raw-password-secret"
    });

    expect(result).toEqual({
      error: {
        code: "auth.invalid_credentials"
      },
      ok: false
    });
    expect(JSON.stringify(result)).not.toContain("missing@example.test");
    expect(JSON.stringify(result)).not.toContain("raw-password-secret");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleInfo.mockRestore();
    consoleWarn.mockRestore();
  });

  it("keeps unknown-email and wrong-password login attempts on the same branch", async () => {
    const checks: Array<Readonly<{ scope: string; subject: string }>> = [];
    const login = createLoginAction({
      rateLimit: {
        limit: 3,
        windowSeconds: 60
      },
      rateLimiter: {
        async check(check) {
          checks.push({
            scope: check.scope,
            subject: `${check.subject.type}:${check.subject.value}`
          });

          return {
            allowed: true,
            limit: check.limit,
            remaining: check.limit - 1,
            resetAt: new Date("2026-06-04T12:01:00.000Z"),
            retryAfterSeconds: null
          };
        }
      }
    });

    const unknownEmailResult = await login({
      clientIp: "127.0.0.1",
      email: "missing@example.test",
      password: "incorrect-password"
    });
    const wrongPasswordResult = await login({
      clientIp: "127.0.0.1",
      email: "admin@example.test",
      password: "incorrect-password"
    });

    expect(unknownEmailResult).toEqual(wrongPasswordResult);
    expect(checks).toEqual([
      {
        scope: "auth.login",
        subject: "ip:127.0.0.1"
      },
      {
        scope: "auth.login",
        subject: "ip:127.0.0.1"
      }
    ]);
  });

  it("rejects same-length bootstrap token mismatches", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleInfo.mockRestore();
    consoleWarn.mockRestore();
  });
});

describe("Phase 2 admin role actions", () => {
  it("assigns a role and writes audit inside the same transaction", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const assignRole = createAssignRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql, parameters) {
            queries.push({ sql, parameters: parameters ?? [] });

            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
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
      assignRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "user_2"
      })
    ).resolves.toEqual({
      data: {
        assigned: true
      },
      ok: true
    });

    const sql = queries.map((query) => query.sql).join("\n");
    expect(sql).toContain("INSERT INTO user_role");
    expect(sql).toContain("INSERT INTO audit_event");
    expect(queries.find((query) => queryContains(query.sql, "insert into user_role"))?.parameters).toEqual([
      "user_2",
      "admin",
      "admin_1"
    ]);
    expect(
      queries.find((query) => queryContains(query.sql, "insert into audit_event"))?.parameters
    ).toEqual([
      expect.any(String),
      "admin_1",
      "rbac.role.grant",
      "user",
      "user_2",
      "high",
      { roleId: "admin" },
      "127.0.0.1",
      expect.any(Date)
    ]);
  });

  it("rejects assigning an archived role", async () => {
    const assignRole = createAssignRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1",
        permissions: new Set(["admin.users:update"])
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "archived" }]
              };
            }

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
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
      assignRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "user_2"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
  });

  it("rejects assigning a permission-manager role without actor override permission", async () => {
    const assignRole = createAssignRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1",
        permissions: new Set(["admin.users:update"])
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: true }]
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
      assignRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "user_2"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
  });

  it("does not audit an assign request when the role already exists", async () => {
    const queries: string[] = [];
    const assignRole = createAssignRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
              };
            }

            return {
              rowCount: 0,
              rows: []
            };
          }
        })
    });

    await expect(
      assignRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "user",
        targetUserId: "user_2"
      })
    ).resolves.toEqual({
      data: {
        assigned: false
      },
      ok: true
    });
    expect(queries.join("\n")).not.toContain("INSERT INTO audit_event");
  });

  it("serializes critical lock when assigning a permission-manager role", async () => {
    const queries: string[] = [];
    const assignRole = createAssignRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1",
        permissions: new Set(["admin.users:update", "admin.permissions:update"])
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: true }]
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
      assignRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "user_2"
      })
    ).resolves.toEqual({
      data: {
        assigned: true
      },
      ok: true
    });

    const sql = queries.join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("INSERT INTO user_role");
    expect(sql).toContain("INSERT INTO audit_event");
    expect(sql).toContain("role.stage = 'active'");
  });

  it("revoke role action enforces the last-admin guard before mutation and audit", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
              };
            }

            if (queryContains(sql, "count(*)")) {
              return {
                rowCount: 1,
                rows: [{ count: "1" }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "admin_1"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
    expect(queries.join("\n")).not.toContain("DELETE FROM user_role");
    expect(queries.join("\n")).not.toContain("INSERT INTO audit_event");
    expect(queries.join("\n")).toContain("pg_advisory_xact_lock");
    expect(queries.join("\n")).toContain("COUNT(*)");
    expect(
      queryContains(
        queries.join("\n"),
        "coalesce(user_lifecycle.status, 'active') = 'active'"
      )
    ).toBeTruthy();
  });

  it("rejects a permission-manager self-revoke even when another holder remains", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select exists")) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: true }]
              };
            }

            if (queryContains(sql, "select count(*)")) {
              return {
                rowCount: 1,
                rows: [{ count: "2" }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "user",
        targetUserId: "admin_1"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
    expect(queries.join("\n")).toContain("pg_advisory_xact_lock");
    expect(queries.join("\n")).not.toContain("DELETE FROM user_role");
    expect(queries.join("\n")).not.toContain("INSERT INTO audit_event");
  });

  it("revokes a non-last role and writes audit inside the same transaction", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql, parameters) {
            queries.push({ sql, parameters: parameters ?? [] });

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
              };
            }

            if (queryContains(sql, "count(*)")) {
              return {
                rowCount: 1,
                rows: [{ count: "2" }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "admin_2"
      })
    ).resolves.toEqual({
      data: {
        revoked: true
      },
      ok: true
    });

    const sql = queries.map((query) => query.sql).join("\n");
    expect(queryContains(sql, "pg_advisory_xact_lock")).toBeTruthy();
    expect(queryContains(sql, "count(*)")).toBeTruthy();
    expect(queryContains(sql, "delete from user_role")).toBeTruthy();
    expect(queryContains(sql, "insert into audit_event")).toBeTruthy();
    expect(sql).toContain("DELETE FROM user_role");
    expect(sql).toContain("INSERT INTO audit_event");
    expect(queries.find((query) => queryContains(query.sql, "delete from user_role"))?.parameters).toEqual([
      "admin_2",
      "admin"
    ]);
  });

  it("treats malformed count results as unexpected", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select exists")) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
              };
            }

            if (queryContains(sql, "count(*)")) {
              return {
                rowCount: 1,
                rows: [{ count: "nan" }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "admin_2"
      })
    ).resolves.toEqual({
      error: {
        code: "system.unexpected"
      },
      ok: false
    });
    expect(queries.join("\n")).toContain("pg_advisory_xact_lock");
    expect(queryContains(queries.join("\n"), "count(*)")).toBeTruthy();
    expect(queries.join("\n")).not.toContain("DELETE FROM user_role");
    expect(queries.join("\n")).not.toContain("INSERT INTO audit_event");
  });

  it("does not audit a revoke request when the role is already absent", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
              };
            }

            return {
              rowCount: queryContains(sql, "delete from user_role") ? 0 : 1,
              rows: [{ count: "2" }]
            };
          }
        })
    });

    await expect(
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "admin_2"
      })
    ).resolves.toEqual({
      data: {
        revoked: false
      },
      ok: true
    });
    expect(queries.join("\n")).not.toContain("INSERT INTO audit_event");
  });

  it("does not take the critical RBAC lock for non-critical role revokes", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: false }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "user",
        targetUserId: "user_2"
      })
    ).resolves.toEqual({
      data: {
        revoked: true
      },
      ok: true
    });
    expect(queries.join("\n")).not.toContain("pg_advisory_xact_lock");
  });

  it("rejects revoking the last permission-manager holder", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: true }]
              };
            }

            if (queryContains(sql, "select count(*)")) {
              return {
                rowCount: 1,
                rows: [{ count: "0" }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "user",
        targetUserId: "admin_1"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
    expect(queries.join("\n")).toContain("pg_advisory_xact_lock");
    expect(queries.join("\n")).not.toContain("DELETE FROM user_role");
    expect(queries.join("\n")).not.toContain("INSERT INTO audit_event");
  });

  it("allows revoking a permission-manager role when another holder remains", async () => {
    const queries: string[] = [];
    const revokeRole = createRevokeRoleAction({
      authorize: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if ((queryContains(sql, "select exists"))) {
              return {
                rowCount: 1,
                rows: [{ grants_permission_manager: true }]
              };
            }

            if (queryContains(sql, "select count(*)")) {
              return {
                rowCount: 1,
                rows: [{ count: "2" }]
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
      revokeRole({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        roleId: "user",
        targetUserId: "admin_2"
      })
    ).resolves.toEqual({
      data: {
        revoked: true
      },
      ok: true
    });
    const sql = queries.join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("role.stage = 'active'");
    expect(sql).toContain("permission_managers");
    expect(sql).toContain("DELETE FROM user_role");
    expect(sql).toContain("INSERT INTO audit_event");
  });

  it("serializes role-permission batch saves with the critical RBAC lock", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const saveRolePermissions = createSaveRolePermissionsAction({
      authorize: vi.fn().mockResolvedValue({
        permissions: new Set(["admin.permissions:update"]),
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql, parameters = []) {
            queries.push({ sql, parameters });

            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if (queryContains(sql, "select permission_id from role_permission")) {
              return {
                rowCount: 1,
                rows: [{ permission_id: "admin.users:read" }]
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
      saveRolePermissions({
        clientIp: "127.0.0.1",
        confirmed: "yes",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        permissionIds: ["admin.users:read", "admin.users:update"],
        roleId: "editor"
      })
    ).resolves.toEqual({
      data: {
        saved: true
      },
      ok: true
    });
    const sql = queries.map((query) => query.sql).join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("DELETE FROM role_permission");
    expect(sql).toContain("INSERT INTO role_permission");
    expect(sql).toContain("INSERT INTO audit_event");
    expect(sql).toContain("rbac.role_permissions.save");
    expect(
      queries.find((query) => queryContains(query.sql, "insert into role_permission"))
        ?.parameters
    ).toEqual(["editor", ["admin.users:read", "admin.users:update"]]);
  });

  it("rejects role-permission saves that would remove the last permission-manager", async () => {
    const queries: string[] = [];
    const saveRolePermissions = createSaveRolePermissionsAction({
      authorize: vi.fn().mockResolvedValue({
        permissions: new Set(["admin.permissions:update"]),
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if (queryContains(sql, "select permission_id from role_permission")) {
              return {
                rowCount: 1,
                rows: [
                  { permission_id: "admin.permissions:update" },
                  { permission_id: "admin.users:read" }
                ]
              };
            }

            if (queryContains(sql, "permission_managers")) {
              return {
                rowCount: 1,
                rows: [{ actor_count: "0", count: "0" }]
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
      saveRolePermissions({
        clientIp: "127.0.0.1",
        confirmed: "yes",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        permissionIds: ["admin.users:read"],
        roleId: "admin"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
    const sql = queries.join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("permission_managers");
    expect(sql).not.toContain("DELETE FROM role_permission");
    expect(sql).not.toContain("INSERT INTO audit_event");
  });

  it("rejects role-permission saves that would self-lock the permission manager", async () => {
    const queries: string[] = [];
    const saveRolePermissions = createSaveRolePermissionsAction({
      authorize: vi.fn().mockResolvedValue({
        permissions: new Set(["admin.permissions:update"]),
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select stage from role")) {
              return {
                rowCount: 1,
                rows: [{ stage: "active" }]
              };
            }

            if (queryContains(sql, "select permission_id from role_permission")) {
              return {
                rowCount: 1,
                rows: [
                  { permission_id: "admin.permissions:update" },
                  { permission_id: "admin.users:read" }
                ]
              };
            }

            if (queryContains(sql, "permission_managers")) {
              return {
                rowCount: 1,
                rows: [{ actor_count: "0", count: "2" }]
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
      saveRolePermissions({
        clientIp: "127.0.0.1",
        confirmed: "yes",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        permissionIds: ["admin.users:read"],
        roleId: "admin"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
    expect(queries.join("\n")).not.toContain("DELETE FROM role_permission");
  });

  it("serializes permission-manager direct overrides and blocks self-deny", async () => {
    const queries: string[] = [];
    const setOverride = createSetUserPermissionOverrideAction({
      authorize: vi.fn().mockResolvedValue({
        permissions: new Set(["admin.permissions:update"]),
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql) {
            queries.push(sql);

            if (queryContains(sql, "select granted from user_permission")) {
              return {
                rowCount: 0,
                rows: []
              };
            }

            if (queryContains(sql, "permission_managers")) {
              return {
                rowCount: 1,
                rows: [{ actor_count: "0", count: "2" }]
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
      setOverride({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        override: "deny",
        permissionId: "admin.permissions:update",
        targetUserId: "admin_1"
      })
    ).resolves.toEqual({
      error: {
        code: "auth.forbidden"
      },
      ok: false
    });
    const sql = queries.join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("permission_managers");
    expect(sql).not.toContain("INSERT INTO user_permission");
    expect(sql).not.toContain("INSERT INTO audit_event");
  });

  it("saves direct permission grants and audits the override", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const setOverride = createSetUserPermissionOverrideAction({
      authorize: vi.fn().mockResolvedValue({
        permissions: new Set(["admin.permissions:update"]),
        sessionId: "session_1",
        userId: "admin_1"
      }),
      transaction: async (callback) =>
        callback({
          async query(sql, parameters = []) {
            queries.push({ sql, parameters });

            if (queryContains(sql, "select granted from user_permission")) {
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
      setOverride({
        clientIp: "127.0.0.1",
        csrfCookie: "csrf",
        csrfToken: "csrf",
        override: "grant",
        permissionId: "admin.audit:read",
        targetUserId: "user_1"
      })
    ).resolves.toEqual({
      data: {
        saved: true
      },
      ok: true
    });
    const sql = queries.map((query) => query.sql).join("\n");
    expect(sql).not.toContain("pg_advisory_xact_lock");
    expect(sql).toContain("INSERT INTO user_permission");
    expect(sql).toContain("INSERT INTO audit_event");
    expect(sql).toContain("rbac.permission_override.grant");
    expect(
      queries.find((query) => queryContains(query.sql, "insert into user_permission"))
        ?.parameters
    ).toEqual(["user_1", "admin.audit:read", true, "admin_1"]);
  });
});
