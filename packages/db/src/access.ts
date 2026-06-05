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
        permission.id AS permission_id
      FROM "user"
      LEFT JOIN user_lifecycle
        ON user_lifecycle.user_id = "user".id
      LEFT JOIN user_role
        ON user_role.user_id = "user".id
      LEFT JOIN role
        ON role.id = user_role.role_id
        AND role.stage = 'active'
      LEFT JOIN role_permission
        ON role_permission.role_id = role.id
      LEFT JOIN permission
        ON permission.id = role_permission.permission_id
      WHERE "user".id = $1
    `,
    [userId]
  );
  const firstRow = result.rows[0];

  return {
    lifecycle: {
      expiresAt: toDate(firstRow?.expires_at ?? null),
      status: firstRow?.status ?? "active"
    },
    permissions: new Set(
      result.rows
        .map((row) => row.permission_id)
        .filter((permissionId): permissionId is string => permissionId !== null)
    ),
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
