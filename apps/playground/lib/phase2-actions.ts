import { timingSafeEqual } from "node:crypto";
import { recordAuditEvent } from "@wpmoo/audit";
import type { AuthorizedActor } from "@wpmoo/rbac";
import type { RateLimiter } from "@wpmoo/rate-limit";
import { z } from "zod";
import { action, type ActionAuthorizeInput } from "./action";

const ADMIN_PERMISSION_MANAGER_PERMISSION_ID = "admin.permissions:update";
const RBAC_CRITICAL_LOCK_KEY = "rbac:critical";

type RateLimitOptions = Readonly<{
  limit: number;
  windowSeconds: number;
}>;

export type BootstrapTransactionClient = Readonly<{
  query(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<{ rowCount: number | null; rows: readonly Record<string, unknown>[] }>;
}>;

export type BootstrapTransaction = <Result>(
  callback: (client: BootstrapTransactionClient) => Promise<Result>
) => Promise<Result>;

export type CreateLoginActionOptions = Readonly<{
  rateLimit: RateLimitOptions;
  rateLimiter: RateLimiter;
}>;

export type CreateBootstrapClaimActionOptions = Readonly<{
  adminBootstrapToken: string;
  authorize: (
    input: ActionAuthorizeInput<BootstrapClaimInput>
  ) => Promise<AuthorizedActor>;
  rateLimit: RateLimitOptions;
  rateLimiter: RateLimiter;
  transaction: BootstrapTransaction;
}>;

export type CreateRoleActionOptions = Readonly<{
  authorize: (input: ActionAuthorizeInput<RoleMutationInput>) => Promise<AuthorizedActor>;
  transaction: BootstrapTransaction;
}>;

export type CreateRolePermissionActionOptions = Readonly<{
  authorize: (
    input: ActionAuthorizeInput<RolePermissionSaveInput>
  ) => Promise<AuthorizedActor>;
  transaction: BootstrapTransaction;
}>;

export type CreateUserPermissionOverrideActionOptions = Readonly<{
  authorize: (
    input: ActionAuthorizeInput<UserPermissionOverrideInput>
  ) => Promise<AuthorizedActor>;
  transaction: BootstrapTransaction;
}>;

const loginSchema = z.object({
  clientIp: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1)
});

const bootstrapClaimSchema = z.object({
  clientIp: z.string().min(1),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  token: z.string().min(32)
});

type BootstrapClaimInput = z.infer<typeof bootstrapClaimSchema>;

const roleMutationSchema = z.object({
  clientIp: z.string().min(1),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  roleId: z.enum(["admin", "user"]),
  targetUserId: z.string().min(1)
});

type RoleMutationInput = z.infer<typeof roleMutationSchema>;

const rolePermissionSaveSchema = z.object({
  clientIp: z.string().min(1),
  confirmed: z.literal("yes"),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  permissionIds: z.array(z.string().min(1)),
  roleId: z.string().min(1)
});

type RolePermissionSaveInput = z.infer<typeof rolePermissionSaveSchema>;

const userPermissionOverrideSchema = z.object({
  clientIp: z.string().min(1),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  override: z.enum(["clear", "deny", "grant"]),
  permissionId: z.string().min(1),
  targetUserId: z.string().min(1)
});

type UserPermissionOverrideInput = z.infer<typeof userPermissionOverrideSchema>;

export function createLoginAction(options: CreateLoginActionOptions) {
  return action("auth.login", {
    authorize: async () => ({
      sessionId: "anonymous",
      userId: "anonymous"
    }),
    handler: async ({ input }) => {
      await enforceRateLimit(options.rateLimiter, options.rateLimit, {
        scope: "auth.login",
        subject: {
          type: "ip",
          value: input.clientIp
        }
      });

      throw { code: "auth.invalid_credentials" };
    },
    schema: loginSchema
  });
}

