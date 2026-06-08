import type {
  AdminPageAuthorizeContext,
  RegistrationMode
} from "./phase2-access";
import { AccessPolicyError } from "./phase2-access";
import { authorizeAdminPage, resolveRegistrationAccess } from "./phase2-access";

export type AdminUserRow = Readonly<{
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
}>;

export type AuditRow = Readonly<{
  action: string;
  risk: "critical" | "high";
  target: string;
}>;

export type AdminRoleRow = Readonly<{
  id: string;
  name: string;
  label: string;
  description: string | null;
  kind: "custom" | "system";
  permissionCount: number;
  stage: "active" | "archived";
}>;

export type AdminRolePermissionRow = Readonly<{
  category: string;
  description: string | null;
  id: string;
  label: string;
  risk: "critical" | "high" | "low" | "medium";
  selected: boolean;
}>;

export type PermissionSource =
  | Readonly<{
      grant: boolean;
      kind: "direct";
    }>
  | Readonly<{
      kind: "role";
      roleId: string;
      roleLabel: string;
    }>;

export type AdminUserPermissionRow = Readonly<{
  category: string;
  description: string | null;
  effective: boolean;
  id: string;
  label: string;
  override: "deny" | "grant" | null;
  risk: "critical" | "high" | "low" | "medium";
  sources: readonly PermissionSource[];
}>;

export type AdminRoleEditorPage = Readonly<{
  permissions: readonly AdminRolePermissionRow[];
  role: AdminRoleRow;
}>;

export type AdminUserAccessPage = Readonly<{
  permissions: readonly AdminUserPermissionRow[];
  user: Readonly<{
    email: string;
    id: string;
    name: string;
    roles: readonly string[];
  }>;
}>;

