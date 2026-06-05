import { corePermissionCatalog } from "@wpmoo/rbac/catalog";

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

export const corePermissionSeeds =
  corePermissionCatalog satisfies readonly CorePermissionSeed[];

export const coreRolePermissionSeeds = corePermissionSeeds.map((permission) => ({
  roleId: "admin",
  permissionId: permission.id
})) satisfies CoreRolePermissionSeed[];

export const phase2DeferredTables = [
  "user_permission",
  "admin_invitation"
] as const;
