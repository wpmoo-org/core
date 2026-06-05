import type {
  AdminPageAuthorizeContext,
  RegistrationMode
} from "./phase2-access";
import { AccessPolicyError } from "./phase2-access";
import { authorizeAdminPage, resolveRegistrationAccess } from "./phase2-access";

export type AdminUserRow = Readonly<{
  email: string;
  name: string;
  role: "admin" | "user";
}>;

export type AuditRow = Readonly<{
  action: string;
  risk: "critical" | "high";
  target: string;
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
    email: "admin@example.test",
    name: "Admin User",
    role: "admin"
  },
  {
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
    action: "admin.users.role.assign",
    risk: "high",
    target: "user:core"
  },
  {
    action: "admin.users.role.revoke",
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

export function readRegistrationMode(value: string | undefined): RegistrationMode {
  if (value === "disabled" || value === "invite_only" || value === "public") {
    return value;
  }

  return "public";
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
        'admin.users.role.assign',
        'admin.users.role.revoke'
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
      permissions: new Set(["admin.audit:read", "admin.users:read"]),
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

function readRole(value: unknown): "admin" | "user" {
  return value === "admin" ? "admin" : "user";
}

function readRisk(value: unknown): "critical" | "high" {
  return value === "critical" ? "critical" : "high";
}
