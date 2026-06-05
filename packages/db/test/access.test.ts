import { describe, expect, it } from "vitest";
import { loadEffectiveAccess, type DbQueryClient } from "../src/access.js";

describe("loadEffectiveAccess", () => {
  it("loads lifecycle and role-derived permissions for authorize", async () => {
    const queries: string[] = [];
    const client: DbQueryClient = {
      async query(sql) {
        queries.push(sql);

        return {
          rowCount: 2,
          rows: [
            {
              expires_at: null,
              granted: true,
              permission_id: "admin.users:read",
              source: "role",
              status: "active"
            },
            {
              expires_at: null,
              granted: true,
              permission_id: "admin.users:update",
              source: "role",
              status: "active"
            }
          ]
        };
      }
    };

    await expect(loadEffectiveAccess(client, "user_1")).resolves.toEqual({
      lifecycle: {
        expiresAt: null,
        status: "active"
      },
      permissions: new Set(["admin.users:read", "admin.users:update"]),
      userId: "user_1"
    });
    expect(queries[0]).toContain("LEFT JOIN (");
    expect(queries[0]).toContain("role_permission");
    expect(queries[0]).toContain("AND role.stage = 'active'");
    expect(queries[0]).toContain("user_permission");
  });

  it("respects explicit deny overrides against role grants", async () => {
    const client: DbQueryClient = {
      async query() {
        return {
          rowCount: 3,
          rows: [
            {
              expires_at: null,
              granted: false,
              permission_id: "admin.users:update",
              source: "direct",
              status: "active"
            },
            {
              expires_at: null,
              granted: true,
              permission_id: "admin.users:update",
              source: "role",
              status: "active"
            },
            {
              expires_at: null,
              granted: true,
              permission_id: "admin.users:read",
              source: "role",
              status: "active"
            }
          ]
        };
      }
    };

    await expect(loadEffectiveAccess(client, "user_1")).resolves.toEqual({
      lifecycle: {
        expiresAt: null,
        status: "active"
      },
      permissions: new Set(["admin.users:read"]),
      userId: "user_1"
    });
  });

  it("preserves explicit suspended lifecycle state for authorize", async () => {
    const expiresAt = new Date("2026-06-04T12:30:00.000Z");
    const client: DbQueryClient = {
      async query() {
        return {
          rowCount: 1,
          rows: [
            {
              expires_at: expiresAt,
              granted: true,
              permission_id: "admin.users:read",
              source: "role",
              status: "suspended"
            }
          ]
        };
      }
    };

    await expect(loadEffectiveAccess(client, "user_1")).resolves.toEqual({
      lifecycle: {
        expiresAt,
        status: "suspended"
      },
      permissions: new Set(["admin.users:read"]),
      userId: "user_1"
    });
  });

  it("deduplicates permissions granted by multiple roles", async () => {
    const client: DbQueryClient = {
      async query() {
        return {
          rowCount: 2,
          rows: [
            {
              expires_at: null,
              granted: true,
              permission_id: "admin.users:read",
              source: "role",
              status: "active"
            },
            {
              expires_at: null,
              granted: true,
              permission_id: "admin.users:read",
              source: "role",
              status: "active"
            }
          ]
        };
      }
    };

    const access = await loadEffectiveAccess(client, "user_1");

    expect([...access.permissions]).toEqual(["admin.users:read"]);
  });

  it("defaults missing lifecycle rows to active with no permissions", async () => {
    const client: DbQueryClient = {
      async query() {
        return {
          rowCount: 0,
          rows: []
        };
      }
    };

    await expect(loadEffectiveAccess(client, "user_1")).resolves.toEqual({
      lifecycle: {
        expiresAt: null,
        status: "active"
      },
      permissions: new Set(),
      userId: "user_1"
    });
  });
});
