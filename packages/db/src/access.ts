export type LifecycleStatus = "active" | "suspended" | "banned";

export type EffectiveAccess = Readonly<{
  lifecycle: Readonly<{
    expiresAt?: Date | null;
    status: LifecycleStatus;
  }>;
  permissions: ReadonlySet<string>;
  userId: string;
}>;

export type DbQueryResult<Row extends Record<string, unknown>> = Readonly<{
  rowCount: number | null;
  rows: readonly Row[];
}>;

export type DbQueryClient = Readonly<{
  query<Row extends Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<DbQueryResult<Row>>;
}>;

type EffectiveAccessRow = {
  expires_at: Date | string | null;
  permission_id: string | null;
  granted: boolean | null;
  source: string | null;
  status: LifecycleStatus | null;
};

export async function loadEffectiveAccess(
  client: DbQueryClient,
  userId: string
): Promise<EffectiveAccess> {
  const result = await client.query<EffectiveAccessRow>(
    `
      SELECT
        COALESCE(user_lifecycle.status, 'active') AS status,
        user_lifecycle.expires_at,
        permissions.permission_id,
        permissions.granted,
        permissions.source
      FROM "user"
      LEFT JOIN user_lifecycle
        ON user_lifecycle.user_id = "user".id
      LEFT JOIN (
        SELECT
          permission_id,
          granted,
          'direct' AS source
        FROM user_permission
        WHERE user_permission.user_id = $1
        UNION ALL
        SELECT
          role_permission.permission_id,
          true AS granted,
          'role' AS source
        FROM user_role
        INNER JOIN role
          ON role.id = user_role.role_id
          AND role.stage = 'active'
        INNER JOIN role_permission
          ON role_permission.role_id = role.id
        WHERE user_role.user_id = $1
      ) AS permissions
        ON TRUE
      WHERE "user".id = $1
    `,
    [userId]
  );
  const firstRow = result.rows[0];
  const directDenials = new Set<string>();
  const directGrants = new Set<string>();
  const roleGrants = new Set<string>();

  for (const row of result.rows) {
    if (row.permission_id === null) {
      continue;
    }

    if (row.source === "direct" && row.granted === false) {
      directDenials.add(row.permission_id);
      directGrants.delete(row.permission_id);
      continue;
    }

    if (row.source === "direct" && row.granted === true) {
      directGrants.add(row.permission_id);
      continue;
    }

    if (row.source === "role" && row.granted) {
      roleGrants.add(row.permission_id);
    }
  }

  const permissions = new Set([
    ...directGrants,
    ...Array.from(roleGrants)
  ].filter((permissionId) => !directDenials.has(permissionId)));

  return {
    lifecycle: {
      expiresAt: toDate(firstRow?.expires_at ?? null),
      status: firstRow?.status ?? "active"
    },
    permissions,
    userId
  };
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}
