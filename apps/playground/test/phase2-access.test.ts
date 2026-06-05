import { readFileSync } from "node:fs";
import { join } from "node:path";
import { authorize } from "@wpmoo/rbac";
import { describe, expect, it } from "vitest";
import {
  authorizeAdminPage,
  requireVerifiedEmailForPrivilegedAction,
  resolveRegistrationAccess
} from "../lib/phase2-access.js";
import {
  loadAdminAuditPage,
  loadAdminUsersPage,
  loadRegisterPage,
  loadSetupAdminPage,
  type PageQueryClient
} from "../lib/phase2-pages.js";

function createPageQueryClient(
  rows: readonly Record<string, unknown>[],
  queries: string[] = []
): PageQueryClient {
  return {
    async query(sql) {
      queries.push(sql);

      return {
        rowCount: rows.length,
        rows
      };
    }
  };
}

describe("Phase 2 access policy", () => {
  it("allows public registration only when registration mode is public", () => {
    expect(resolveRegistrationAccess({ mode: "public" })).toEqual({
      allowed: true,
      reason: null
    });
    expect(resolveRegistrationAccess({ mode: "invite_only" })).toEqual({
      allowed: false,
      reason: "invite_required"
    });
  });

  it("allows the bootstrap exception for invite-only registration but not disabled registration", () => {
    expect(
      resolveRegistrationAccess({
        isBootstrapException: true,
        mode: "invite_only"
      })
    ).toEqual({
      allowed: true,
      reason: null
    });
    expect(
      resolveRegistrationAccess({
        isBootstrapException: true,
        mode: "disabled"
      })
    ).toEqual({
      allowed: false,
      reason: "registration_disabled"
    });
  });

  it("requires verified email before privileged production actions", () => {
    expect(() =>
      requireVerifiedEmailForPrivilegedAction(
        {
          emailVerified: false,
          permissions: new Set(["admin.users:read"]),
          sessionId: "session_1",
          userId: "user_1"
        },
        { requireEmailVerification: true }
      )
    ).toThrow(/auth.forbidden/);
    expect(() =>
      requireVerifiedEmailForPrivilegedAction(
        {
          emailVerified: false,
          permissions: new Set(["admin.users:read"]),
          sessionId: "session_1",
          userId: "user_1"
        },
        { requireEmailVerification: false }
      )
    ).not.toThrow();
  });

  it("blocks non-admin users from admin pages through authorize", async () => {
    await expect(
      authorizeAdminPage(
        { action: "read", resource: "admin.users" },
        {
          authorize,
          getEffectiveAccessForRequest: async (userId) => ({
            lifecycle: { status: "active" },
            permissions: new Set(["dashboard:read"]),
            userId
          }),
          requireEmailVerification: false,
          resolveSession: async () => ({
            emailVerified: true,
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).rejects.toMatchObject({ code: "auth.forbidden" });
  });

  it("returns verified admins for admin pages", async () => {
    await expect(
      authorizeAdminPage(
        { action: "read", resource: "admin.users" },
        {
          authorize,
          getEffectiveAccessForRequest: async (userId) => ({
            lifecycle: { status: "active" },
            permissions: new Set(["admin.users:read"]),
            userId
          }),
          requireEmailVerification: true,
          resolveSession: async () => ({
            emailVerified: true,
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).resolves.toMatchObject({
      sessionId: "session_1",
      userId: "user_1"
    });
  });

  it("binds admin route modules to the server-side authorize helper", async () => {
    const appDir = join(process.cwd(), "apps/playground/app");
    const adminUsersPage = readFileSync(join(appDir, "admin/users/page.tsx"), "utf8");
    const adminAuditPage = readFileSync(join(appDir, "admin/audit/page.tsx"), "utf8");

    expect(adminUsersPage).toContain("authorizeAdminPage");
    expect(adminUsersPage).toContain('resource: "admin.users"');
    expect(adminUsersPage).toContain("await loadAdminUsersPage");
    expect(adminAuditPage).toContain("authorizeAdminPage");
    expect(adminAuditPage).toContain('resource: "admin.audit"');
    expect(adminAuditPage).toContain("await loadAdminAuditPage");
  });

  it("binds registration route modules to the registration mode helper", () => {
    const appDir = join(process.cwd(), "apps/playground/app");
    const libDir = join(process.cwd(), "apps/playground/lib");
    const registerPage = readFileSync(join(appDir, "register/page.tsx"), "utf8");
    const bootstrapPage = readFileSync(join(appDir, "setup/admin/page.tsx"), "utf8");
    const pageLoaders = readFileSync(join(libDir, "phase2-pages.ts"), "utf8");

    expect(registerPage).toContain("loadRegisterPage");
    expect(registerPage).toContain("notFound()");
    expect(registerPage).toContain("resolveRegisterPageAccess");
    expect(bootstrapPage).toContain("loadSetupAdminPage");
    expect(bootstrapPage).toContain("notFound()");
    expect(bootstrapPage).toContain("resolveBootstrapPageAccess");
    expect(pageLoaders).toContain("resolveRegistrationAccess");
    expect(pageLoaders).toContain("isBootstrapException: true");
  });

  it("blocks register and setup pages through route loaders when registration is disabled", () => {
    expect(loadRegisterPage({ mode: "disabled" })).toEqual({
      access: {
        allowed: false,
        reason: "registration_disabled"
      }
    });
    expect(loadSetupAdminPage({ mode: "disabled" })).toEqual({
      access: {
        allowed: false,
        reason: "registration_disabled"
      }
    });
  });

  it("allows setup bootstrap while invite-only registration blocks public registration", () => {
    expect(loadRegisterPage({ mode: "invite_only" })).toEqual({
      access: {
        allowed: false,
        reason: "invite_required"
      }
    });
    expect(loadSetupAdminPage({ mode: "invite_only" })).toEqual({
      access: {
        allowed: true,
        reason: null
      }
    });
  });

  it("loads admin users only after the admin authorize seam passes", async () => {
    const calls: string[] = [];
    const queries: string[] = [];
    const page = await loadAdminUsersPage({
      authorize: async (permission, context) => {
        calls.push(`${permission.resource}:${permission.action}`);

        return authorize(permission, context);
      },
      getEffectiveAccessForRequest: async (userId) => ({
        lifecycle: { status: "active" },
        permissions: new Set(["admin.users:read"]),
        userId
      }),
      requireEmailVerification: true,
      resolveSession: async () => ({
        emailVerified: true,
        sessionId: "session_1",
        userId: "user_1"
      })
    }, createPageQueryClient([
      {
        email: "admin@example.test",
        name: "Admin User",
        role: "admin"
      },
      {
        email: "user@example.test",
        name: "Core User",
        role: "user"
      }
    ], queries));

    expect(calls).toEqual(["admin.users:read"]);
    expect(queries.join("\n")).toContain("INNER JOIN user_role");
    expect(queries.join("\n")).toContain("INNER JOIN role");
    expect(page.users).toEqual([
      {
        email: "admin@example.test",
        name: "Admin User",
        role: "admin"
      },
      {
        email: "user@example.test",
        name: "Core User",
        role: "user"
      }
    ]);
  });

  it("blocks admin audit page data for non-admin users", async () => {
    await expect(
      loadAdminAuditPage({
        authorize,
        getEffectiveAccessForRequest: async (userId) => ({
          lifecycle: { status: "active" },
          permissions: new Set(["dashboard:read"]),
          userId
        }),
        requireEmailVerification: false,
        resolveSession: async () => ({
          emailVerified: true,
          sessionId: "session_1",
          userId: "user_1"
        })
      }, {
        async query() {
          throw new Error("audit rows should not load after denied authorize");
        }
      })
    ).rejects.toMatchObject({ code: "auth.forbidden" });
  });

  it("shows audit page rows for role mutations after authorization", async () => {
    const queries: string[] = [];
    const page = await loadAdminAuditPage({
      authorize,
      getEffectiveAccessForRequest: async (userId) => ({
        lifecycle: { status: "active" },
        permissions: new Set(["admin.audit:read"]),
        userId
      }),
      requireEmailVerification: true,
      resolveSession: async () => ({
        emailVerified: true,
        sessionId: "session_1",
        userId: "user_1"
      })
    }, createPageQueryClient([
      {
        action: "system.admin.bootstrap",
        risk: "critical",
        target: "user:admin"
      },
      {
        action: "admin.users.role.assign",
        risk: "high",
        target: "user:core"
      },
      {
        action: "admin.users.role.revoke",
        risk: "high",
        target: "user:core"
      }
    ], queries));

    expect(queries.join("\n")).toContain("FROM audit_event");
    expect(queries.join("\n")).toContain("admin.users.role.assign");
    expect(page.auditRows).toContainEqual({
      action: "admin.users.role.assign",
      risk: "high",
      target: "user:core"
    });
    expect(page.auditRows).toContainEqual({
      action: "admin.users.role.revoke",
      risk: "high",
      target: "user:core"
    });
  });
});