export function createBootstrapClaimAction(
  options: CreateBootstrapClaimActionOptions
) {
  return action("bootstrap.claim", {
    authorize: options.authorize,
    handler: async ({ actor, input }) => {
      await enforceRateLimit(options.rateLimiter, options.rateLimit, {
        scope: "auth.bootstrap",
        subject: {
          type: "ip",
          value: input.clientIp
        }
      });

      if (!constantTimeEquals(input.token, options.adminBootstrapToken)) {
        throw { code: "bootstrap.invalid_or_used" };
      }

      await options.transaction(async (client) => {
        const lock = await client.query(
          `
            INSERT INTO system_setting (key, value)
            VALUES ('bootstrap_used', 'pending')
            ON CONFLICT (key) DO NOTHING
            RETURNING key
          `
        );

        if (lock.rowCount !== 1) {
          throw { code: "bootstrap.invalid_or_used" };
        }

        await client.query(
          `
            INSERT INTO user_role (user_id, role_id, assigned_by_user_id)
            VALUES ($1, 'admin', $1)
            ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [actor.userId]
        );
        await recordAuditEvent(client, {
          action: "system.admin.bootstrap",
          actorUserId: actor.userId,
          ipAddress: input.clientIp,
          metadata: {
            roleId: "admin"
          },
          risk: "critical",
          targetId: actor.userId,
          targetType: "user"
        });
        await client.query(
          `
            UPDATE system_setting
            SET value = 'true', updated_at = now()
            WHERE key = 'bootstrap_used'
          `
        );
      });

      return {
        claimed: true
      };
    },
    schema: bootstrapClaimSchema
  });
}

export function createAssignRoleAction(options: CreateRoleActionOptions) {
  return action("admin.users.role.assign", {
    authorize: options.authorize,
    handler: async ({ actor, input }) => {
      const assigned = await options.transaction(async (client) => {
        const roleStage = await loadRoleStage(client, input.roleId);

        if (roleStage === null) {
          throw { code: "system.unexpected" };
        }

        if (roleStage === "archived") {
          throw { code: "auth.forbidden" };
        }

        const grantsPermissionManager = await roleGrantsPermissionManager(
          client,
          input.roleId
        );

        if (grantsPermissionManager) {
          await acquireRbacCriticalLock(client);

          if (!actor.permissions.has(ADMIN_PERMISSION_MANAGER_PERMISSION_ID)) {
            throw { code: "auth.forbidden" };
          }
        }

        const assignment = await client.query(
          `
            INSERT INTO user_role (user_id, role_id, assigned_by_user_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [input.targetUserId, input.roleId, actor.userId]
        );

        if (assignment.rowCount !== 1) {
          return false;
        }

        await recordAuditEvent(client, {
          action: "rbac.role.grant",
          actorUserId: actor.userId,
          ipAddress: input.clientIp,
          metadata: {
            roleId: input.roleId
          },
          risk: "high",
          targetId: input.targetUserId,
          targetType: "user"
        });

        return true;
      });

      return {
        assigned
      };
    },
    schema: roleMutationSchema
  });
}

export function createRevokeRoleAction(options: CreateRoleActionOptions) {
  return action("admin.users.role.revoke", {
    authorize: options.authorize,
    handler: async ({ actor, input }) => {
      const revoked = await options.transaction(async (client) => {
        const grantsPermissionManager = await roleGrantsPermissionManager(
          client,
          input.roleId
        );
        const requiresCriticalGuard =
          input.roleId === "admin" || grantsPermissionManager;

        if (requiresCriticalGuard) {
          await acquireRbacCriticalLock(client);

          if (grantsPermissionManager && input.targetUserId === actor.userId) {
            throw { code: "auth.forbidden" };
          }

          if (input.roleId === "admin") {
            const adminCount = await client.query(
              `
                SELECT COUNT(*) AS count
                FROM user_role
                INNER JOIN "user"
                  ON "user".id = user_role.user_id
                INNER JOIN role
                  ON role.id = user_role.role_id
                  AND role.stage = 'active'
                LEFT JOIN user_lifecycle
                  ON user_lifecycle.user_id = "user".id
                WHERE role_id = 'admin'
                  AND (
                    COALESCE(user_lifecycle.status, 'active') = 'active'
                    OR user_lifecycle.expires_at <= now()
                  )
              `
            );

            if (readCount(adminCount.rows[0]?.count) <= 1) {
              throw { code: "auth.forbidden" };
            }
          }

          if (grantsPermissionManager) {
            const permissionManagerCount = await countPermissionManagersExcludingUser(
              client,
              ADMIN_PERMISSION_MANAGER_PERMISSION_ID,
              input.targetUserId
            );

            if (permissionManagerCount <= 0) {
              throw { code: "auth.forbidden" };
            }
          }
        }

        const revocation = await client.query(
          `
            DELETE FROM user_role
            WHERE user_id = $1 AND role_id = $2
          `,
          [input.targetUserId, input.roleId]
        );

        if (revocation.rowCount !== 1) {
          return false;
        }

        await recordAuditEvent(client, {
          action: "rbac.role.revoke",
          actorUserId: actor.userId,
          ipAddress: input.clientIp,
          metadata: {
            roleId: input.roleId
          },
          risk: "high",
          targetId: input.targetUserId,
          targetType: "user"
        });

        return true;
      });

      return {
        revoked
      };
    },
    schema: roleMutationSchema
  });
}

export function createSaveRolePermissionsAction(
  options: CreateRolePermissionActionOptions
) {
  return action("admin.roles.permissions.save", {
    authorize: options.authorize,
    handler: async ({ actor, input }) => {
      const saved = await options.transaction(async (client) => {
        await acquireRbacCriticalLock(client);

        const roleStage = await loadRoleStage(client, input.roleId);

        if (roleStage === null) {
          throw { code: "system.unexpected" };
        }

        if (roleStage === "archived") {
          throw { code: "auth.forbidden" };
        }

        const currentPermissionIds = await loadRolePermissionIds(
          client,
          input.roleId
        );
        const nextPermissionIds = uniquePermissionIds(input.permissionIds);

        if (samePermissionSet(currentPermissionIds, nextPermissionIds)) {
          return false;
        }

        const removesPermissionManager =
          currentPermissionIds.includes(ADMIN_PERMISSION_MANAGER_PERMISSION_ID) &&
          !nextPermissionIds.includes(ADMIN_PERMISSION_MANAGER_PERMISSION_ID);

        if (removesPermissionManager) {
          const permissionManagerState =
            await countPermissionManagersAfterRolePermissionSave(
              client,
              input.roleId,
              nextPermissionIds,
              actor.userId
            );

          if (
            permissionManagerState.count <= 0 ||
            !permissionManagerState.actorRetainsPermission
          ) {
            throw { code: "auth.forbidden" };
          }
        }

        await client.query(
          `
            DELETE FROM role_permission
            WHERE role_id = $1
          `,
          [input.roleId]
        );

        if (nextPermissionIds.length > 0) {
          await client.query(
            `
              INSERT INTO role_permission (role_id, permission_id)
              SELECT $1, permission_id
              FROM unnest($2::text[]) AS permissions(permission_id)
              ON CONFLICT (role_id, permission_id) DO NOTHING
            `,
            [input.roleId, nextPermissionIds]
          );
        }

        await recordAuditEvent(client, {
          action: "rbac.role_permissions.save",
          actorUserId: actor.userId,
          ipAddress: input.clientIp,
          metadata: {
            nextPermissionIds,
            previousPermissionIds: currentPermissionIds,
            roleId: input.roleId
          },
          risk: "critical",
          targetId: input.roleId,
          targetType: "role"
        });

        return true;
      });

      return {
        saved
      };
    },
    schema: rolePermissionSaveSchema
  });
}

export function createSetUserPermissionOverrideAction(
  options: CreateUserPermissionOverrideActionOptions
) {
  return action("admin.users.permissions.override", {
    authorize: options.authorize,
    handler: async ({ actor, input }) => {
      const saved = await options.transaction(async (client) => {
        const isPermissionManagerOverride =
          input.permissionId === ADMIN_PERMISSION_MANAGER_PERMISSION_ID;

        if (isPermissionManagerOverride) {
          await acquireRbacCriticalLock(client);
        }

        const currentOverride = await loadUserPermissionOverride(
          client,
          input.targetUserId,
          input.permissionId
        );

        if (overrideUnchanged(currentOverride, input.override)) {
          return false;
        }

        if (isPermissionManagerOverride && input.override !== "grant") {
          const permissionManagerState =
            await countPermissionManagersAfterUserPermissionOverride(
              client,
              input.targetUserId,
              input.override,
              actor.userId
            );

          if (
            permissionManagerState.count <= 0 ||
            (
              input.targetUserId === actor.userId &&
              !permissionManagerState.actorRetainsPermission
            )
          ) {
            throw { code: "auth.forbidden" };
          }
        }

        if (input.override === "clear") {
          await client.query(
            `
              DELETE FROM user_permission
              WHERE user_id = $1 AND permission_id = $2
            `,
            [input.targetUserId, input.permissionId]
          );
        } else {
          await client.query(
            `
              INSERT INTO user_permission (
                user_id,
                permission_id,
                granted,
                granted_by_user_id
              )
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (user_id, permission_id)
              DO UPDATE SET
                granted = EXCLUDED.granted,
                granted_by_user_id = EXCLUDED.granted_by_user_id,
                granted_at = now()
            `,
            [
              input.targetUserId,
              input.permissionId,
              input.override === "grant",
              actor.userId
            ]
          );
        }

        await recordAuditEvent(client, {
          action:
            input.override === "grant"
              ? "rbac.permission_override.grant"
              : input.override === "deny"
                ? "rbac.permission_override.deny"
                : "rbac.permission_override.clear",
          actorUserId: actor.userId,
          ipAddress: input.clientIp,
          metadata: {
            nextOverride: input.override,
            permissionId: input.permissionId,
            previousOverride: currentOverride
          },
          risk: isPermissionManagerOverride ? "critical" : "high",
          targetId: input.targetUserId,
          targetType: "user"
        });

        return true;
      });

      return {
        saved
      };
    },
    schema: userPermissionOverrideSchema
  });
}

async function countPermissionManagersExcludingUser(
  client: BootstrapTransactionClient,
  permissionId: string,
  excludedUserId: string
): Promise<number> {
  const permissionManagerHolders = await client.query(
    `
      WITH lifecycle_users AS (
        SELECT "user".id AS user_id
        FROM "user"
        LEFT JOIN user_lifecycle
          ON user_lifecycle.user_id = "user".id
        WHERE
          COALESCE(user_lifecycle.status, 'active') = 'active'
          OR user_lifecycle.expires_at <= now()
      ),
      direct_grants AS (
        SELECT user_id
        FROM user_permission
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_permission.user_id
        WHERE permission_id = $1
          AND granted = true
      ),
      direct_denies AS (
        SELECT user_id
        FROM user_permission
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_permission.user_id
        WHERE permission_id = $1
          AND granted = false
      ),
      role_grants AS (
        SELECT DISTINCT user_role.user_id
        FROM user_role
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_role.user_id
        INNER JOIN role_permission
          ON role_permission.role_id = user_role.role_id
        INNER JOIN role
          ON role.id = user_role.role_id
          AND role.stage = 'active'
        WHERE role_permission.permission_id = $1
      ),
      effective_permissions AS (
        SELECT user_id FROM direct_grants
        UNION
        SELECT user_id FROM role_grants
      )
      SELECT COUNT(*) AS count
      FROM (
        SELECT user_id
        FROM effective_permissions
        EXCEPT
        SELECT user_id FROM direct_denies
      ) AS permission_managers
      WHERE user_id <> $2
    `,
    [permissionId, excludedUserId]
  );

  return readCount(permissionManagerHolders.rows[0]?.count);
}

async function countPermissionManagersAfterRolePermissionSave(
  client: BootstrapTransactionClient,
  roleId: string,
  permissionIds: readonly string[],
  actorUserId: string
): Promise<{ actorRetainsPermission: boolean; count: number }> {
  const permissionManagerHolders = await client.query(
    `
      WITH lifecycle_users AS (
        SELECT "user".id AS user_id
        FROM "user"
        LEFT JOIN user_lifecycle
          ON user_lifecycle.user_id = "user".id
        WHERE
          COALESCE(user_lifecycle.status, 'active') = 'active'
          OR user_lifecycle.expires_at <= now()
      ),
      saved_role_permission AS (
        SELECT $1::text AS role_id, permission_id
        FROM unnest($2::text[]) AS permissions(permission_id)
      ),
      effective_role_permission AS (
        SELECT role_id, permission_id
        FROM role_permission
        WHERE role_id <> $1
        UNION ALL
        SELECT role_id, permission_id
        FROM saved_role_permission
      ),
      direct_grants AS (
        SELECT user_id
        FROM user_permission
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_permission.user_id
        WHERE permission_id = $3
          AND granted = true
      ),
      direct_denies AS (
        SELECT user_id
        FROM user_permission
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_permission.user_id
        WHERE permission_id = $3
          AND granted = false
      ),
      role_grants AS (
        SELECT DISTINCT user_role.user_id
        FROM user_role
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_role.user_id
        INNER JOIN role
          ON role.id = user_role.role_id
          AND role.stage = 'active'
        INNER JOIN effective_role_permission
          ON effective_role_permission.role_id = user_role.role_id
        WHERE effective_role_permission.permission_id = $3
      ),
      effective_permissions AS (
        SELECT user_id FROM direct_grants
        UNION
        SELECT user_id FROM role_grants
      ),
      permission_managers AS (
        SELECT user_id
        FROM effective_permissions
        EXCEPT
        SELECT user_id FROM direct_denies
      )
      SELECT
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE user_id = $4) AS actor_count
      FROM permission_managers
    `,
    [
      roleId,
      permissionIds,
      ADMIN_PERMISSION_MANAGER_PERMISSION_ID,
      actorUserId
    ]
  );

  return {
    actorRetainsPermission:
      readCount(permissionManagerHolders.rows[0]?.actor_count) > 0,
    count: readCount(permissionManagerHolders.rows[0]?.count)
  };
}

async function countPermissionManagersAfterUserPermissionOverride(
  client: BootstrapTransactionClient,
  targetUserId: string,
  override: "clear" | "deny" | "grant",
  actorUserId: string
): Promise<{ actorRetainsPermission: boolean; count: number }> {
  const permissionManagerHolders = await client.query(
    `
      WITH lifecycle_users AS (
        SELECT "user".id AS user_id
        FROM "user"
        LEFT JOIN user_lifecycle
          ON user_lifecycle.user_id = "user".id
        WHERE
          COALESCE(user_lifecycle.status, 'active') = 'active'
          OR user_lifecycle.expires_at <= now()
      ),
      proposed_override AS (
        SELECT
          $1::text AS user_id,
          $3::text AS permission_id,
          CASE
            WHEN $2 = 'grant' THEN true
            WHEN $2 = 'deny' THEN false
            ELSE null
          END AS granted
        WHERE $2 <> 'clear'
      ),
      direct_overrides AS (
        SELECT user_id, permission_id, granted
        FROM user_permission
        WHERE permission_id = $3
          AND user_id <> $1
        UNION ALL
        SELECT user_id, permission_id, granted
        FROM proposed_override
      ),
      direct_grants AS (
        SELECT user_id
        FROM direct_overrides
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = direct_overrides.user_id
        WHERE granted = true
      ),
      direct_denies AS (
        SELECT user_id
        FROM direct_overrides
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = direct_overrides.user_id
        WHERE granted = false
      ),
      role_grants AS (
        SELECT DISTINCT user_role.user_id
        FROM user_role
        INNER JOIN lifecycle_users
          ON lifecycle_users.user_id = user_role.user_id
        INNER JOIN role_permission
          ON role_permission.role_id = user_role.role_id
        INNER JOIN role
          ON role.id = user_role.role_id
          AND role.stage = 'active'
        WHERE role_permission.permission_id = $3
      ),
      effective_permissions AS (
        SELECT user_id FROM direct_grants
        UNION
        SELECT user_id FROM role_grants
      ),
      permission_managers AS (
        SELECT user_id
        FROM effective_permissions
        EXCEPT
        SELECT user_id FROM direct_denies
      )
      SELECT
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE user_id = $4) AS actor_count
      FROM permission_managers
    `,
    [
      targetUserId,
      override,
      ADMIN_PERMISSION_MANAGER_PERMISSION_ID,
      actorUserId
    ]
  );

  return {
    actorRetainsPermission:
      readCount(permissionManagerHolders.rows[0]?.actor_count) > 0,
    count: readCount(permissionManagerHolders.rows[0]?.count)
  };
}

async function loadRolePermissionIds(
  client: BootstrapTransactionClient,
  roleId: string
): Promise<string[]> {
  const rolePermissions = await client.query(
    `
      SELECT permission_id
      FROM role_permission
      WHERE role_id = $1
      ORDER BY permission_id
    `,
    [roleId]
  );

  return rolePermissions.rows
    .map((row) => row.permission_id)
    .filter((permissionId): permissionId is string => typeof permissionId === "string");
}

async function loadRoleStage(
  client: BootstrapTransactionClient,
  roleId: string
): Promise<string | null> {
  const role = await client.query(
    `
      SELECT stage
      FROM role
      WHERE id = $1
    `,
    [roleId]
  );

  return (role.rows[0]?.stage as string | undefined) ?? null;
}

async function loadUserPermissionOverride(
  client: BootstrapTransactionClient,
  userId: string,
  permissionId: string
): Promise<"deny" | "grant" | null> {
  const override = await client.query(
    `
      SELECT granted
      FROM user_permission
      WHERE user_id = $1 AND permission_id = $2
    `,
    [userId, permissionId]
  );
  const granted = override.rows[0]?.granted;

  if (granted === true) {
    return "grant";
  }

  if (granted === false) {
    return "deny";
  }

  return null;
}

async function roleGrantsPermissionManager(
  client: BootstrapTransactionClient,
  roleId: string
): Promise<boolean> {
  const rolePermission = await client.query(
    `
      SELECT EXISTS(
        SELECT 1
        FROM role_permission
        INNER JOIN role
          ON role.id = role_permission.role_id
          AND role.stage = 'active'
        WHERE role_permission.role_id = $1
          AND role_permission.permission_id = $2
      ) AS grants_permission_manager
    `,
    [roleId, ADMIN_PERMISSION_MANAGER_PERMISSION_ID]
  );

  return (rolePermission.rows[0]?.grants_permission_manager as boolean | undefined) ??
    false;
}

async function acquireRbacCriticalLock(client: BootstrapTransactionClient) {
  await client.query(
    `
      SELECT pg_advisory_xact_lock(hashtext($1))
    `,
    [RBAC_CRITICAL_LOCK_KEY]
  );
}

async function enforceRateLimit(
  limiter: RateLimiter,
  options: RateLimitOptions,
  input: Pick<Parameters<RateLimiter["check"]>[0], "scope" | "subject">
) {
  const result = await limiter.check({
    limit: options.limit,
    scope: input.scope,
    subject: input.subject,
    windowSeconds: options.windowSeconds
  });

  if (!result.allowed) {
    throw { code: "auth.rate_limited" };
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

function readCount(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isFinite(value)) {
      throw { code: "system.unexpected" };
    }

    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      throw { code: "system.unexpected" };
    }

    return parsed;
  }

  if (typeof value === "bigint") {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || !Number.isFinite(parsed)) {
      throw { code: "system.unexpected" };
    }

    return parsed;
  }

  throw { code: "system.unexpected" };
}

function overrideUnchanged(
  currentOverride: "deny" | "grant" | null,
  nextOverride: "clear" | "deny" | "grant"
): boolean {
  if (nextOverride === "clear") {
    return currentOverride === null;
  }

  return currentOverride === nextOverride;
}

function samePermissionSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftIds = [...left].sort();
  const rightIds = [...right].sort();

  return leftIds.every((permissionId, index) => permissionId === rightIds[index]);
}

function uniquePermissionIds(permissionIds: readonly string[]): string[] {
  return [...new Set(permissionIds)].sort();
}
