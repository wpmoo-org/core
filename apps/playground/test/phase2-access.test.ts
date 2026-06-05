import { readFileSync } from "node:fs";
import { join } from "node:path";
import { authorize } from "@wpmoo/rbac";
import { describe, expect, it } from "vitest";
import {
  authorizeAdminPage,
  requireVerifiedEmailForPrivilegedAction,
  resolveRegistrationAccess
} from "../lib/phase2-access.js";

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
    expect(adminAuditPage).toContain("authorizeAdminPage");
    expect(adminAuditPage).toContain('resource: "admin.audit"');
  });

  it("binds registration route modules to the registration mode helper", () => {
    const appDir = join(process.cwd(), "apps/playground/app");
    const registerPage = readFileSync(join(appDir, "register/page.tsx"), "utf8");
    const bootstrapPage = readFileSync(join(appDir, "setup/admin/page.tsx"), "utf8");

    expect(registerPage).toContain("resolveRegistrationAccess");
    expect(registerPage).toContain("resolveRegisterPageAccess");
    expect(bootstrapPage).toContain("resolveRegistrationAccess");
    expect(bootstrapPage).toContain("resolveBootstrapPageAccess");
    expect(bootstrapPage).toContain("isBootstrapException: true");
  });
});
