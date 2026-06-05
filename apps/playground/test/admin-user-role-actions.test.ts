import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { actionState } from "../lib/action.js";
import {
  createAssignAdminRoleStateOptions,
  createBulkAssignAdminRoleStateOptions,
  createRevokeAdminRoleStateOptions
} from "../lib/admin-user-role-actions.js";
import type { BootstrapTransaction } from "../lib/phase2-actions.js";

type SearchFeedback = Readonly<{
  status: "idle" | "error" | "success";
  action:
    | null
    | "admin.users.role.assign"
    | "admin.users.role.bulk_assign"
    | "admin.users.role.revoke";
  code: string | null;
}>;

const initialState: SearchFeedback = {
  action: null,
  code: null,
  status: "idle"
};

const actor = {
  emailVerified: true,
  permissions: new Set(["admin.users:update"]),
  sessionId: "admin-session",
  userId: "admin@playground"
};

const normalizeQuery = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();
const queryContains = (sql: string, fragment: string) =>
  normalizeQuery(sql).includes(fragment);

const DEFAULT_ASSIGNMENTS = [
  ["admin@example.test", ["admin"]],
  ["user@example.test", ["user"]]
] as const satisfies readonly (readonly [string, readonly ("admin" | "user")[]])[];

function createFormData(input: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(input)) {
    formData.set(key, value);
  }

  return formData;
}

function createRoleTransaction(
  initialAssignments: readonly (readonly [string, readonly ("admin" | "user")[]])[] = DEFAULT_ASSIGNMENTS,
  options: Readonly<{
    permissionManagerRoles?: Readonly<Record<string, boolean>>;
    roleStages?: Readonly<Record<string, "active" | "archived">>;
    permissionManagerHolders?: number;
  }> = {}
): BootstrapTransaction {
  const roleAssignments = new Map<string, Set<"admin" | "user">>(
    initialAssignments.map(([userId, roles]) => [userId, new Set(roles)])
  );

  return async (callback) => {
    return callback({
      async query(sql, parameters = []) {
        if (queryContains(sql, "select stage from role")) {
          const roleId = String(parameters[0] ?? "");
          const stage = options.roleStages?.[roleId] ?? "active";

          return {
            rowCount: 1,
            rows: [{ stage }]
          };
        }

        if (queryContains(sql, "select exists")) {
          const roleId = String(parameters[0] ?? "");
          const grantsPermissionManager =
            options.permissionManagerRoles?.[roleId] ?? false;

          return {
            rowCount: 1,
            rows: [{ grants_permission_manager: grantsPermissionManager }]
          };
        }

        if (queryContains(sql, "insert into user_role")) {
          const targetUserId = String(parameters[0] ?? "");
          const roleId = String(parameters[1]) as "admin" | "user";
          const roles = roleAssignments.get(targetUserId) ?? new Set();
          const alreadyHas = roles.has(roleId);

          if (!alreadyHas) {
            roles.add(roleId);
            roleAssignments.set(targetUserId, roles);
          }

          return {
            rowCount: alreadyHas ? 0 : 1,
            rows: []
          };
        }

        if (queryContains(sql, "select count(*) as count from user_role")) {
          let count = 0;

          for (const roles of roleAssignments.values()) {
            if (roles.has("admin")) {
              count += 1;
            }
          }

          return {
            rowCount: 1,
            rows: [{ count }]
          };
        }

        if (queryContains(sql, "select count(*) as count") &&
          queryContains(sql, "permission_managers")
        ) {
          return {
            rowCount: 1,
            rows: [{ count: String(options.permissionManagerHolders ?? 2) }]
          };
        }

        if (queryContains(sql, "delete from user_role")) {
          const targetUserId = String(parameters[0] ?? "");
          const roleId = String(parameters[1]) as "admin" | "user";
          const roles = roleAssignments.get(targetUserId) ?? new Set();
          const existed = roles.delete(roleId);

          return {
            rowCount: existed ? 1 : 0,
            rows: []
          };
        }

        return {
          rowCount: 1,
          rows: []
        };
      }
    });
  };
}

function createRoleActions() {
  const authorize = vi.fn().mockResolvedValue(actor);
  const readCsrfCookie = vi.fn(() => "csrf");
  const transaction = createRoleTransaction();

  return {
    assign: actionState(
      "admin.users.role.assign",
      createAssignAdminRoleStateOptions({
        authorize,
        readCsrfCookie,
        transaction
      })
    ),
    authorize,
    bulkAssign: actionState(
      "admin.users.role.bulk_assign",
      createBulkAssignAdminRoleStateOptions({
        authorize,
        readCsrfCookie,
        transaction
      })
    ),
    revoke: actionState(
      "admin.users.role.revoke",
      createRevokeAdminRoleStateOptions({
        authorize,
        readCsrfCookie,
        transaction
      })
    )
  };
}

