export type PermissionRisk = "low" | "medium" | "high" | "critical";

export type PermissionCatalogEntry = Readonly<{
  id: string;
  resource: string;
  action: string;
  label: string;
  category: string;
  description: string;
  risk: PermissionRisk;
}>;

export const corePermissionCatalog = [
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
] as const satisfies readonly PermissionCatalogEntry[];
