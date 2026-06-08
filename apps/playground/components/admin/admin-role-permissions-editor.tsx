"use client";

import { useActionState, useMemo } from "react";
import {
  createIdleActionFeedbackState,
  type ActionFeedbackState,
  type Locale
} from "../../lib/action-feedback";
import type { AdminRolePermissionRow, AdminRoleRow } from "../../lib/phase2-pages";
import { AdminActionFeedback } from "./admin-action-feedback";

type RolePermissionsAction = (
  previousState: ActionFeedbackState,
  formData: FormData
) => Promise<ActionFeedbackState>;

type AdminRolePermissionsEditorProps = Readonly<{
  csrfToken: string;
  initialState: ActionFeedbackState;
  locale: Locale;
  permissions: readonly AdminRolePermissionRow[];
  role: AdminRoleRow;
  saveRolePermissions: RolePermissionsAction;
}>;

export function AdminRolePermissionsEditor({
  csrfToken,
  initialState,
  locale,
  permissions,
  role,
  saveRolePermissions
}: AdminRolePermissionsEditorProps) {
  const [state, formAction, isPending] = useActionState(
    saveRolePermissions,
    initialState.status === "idle" ? createIdleActionFeedbackState() : initialState
  );
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, AdminRolePermissionRow[]>();

    for (const permission of permissions) {
      const group = groups.get(permission.category) ?? [];

      group.push(permission);
      groups.set(permission.category, group);
    }

    return [...groups.entries()];
  }, [permissions]);

  return (
    <div className="admin-stack">
      <AdminActionFeedback locale={locale} state={state} />
      <div className="admin-summary-card">
        <p className="eyebrow">Role</p>
        <h1>{role.label}</h1>
        <p>{role.description ?? "No description."}</p>
        <ul className="admin-inline-list">
          <li>Key: {role.id}</li>
          <li>Kind: {role.kind}</li>
          <li>Stage: {role.stage}</li>
          <li>Permissions: {role.permissionCount}</li>
        </ul>
      </div>
      <form action={formAction} className="admin-stack">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <input name="roleId" type="hidden" value={role.id} />
        {groupedPermissions.map(([category, categoryPermissions]) => (
          <fieldset className="admin-permission-group" key={category}>
            <legend>{category}</legend>
            <div className="admin-permission-grid">
              {categoryPermissions.map((permission) => (
                <label className="admin-permission-option" key={permission.id}>
                  <input
                    defaultChecked={permission.selected}
                    name="permissionId"
                    type="checkbox"
                    value={permission.id}
                  />
                  <span>
                    <strong>{permission.label}</strong>
                    <small>{permission.id} · {permission.risk}</small>
                    {permission.description !== null ? <em>{permission.description}</em> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label>
          <input name="confirmed" type="checkbox" value="yes" />
          Confirm critical permission changes
        </label>
        <button type="submit" disabled={isPending}>
          Save role permissions
        </button>
      </form>
    </div>
  );
}
