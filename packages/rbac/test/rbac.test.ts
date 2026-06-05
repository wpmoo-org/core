import { describe, expect, it, vi } from "vitest";
import {
  authorize,
  createRequestEffectiveAccessLoader,
  permissionId,
  RbacError,
  requirePermission
} from "../src/index.js";
import { corePermissionCatalog } from "../src/catalog.js";

describe("@wpmoo/rbac", () => {
  const activeAccess = {
    lifecycle: {
      status: "active"
    },
    permissions: new Set(["admin.users:read", "admin.users:update"]),
    userId: "user_1"
  } as const;

  it("keeps the Phase 2 permission catalog in rbac", () => {
    expect(corePermissionCatalog.map((permission) => permission.id)).toEqual([
      "admin.users:read",
      "admin.users:update",
      "admin.audit:read"
    ]);
    expect(new Set(corePermissionCatalog.map((permission) => permission.id)).size).toBe(
      corePermissionCatalog.length
    );
    expect(
      corePermissionCatalog.map((permission) =>
        permissionId({
          action: permission.action,
          resource: permission.resource
        })
      )
    ).toEqual(corePermissionCatalog.map((permission) => permission.id));
  });

  it("derives canonical permission IDs from object parameters", () => {
    expect(permissionId({ resource: "admin.users", action: "update" })).toBe(
      "admin.users:update"
    );
  });

  it("memoizes effective access once per request and user", async () => {
    const load = vi.fn().mockResolvedValue(activeAccess);
    const getEffectiveAccessForRequest = createRequestEffectiveAccessLoader(load);

    await expect(getEffectiveAccessForRequest("user_1")).resolves.toBe(activeAccess);
    await expect(getEffectiveAccessForRequest("user_1")).resolves.toBe(activeAccess);

    expect(load).toHaveBeenCalledOnce();
  });

  it("memoizes in-flight effective access calls without sharing users", async () => {
    const load = vi.fn(async (userId: string) => ({
      lifecycle: {
        status: "active" as const
      },
      permissions: new Set([`${userId}:read`]),
      userId
    }));
    const getEffectiveAccessForRequest = createRequestEffectiveAccessLoader(load);

    const [first, second, third] = await Promise.all([
      getEffectiveAccessForRequest("user_1"),
      getEffectiveAccessForRequest("user_1"),
      getEffectiveAccessForRequest("user_2")
    ]);

    expect(first).toBe(second);
    expect(third.userId).toBe("user_2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects missing sessions before loading effective access", async () => {
    const load = vi.fn();

    await expect(
      authorize(
        { resource: "admin.users", action: "read" },
        {
          getEffectiveAccessForRequest: load,
          resolveSession: async () => null
        }
      )
    ).rejects.toMatchObject({ code: "auth.unauthorized" });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects suspended users with live sessions", async () => {
    await expect(
      authorize(
        { resource: "admin.users", action: "read" },
        {
          getEffectiveAccessForRequest: async () => ({
            ...activeAccess,
            lifecycle: {
              status: "suspended"
            }
          }),
          resolveSession: async () => ({
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).rejects.toMatchObject({ code: "auth.forbidden" });
  });

  it("rejects suspended users until the lifecycle expiry passes", async () => {
    await expect(
      authorize(
        { resource: "admin.users", action: "read" },
        {
          getEffectiveAccessForRequest: async () => ({
            ...activeAccess,
            lifecycle: {
              expiresAt: new Date("2026-06-04T12:30:00.000Z"),
              status: "suspended"
            }
          }),
          now: new Date("2026-06-04T12:00:00.000Z"),
          resolveSession: async () => ({
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).rejects.toMatchObject({ code: "auth.forbidden" });
  });

  it("allows a temporarily suspended user after the lifecycle expiry passes", async () => {
    await expect(
      authorize(
        { resource: "admin.users", action: "read" },
        {
          getEffectiveAccessForRequest: async () => ({
            ...activeAccess,
            lifecycle: {
              expiresAt: new Date("2026-06-04T12:30:00.000Z"),
              status: "suspended"
            }
          }),
          now: new Date("2026-06-04T12:31:00.000Z"),
          resolveSession: async () => ({
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

  it("treats a lifecycle expiry at the current instant as expired", async () => {
    const expiry = new Date("2026-06-04T12:30:00.000Z");

    await expect(
      authorize(
        { resource: "admin.users", action: "read" },
        {
          getEffectiveAccessForRequest: async () => ({
            ...activeAccess,
            lifecycle: {
              expiresAt: expiry,
              status: "suspended"
            }
          }),
          now: expiry,
          resolveSession: async () => ({
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

  it("resolves effective access once across repeated authorize calls in one request", async () => {
    const load = vi.fn().mockResolvedValue({
      ...activeAccess,
      permissions: new Set(["admin.users:read", "admin.users:update"])
    });
    const getEffectiveAccessForRequest = createRequestEffectiveAccessLoader(load);
    const context = {
      getEffectiveAccessForRequest,
      resolveSession: async () => ({
        sessionId: "session_1",
        userId: "user_1"
      })
    };

    await expect(
      authorize({ resource: "admin.users", action: "read" }, context)
    ).resolves.toMatchObject({ userId: "user_1" });
    await expect(
      authorize({ resource: "admin.users", action: "update" }, context)
    ).resolves.toMatchObject({ userId: "user_1" });

    expect(load).toHaveBeenCalledOnce();
  });

  it("rejects missing permissions through the same authorize seam", async () => {
    await expect(
      authorize(
        { resource: "admin.audit", action: "read" },
        {
          getEffectiveAccessForRequest: async () => activeAccess,
          resolveSession: async () => ({
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).rejects.toBeInstanceOf(RbacError);
    await expect(
      authorize(
        { resource: "admin.audit", action: "read" },
        {
          getEffectiveAccessForRequest: async () => activeAccess,
          resolveSession: async () => ({
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).rejects.toMatchObject({ code: "auth.forbidden" });
  });

  it("returns the active actor when session, lifecycle, and permission pass", async () => {
    await expect(
      authorize(
        { resource: "admin.users", action: "update" },
        {
          getEffectiveAccessForRequest: async () => activeAccess,
          resolveSession: async () => ({
            emailVerified: true,
            sessionId: "session_1",
            userId: "user_1"
          })
        }
      )
    ).resolves.toEqual({
      emailVerified: true,
      permissions: new Set(["admin.users:read", "admin.users:update"]),
      sessionId: "session_1",
      userId: "user_1"
    });
  });

  it("keeps requirePermission as the low-level object API", () => {
    expect(() =>
      requirePermission({
        access: activeAccess,
        action: "update",
        resource: "admin.users"
      })
    ).not.toThrow();
    expect(() =>
      requirePermission({
        access: activeAccess,
        action: "read",
        resource: "admin.audit"
      })
    ).toThrow(RbacError);
  });
});
