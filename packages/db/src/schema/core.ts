import { sql } from "drizzle-orm";
import {
  index,
  integer,
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

const instant = (name: string) => timestamp(name, { withTimezone: true });

export const userLifecycle = pgTable(
  "user_lifecycle",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").default("active").notNull(),
    reason: text("reason"),
    expiresAt: instant("expires_at"),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    updatedAt: instant("updated_at").defaultNow().notNull()
  },
  (table) => [
    index("user_lifecycle_status_idx").on(table.status),
    index("user_lifecycle_updated_by_user_id_idx").on(table.updatedByUserId)
  ]
);

export const role = pgTable("role", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  kind: text("kind").default("custom").notNull(),
  stage: text("stage").default("active").notNull(),
  createdAt: instant("created_at").defaultNow().notNull(),
  updatedAt: instant("updated_at").defaultNow().notNull()
});

export const permission = pgTable("permission", {
  id: text("id").primaryKey(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  label: text("label").notNull(),
  category: text("category"),
  description: text("description"),
  risk: text("risk").default("low").notNull(),
  createdAt: instant("created_at").defaultNow().notNull(),
  updatedAt: instant("updated_at").defaultNow().notNull()
});

export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" })
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
      name: "role_permission_pk"
    }),
    index("role_permission_permission_id_idx").on(table.permissionId)
  ]
);

export const userRole = pgTable(
  "user_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    assignedByUserId: text("assigned_by_user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    assignedAt: instant("assigned_at").defaultNow().notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.roleId],
      name: "user_role_pk"
    }),
    index("user_role_role_id_idx").on(table.roleId),
    index("user_role_assigned_by_user_id_idx").on(table.assignedByUserId)
  ]
);

export const userPermission = pgTable(
  "user_permission",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" }),
    granted: boolean("granted").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    grantedAt: instant("granted_at").defaultNow().notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.permissionId],
      name: "user_permission_pk"
    }),
    index("user_permission_permission_id_idx").on(table.permissionId),
    index("user_permission_granted_by_user_id_idx").on(table.grantedByUserId)
  ]
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    risk: text("risk").default("low").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: instant("created_at").defaultNow().notNull()
  },
  (table) => [
    index("audit_event_created_at_id_idx").on(table.createdAt.desc(), table.id.desc()),
    index("audit_event_actor_user_id_idx").on(table.actorUserId),
    index("audit_event_target_idx").on(table.targetType, table.targetId),
    index("audit_event_action_idx").on(table.action),
    index("audit_event_high_risk_idx")
      .on(table.risk)
      .where(sql`risk in ('high', 'critical')`)
  ]
);

export const systemSetting = pgTable("system_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: instant("updated_at").defaultNow().notNull()
});

export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    scope: text("scope").notNull(),
    identifierHash: text("identifier_hash").notNull(),
    windowStart: instant("window_start").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: instant("expires_at").notNull(),
    updatedAt: instant("updated_at").defaultNow().notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.identifierHash, table.windowStart],
      name: "rate_limit_bucket_pk"
    }),
    index("rate_limit_bucket_expires_at_idx").on(table.expiresAt),
    index("rate_limit_bucket_scope_identifier_idx").on(
      table.scope,
      table.identifierHash
    )
  ]
);

export const coreSchema = {
  userLifecycle,
  role,
  permission,
  rolePermission,
  userRole,
  userPermission,
  auditEvent,
  systemSetting,
  rateLimitBucket
};
