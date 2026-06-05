export type CoreRoleSeed = {
  id: string;
  name: string;
  label: string;
  description: string;
  kind: "system" | "custom";
  stage: "active" | "archived";
};

export type CorePermissionSeed = {
  id: string;
  resource: string;
  action: string;
  label: string;
  category: string;
  description: string;
  risk: "low" | "medium" | "high" | "critical";
};

export type CoreRolePermissionSeed = {
  roleId: string;
  permissionId: string;
};

export const coreRoleSeeds = [
  {
    id: "admin",
    name: "admin",
    label: "Admin",
    description: "System administrator with access to the first secure slice.",
    kind: "system",
    stage: "active"
  },
  {
    id: "user",
    name: "user",
    label: "User",
    description: "Default authenticated user role.",
    kind: "system",
    stage: "active"
  }
] as const satisfies readonly CoreRoleSeed[];

export const corePermissionSeeds = [
  {
    id: "admin.users:read",
    resource: "admin.users",
    action: "read",
    label: "View users",
    category: "Admin users",
    description: "Read the admin users list and user access state.",
    risk: "medium"
  },
  {
    id: "admin.users:update",
    resource: "admin.users",
    action: "update",
    label: "Update users",
    category: "Admin users",
    description: "Assign or revoke roles for users.",
    risk: "high"
  },
  {
    id: "admin.permissions:update",
    resource: "admin.permissions",
    action: "update",
    label: "Manage permission grants",
    category: "Admin users",
    description: "Grant and revoke admin-level permissions.",
    risk: "critical"
  },
  {
    id: "admin.audit:read",
    resource: "admin.audit",
    action: "read",
    label: "View audit events",
    category: "Audit",
    description: "Read security-relevant audit events.",
    risk: "high"
  }
] as const satisfies readonly CorePermissionSeed[];

export const coreRolePermissionSeeds = corePermissionSeeds.map((permission) => ({
  roleId: "admin",
  permissionId: permission.id
})) satisfies CoreRolePermissionSeed[];

export const phase2DeferredTables = [
  "admin_invitation"
] as const;
