import { randomUUID } from "node:crypto";

export type AuditRisk = "low" | "medium" | "high" | "critical";

export type AuditMetadata = Readonly<Record<string, unknown>>;

export type AuditEventInput = Readonly<{
  action: string;
  actorUserId: string | null;
  id?: string;
  ipAddress?: string | null;
  metadata?: AuditMetadata | null;
  risk: AuditRisk;
  targetId?: string | null;
  targetType?: string | null;
  time?: Date;
}>;

export type AuditQueryClient = Readonly<{
  query(
    sql: string,
    parameters?: readonly unknown[]
  ): Promise<{ rowCount: number | null }>;
}>;

export type RecordAuditEventResult = Readonly<{
  id: string;
}>;

const sensitiveMetadataKeyPattern =
  /authorization|bearer|cookie|credential|email|ip|jwt|key|password|secret|session|token/i;

export async function recordAuditEvent(
  client: AuditQueryClient,
  input: AuditEventInput
): Promise<RecordAuditEventResult> {
  const id = input.id ?? randomUUID();

  await client.query(
    `
      INSERT INTO audit_event (
        id,
        actor_user_id,
        action,
        target_type,
        target_id,
        risk,
        metadata,
        ip_address,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      id,
      input.actorUserId,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.risk,
      sanitizeAuditMetadata(input.metadata ?? null),
      input.ipAddress ?? null,
      input.time ?? new Date()
    ]
  );

  return { id };
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveMetadataKeyPattern.test(key)
          ? "[REDACTED]"
          : sanitizeAuditMetadata(entry)
      ])
    );
  }

  return value;
}