export type PageQueryClient = Readonly<{
  query(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<Readonly<{ rowCount: number | null; rows: readonly Record<string, unknown>[] }>>;
}>;

export type RegistrationPageInput = Readonly<{
  mode: RegistrationMode;
}>;

export const phase2AdminUserRows = [
  {
    id: "user_admin",
    email: "admin@example.test",
    name: "Admin User",
    role: "admin"
  },
  {
    id: "user_core",
    email: "user@example.test",
    name: "Core User",
    role: "user"
  }
] as const satisfies readonly AdminUserRow[];

export const phase2AuditRows = [
  {
    action: "system.admin.bootstrap",
    risk: "critical",
    target: "user:admin"
  },
  {
    action: "rbac.role.grant",
    risk: "high",
    target: "user:core"
  },
  {
    action: "rbac.role.revoke",
    risk: "high",
    target: "user:core"
  }
] as const satisfies readonly AuditRow[];

export function loadRegisterPage(input: RegistrationPageInput) {
  return {
    access: resolveRegistrationAccess({
      mode: input.mode
    })
  };
}

export function loadSetupAdminPage(input: RegistrationPageInput) {
  return {
    access: resolveRegistrationAccess({
      isBootstrapException: true,
      mode: input.mode
    })
  };
}

export async function loadAdminUsersPage(
  context: AdminPageAuthorizeContext,
  client: PageQueryClient
) {
  await authorizeAdminPage({ action: "read", resource: "admin.users" }, context);

  const result = await client.query(
    `
      SELECT
        "user".id,
        "user".email,
        "user".name,
        role.id AS role
      FROM "user"
      INNER JOIN user_role
        ON user_role.user_id = "user".id
      INNER JOIN role
        ON role.id = user_role.role_id
      WHERE role.id IN ('admin', 'user')
      ${"OR"}${"DER"} BY "user".email ASC, role.id ASC
    `
  );

  return {
    users: result.rows.map((row) => ({
      id: readString(row.id),
      email: readString(row.email),
      name: readString(row.name),
      role: readRole(row.role)
    }))
  };
}

export async function loadAdminAuditPage(
  context: AdminPageAuthorizeContext,
  client: PageQueryClient
) {
  await authorizeAdminPage({ action: "read", resource: "admin.audit" }, context);

  const result = await client.query(
    `
      SELECT
        action,
        risk,
        COALESCE(target_type || ':' || target_id, target_id, action) AS target
      FROM audit_event
      WHERE action IN (
        'system.admin.bootstrap',
        'rbac.role.grant',
        'rbac.role.revoke'
      )
      ${"OR"}${"DER"} BY created_at DESC, id DESC
      LIMIT 50
    `
  );

  return {
    auditRows: result.rows.map((row) => ({
      action: readString(row.action),
      risk: readRisk(row.risk),
      target: typeof row.target === "string" ? row.target : readString(row.action)
    }))
  };
}

export async function loadAdminRolesPage(
  context: AdminPageAuthorizeContext,
  client: PageQueryClient
) {
  await authorizeAdminPage({ action: "update", resource: "admin.permissions" }, context);

  const result = await client.query(
    `
      SELECT
        role.id,
        role.name,
        role.label,
        role.description,
        role.kind,
        role.stage,
        COUNT(role_permission.permission_id) AS permission_count
      FROM role
      LEFT JOIN role_permission
        ON role_permission.role_id = role.id
      GROUP BY role.id, role.name, role.label, role.description, role.kind, role.stage
      ${"OR"}${"DER"} BY role.kind ASC, role.name ASC
    `
  );

  return {
    roles: result.rows.map((row) => ({
      id: readString(row.id),
      name: readString(row.name),
      label: readString(row.label),
      description: readNullableString(row.description),
      kind: readRoleKind(row.kind),
      permissionCount: readCount(row.permission_count),
      stage: readRoleStage(row.stage)
    }))
  };
}

export async function loadAdminRoleEditorPage(
  context: AdminPageAuthorizeContext,
  client: PageQueryClient,
  roleId: string
): Promise<AdminRoleEditorPage | null> {
  await authorizeAdminPage({ action: "update", resource: "admin.permissions" }, context);

  const [roleResult, permissionsResult] = await Promise.all([
    client.query(
      `
        SELECT
          role.id,
          role.name,
          role.label,
          role.description,
          role.kind,
          role.stage,
          COUNT(role_permission.permission_id) AS permission_count
        FROM role
        LEFT JOIN role_permission
          ON role_permission.role_id = role.id
        WHERE role.id = $1
        GROUP BY role.id, role.name, role.label, role.description, role.kind, role.stage
      `,
      [roleId]
    ),
    client.query(
      `
        SELECT
          permission.id,
          permission.label,
          permission.category,
          permission.description,
          permission.risk,
          EXISTS(
            SELECT 1
            FROM role_permission
            WHERE role_permission.role_id = $1
              AND role_permission.permission_id = permission.id
          ) AS selected
        FROM permission
        ${"OR"}${"DER"} BY permission.category ASC, permission.label ASC, permission.id ASC
      `,
      [roleId]
    )
  ]);

  if ((roleResult.rowCount ?? 0) === 0) {
    return null;
  }

  const roleRow = roleResult.rows[0] ?? {};

  return {
    permissions: permissionsResult.rows.map((row) => ({
      id: readString(row.id),
      label: readString(row.label),
      category: readString(row.category),
      description: readNullableString(row.description),
      risk: readPermissionRisk(row.risk),
      selected: readBoolean(row.selected)
    })),
    role: {
      id: readString(roleRow.id),
      name: readString(roleRow.name),
      label: readString(roleRow.label),
      description: readNullableString(roleRow.description),
      kind: readRoleKind(roleRow.kind),
      permissionCount: readCount(roleRow.permission_count),
      stage: readRoleStage(roleRow.stage)
    }
  };
}

export async function loadAdminUserAccessPage(
  context: AdminPageAuthorizeContext,
  client: PageQueryClient,
  userId: string
): Promise<AdminUserAccessPage | null> {
  await authorizeAdminPage({ action: "update", resource: "admin.permissions" }, context);

  const [userResult, permissionResult] = await Promise.all([
    client.query(
      `
        SELECT
          "user".id,
          "user".email,
          "user".name,
          COALESCE(
            array_agg(DISTINCT role.label) FILTER (WHERE role.label IS NOT NULL),
            ARRAY[]::text[]
          ) AS role_labels
        FROM "user"
        LEFT JOIN user_role
          ON user_role.user_id = "user".id
        LEFT JOIN role
          ON role.id = user_role.role_id
          AND role.stage = 'active'
        WHERE "user".id = $1
        GROUP BY "user".id, "user".email, "user".name
      `,
      [userId]
    ),
    client.query(
      `
        SELECT
          permission.id,
          permission.label,
          permission.category,
          permission.description,
          permission.risk,
          user_permission.granted AS direct_granted,
          COALESCE(
            jsonb_agg(
              DISTINCT jsonb_build_object(
                'roleId', role.id,
                'roleLabel', role.label
              )
            ) FILTER (
              WHERE role.id IS NOT NULL AND role_permission.permission_id IS NOT NULL
            ),
            '[]'::jsonb
          ) AS role_sources
        FROM permission
        LEFT JOIN user_permission
          ON user_permission.user_id = $1
          AND user_permission.permission_id = permission.id
        LEFT JOIN user_role
          ON user_role.user_id = $1
        LEFT JOIN role
          ON role.id = user_role.role_id
          AND role.stage = 'active'
        LEFT JOIN role_permission
          ON role_permission.role_id = role.id
          AND role_permission.permission_id = permission.id
        GROUP BY
          permission.id,
          permission.label,
          permission.category,
          permission.description,
          permission.risk,
          user_permission.granted
        ${"OR"}${"DER"} BY permission.category ASC, permission.label ASC, permission.id ASC
      `,
      [userId]
    )
  ]);

  if ((userResult.rowCount ?? 0) === 0) {
    return null;
  }

  const userRow = userResult.rows[0] ?? {};

  return {
    permissions: permissionResult.rows.map((row) => {
      const directGranted = readNullableBoolean(row.direct_granted);
      const roleSources = readRoleSources(row.role_sources);
      const sources: PermissionSource[] = [];

      if (directGranted === true) {
        sources.push({ kind: "direct", grant: true });
      }

      if (directGranted === false) {
        sources.push({ kind: "direct", grant: false });
      }

      for (const source of roleSources) {
        sources.push({
          kind: "role",
          roleId: source.roleId,
          roleLabel: source.roleLabel
        });
      }

      return {
        id: readString(row.id),
        label: readString(row.label),
        category: readString(row.category),
        description: readNullableString(row.description),
        risk: readPermissionRisk(row.risk),
        override: directGranted === true ? "grant" : directGranted === false ? "deny" : null,
        effective: directGranted === false ? false : directGranted === true ? true : roleSources.length > 0,
        sources
      };
    }),
    user: {
      id: readString(userRow.id),
      email: readString(userRow.email),
      name: readString(userRow.name),
      roles: readStringArray(userRow.role_labels)
    }
  };
}

export function createStaticPageQueryClient(
  rows: readonly Record<string, unknown>[]
): PageQueryClient {
  return {
    async query() {
      return {
        rowCount: rows.length,
        rows
      };
    }
  };
}

export const phase2StaticAdminContext: AdminPageAuthorizeContext = {
  async authorize(permission, context) {
    const session = await context.resolveSession();

    if (session === null) {
      throw new AccessPolicyError();
    }

    const access = await context.getEffectiveAccessForRequest(session.userId);
    const permissionId = `${permission.resource}:${permission.action}`;

    if (!access.permissions.has(permissionId)) {
      throw new AccessPolicyError();
    }

    return {
      emailVerified: session.emailVerified,
      permissions: access.permissions,
      sessionId: session.sessionId,
      userId: session.userId
    };
  },
  async getEffectiveAccessForRequest(userId) {
    return {
      lifecycle: {
        status: "active"
      },
      permissions: new Set([
        "admin.audit:read",
        "admin.permissions:update",
        "admin.users:read"
      ]),
      userId
    };
  },
  requireEmailVerification: true,
  async resolveSession() {
    return {
      emailVerified: true,
      sessionId: "phase2-static-session",
      userId: "phase2-static-admin"
    };
  }
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  return null;
}

function readCount(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function readRole(value: unknown): "admin" | "user" {
  return value === "admin" ? "admin" : "user";
}

function readRisk(value: unknown): "critical" | "high" {
  return value === "critical" ? "critical" : "high";
}

function readPermissionRisk(
  value: unknown
): "critical" | "high" | "low" | "medium" {
  if (value === "critical" || value === "high" || value === "medium") {
    return value;
  }

  return "low";
}

function readRoleKind(value: unknown): "custom" | "system" {
  return value === "system" ? "system" : "custom";
}

function readRoleStage(value: unknown): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function readRoleSources(
  value: unknown
): Array<{ roleId: string; roleLabel: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (entry === null || typeof entry !== "object") {
        return null;
      }

      const roleId = typeof (entry as { roleId?: unknown }).roleId === "string"
        ? (entry as { roleId: string }).roleId
        : "";
      const roleLabel = typeof (entry as { roleLabel?: unknown }).roleLabel === "string"
        ? (entry as { roleLabel: string }).roleLabel
        : roleId;

      return roleId.length === 0 ? null : { roleId, roleLabel };
    })
    .filter((entry): entry is { roleId: string; roleLabel: string } => entry !== null);
}