describe("admin user role action state", () => {
  it("does not expose fixture-backed role mutations as route-bound server actions", () => {
    const appActionsPath = resolve(
      import.meta.dirname,
      "../app/admin/users/actions.ts"
    );
    const roleActionsSource = readFileSync(
      resolve(import.meta.dirname, "../lib/admin-user-role-actions.ts"),
      "utf8"
    );
    const userRolesSource = readFileSync(
      resolve(import.meta.dirname, "../components/admin/admin-user-roles.tsx"),
      "utf8"
    );

    expect(existsSync(appActionsPath)).toBe(false);
    expect(roleActionsSource).not.toContain("createPlaygroundRoleTransaction");
    expect(roleActionsSource).not.toContain('formData.get("csrfCookie")');
    expect(userRolesSource).not.toContain('name="csrfCookie"');
  });

  it("rejects role changes without a target id as validation error", async () => {
    const actions = createRoleActions();
    const nextState = await actions.assign(
      initialState,
      createFormData({
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: ""
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.assign",
      code: "validation.invalid_input",
      status: "error"
    });
    expect(actions.authorize).not.toHaveBeenCalled();
  });

  it("rejects role changes before authorize when CSRF is invalid", async () => {
    const actions = createRoleActions();
    const nextState = await actions.assign(
      initialState,
      createFormData({
        csrfToken: "mismatch",
        roleId: "admin",
        targetUserId: "new-admin-target@test"
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.assign",
      code: "auth.forbidden",
      status: "error"
    });
    expect(actions.authorize).not.toHaveBeenCalled();
  });

  it("returns changed=true on successful role assignment", async () => {
    const actions = createRoleActions();
    const nextState = await actions.assign(
      initialState,
      createFormData({
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "new-admin-target@test"
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.assign",
      code: null,
      status: "success",
      changed: true
    });
    expect(actions.authorize).toHaveBeenCalledWith({
      action: "update",
      input: expect.objectContaining({
        targetUserId: "new-admin-target@test"
      }),
      resource: "admin.users"
    });
  });

  it("returns changed=false on no-op assignment state", async () => {
    const actions = createRoleActions();
    const nextState = await actions.assign(
      initialState,
      createFormData({
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "admin@example.test"
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.assign",
      code: null,
      status: "success",
      changed: false
    });
  });

  it("returns noop success when revocation target is already missing the role", async () => {
    const actions = createRoleActions();
    const nextState = await actions.revoke(
      initialState,
      createFormData({
        csrfToken: "csrf",
        roleId: "user",
        targetUserId: "admin@example.test"
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.revoke",
      status: "success",
      changed: false
    });
    expect(nextState.code).toBeNull();
  });

  it("requires confirmation before bulk role assignment", async () => {
    const actions = createRoleActions();
    const nextState = await actions.bulkAssign(
      initialState,
      createFormData({
        csrfToken: "csrf",
        targetUserId: "user@example.test"
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.bulk_assign",
      code: "validation.invalid_input",
      status: "error"
    });
    expect(actions.authorize).not.toHaveBeenCalled();
  });

  it("returns success for confirmed bulk role assignment and de-duplicates targets", async () => {
    const actions = createRoleActions();
    const formData = createFormData({
      confirmed: "yes",
      csrfToken: "csrf",
      targetUserId: "bulk-admin@example.test"
    });
    formData.append("targetUserId", "bulk-admin@example.test");

    const nextState = await actions.bulkAssign(initialState, formData);

    expect(nextState).toMatchObject({
      action: "admin.users.role.bulk_assign",
      code: null,
      status: "success",
      changed: true
    });
    expect(actions.authorize).toHaveBeenCalledTimes(1);
    expect(actions.authorize).toHaveBeenCalledWith({
      action: "update",
      input: expect.objectContaining({
        targetUserIds: [
          "bulk-admin@example.test",
          "bulk-admin@example.test"
        ]
      }),
      resource: "admin.users"
    });
  });

  it("does not mutate when authorization denies the action-state wrapper", async () => {
    const authorize = vi.fn().mockRejectedValue({ code: "auth.forbidden" });
    const transaction = vi.fn();
    const assign = actionState(
      "admin.users.role.assign",
      createAssignAdminRoleStateOptions({
        authorize,
        readCsrfCookie: () => "csrf",
        transaction
      })
    );
    const nextState = await assign(
      initialState,
      createFormData({
        csrfToken: "csrf",
        roleId: "admin",
        targetUserId: "blocked@example.test"
      })
    );

    expect(nextState).toMatchObject({
      action: "admin.users.role.assign",
      code: "auth.forbidden",
      status: "error"
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
