import { readFileSync } from "node:fs";
import { join } from "node:path";
import { authorize } from "@wpmoo/rbac";
import { describe, expect, it } from "vitest";
import {
  loadAdminRoleEditorPage,
  loadAdminRolesPage,
  loadAdminUserAccessPage,
  type PageQueryClient
} from "../lib/phase2-pages.js";
import { phase3QueryBudgets } from "../lib/phase3-budgets.js";

function adminPermissionsContext() {
  return {
    authorize,
    getEffectiveAccessForRequest: async (userId: string) => ({
      lifecycle: { status: "active" as const },
      permissions: new Set(["admin.permissions:update"]),
      userId
    }),
    requireEmailVerification: true,
    resolveSession: async () => ({
      emailVerified: true,
      sessionId: "session_1",
      userId: "admin_1"
    })
  };
}

function createQueryClient(handler: (sql: string) => readonly Record<string, unknown>[]): {
  client: PageQueryClient;
  queries: string[];
} {
  const queries: string[] = [];

  return {
    client: {
      async query(sql) {
        queries.push(sql);
        const rows = handler(sql);

        return {
          rowCount: rows.length,
          rows
        };
      }
    },
    queries
  };
}

describe("Phase 5 admin pages", () => {
  it("loads the admin roles page within the expected query budget", async () => {
    const query = createQueryClient(() => ([{
      description: "System administrator",
      id: "admin",
      kind: "system",
      label: "Admin",
      name: "admin",
      permission_count: "4",
      stage: "active"
    }]));

    await expect(loadAdminRolesPage(adminPermissionsContext(), query.client)).resolves.toEqual({
      roles: [{
        description: "System administrator",
        id: "admin",
        kind: "system",
        label: "Admin",
        name: "admin",
        permissionCount: 4,
        stage: "active"
      }]
    });
    expect(query.queries.length).toBeLessThanOrEqual(phase3QueryBudgets.adminRolesList.maxQueries);
    expect(query.queries.join("
")).toContain("FROM role");
  });

  it("loads role editor permissions through the admin.permissions seam", async () => {
    const queries: string[] = [];
    const page = await loadAdminRoleEditorPage(
      adminPermissionsContext(),
      {
        async query(sql) {
          queries.push(sql);

          if (sql.includes("WHERE role.id = $1")) {
            return {
              rowCount: 1,
              rows: [{
                description: "System administrator",
                id: "admin",
                kind: "system",
                label: "Admin",
                name: "admin",
                permission_count: "4",
                stage: "active"
              }]
            };
          }

          return {
            rowCount: 1,
            rows: [{
              category: "Admin users",
              description: "View users",
              id: "admin.users:read",
              label: "View users",
              risk: "medium",
              selected: true
            }]
          };
        }
      },
      "admin"
    );

    expect(page).toEqual({
      permissions: [{
        category: "Admin users",
        description: "View users",
        id: "admin.users:read",
        label: "View users",
        risk: "medium",
        selected: true
      }],
      role: {
        description: "System administrator",
        id: "admin",
        kind: "system",
        label: "Admin",
        name: "admin",
        permissionCount: 4,
        stage: "active"
      }
    });
    expect(queries.length).toBeLessThanOrEqual(phase3QueryBudgets.adminRoleEditor.maxQueries);
    expect(queries.join("
")).toContain("EXISTS(");
  });

  it("loads user access source attribution and direct override states", async () => {
    const query = createQueryClient((sql) => {
      if (sql.includes('GROUP BY "user".id')) {
        return [{
          email: "user@example.test",
          id: "user_1",
          name: "Core User",
          role_labels: ["Admin"]
        }];
      }

      return [{
        category: "Admin users",
        description: "View users",
        direct_granted: false,
        id: "admin.users:read",
        label: "View users",
        risk: "medium",
        role_sources: [{ roleId: "admin", roleLabel: "Admin" }]
      }];
    });

    await expect(loadAdminUserAccessPage(adminPermissionsContext(), query.client, "user_1")).resolves.toEqual({
      permissions: [{
        category: "Admin users",
        description: "View users",
        effective: false,
        id: "admin.users:read",
        label: "View users",
        override: "deny",
        risk: "medium",
        sources: [
          { grant: false, kind: "direct" },
          { kind: "role", roleId: "admin", roleLabel: "Admin" }
        ]
      }],
      user: {
        email: "user@example.test",
        id: "user_1",
        name: "Core User",
        roles: ["Admin"]
      }
    });
    expect(query.queries.length).toBeLessThanOrEqual(phase3QueryBudgets.adminUserAccess.maxQueries);
    expect(query.queries.join("
")).toContain("jsonb_agg");
    expect(query.queries.join("
")).toContain("user_permission.granted");
  });

  it("binds role and user-access routes to real server actions and loaders", () => {
    const appDir = join(import.meta.dirname, "../app/admin");
    const rolesPage = readFileSync(join(appDir, "roles/page.tsx"), "utf8");
    const roleEditorPage = readFileSync(join(appDir, "roles/[roleId]/page.tsx"), "utf8");
    const userAccessPage = readFileSync(join(appDir, "users/[userId]/access/page.tsx"), "utf8");
    const usersActions = readFileSync(join(appDir, "users/actions.ts"), "utf8");
    const rolesActions = readFileSync(join(appDir, "roles/actions.ts"), "utf8");
    const roleActions = readFileSync(join(appDir, "roles/[roleId]/actions.ts"), "utf8");
    const userAccessActions = readFileSync(join(appDir, "users/[userId]/access/actions.ts"), "utf8");

    expect(rolesPage).toContain("loadAdminRolesPage");
    expect(roleEditorPage).toContain("loadAdminRoleEditorPage");
    expect(userAccessPage).toContain("loadAdminUserAccessPage");
    expect(usersActions).toContain('actionState("admin.users.role.assign"');
    expect(rolesActions).toContain('actionState("admin.roles.create"');
    expect(roleActions).toContain('actionState("admin.roles.permissions.save"');
    expect(userAccessActions).toContain('actionState("admin.users.permissions.override"');
  });
});
