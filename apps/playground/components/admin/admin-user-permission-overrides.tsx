"use client";

import { useActionState } from "react";
import {
  createIdleActionFeedbackState,
  type ActionFeedbackState,
  type Locale
} from "../../lib/action-feedback";
import type { AdminUserAccessPage } from "../../lib/phase2-pages";
import { AdminActionFeedback } from "./admin-action-feedback";

type PermissionOverrideAction = (
  previousState: ActionFeedbackState,
  formData: FormData
) => Promise<ActionFeedbackState>;

type AdminUserPermissionOverridesProps = Readonly<{
  accessPage: AdminUserAccessPage;
  csrfToken: string;
  initialState: ActionFeedbackState;
  locale: Locale;
  saveUserPermissionOverride: PermissionOverrideAction;
}>;

export function AdminUserPermissionOverrides({
  accessPage,
  csrfToken,
  initialState,
  locale,
  saveUserPermissionOverride
}: AdminUserPermissionOverridesProps) {
  const [state, formAction, isPending] = useActionState(
    saveUserPermissionOverride,
    initialState.status === "idle" ? createIdleActionFeedbackState() : initialState
  );

  return (
    <div className="admin-stack">
      <AdminActionFeedback locale={locale} state={state} />
      <div className="admin-summary-card">
        <p className="eyebrow">User access</p>
        <h1>{accessPage.user.name}</h1>
        <p>{accessPage.user.email}</p>
        <ul className="admin-inline-list">
          <li>User ID: {accessPage.user.id}</li>
          <li>
            Roles: {accessPage.user.roles.length > 0 ? accessPage.user.roles.join(", ") : "None"}
          </li>
        </ul>
      </div>
      <div className="admin-access-table" aria-label="User permission overrides">
        {accessPage.permissions.map((permission) => (
          <form action={formAction} className="admin-access-row" key={permission.id}>
            <input name="csrfToken" type="hidden" value={csrfToken} />
            <input name="permissionId" type="hidden" value={permission.id} />
            <input name="targetUserId" type="hidden" value={accessPage.user.id} />
            <div>
              <p><strong>{permission.label}</strong></p>
              <p>{permission.id} · {permission.risk}</p>
              {permission.description !== null ? <p>{permission.description}</p> : null}
            </div>
            <div>
              <p>{permission.effective ? "Allowed" : "Blocked"}</p>
              <ul>
                {permission.sources.length === 0 ? (
                  <li>No grant source</li>
                ) : permission.sources.map((source, index) => (
                  <li key={`${permission.id}-${index}`}>
                    {source.kind === "direct"
                      ? source.grant
                        ? "Direct grant"
                        : "Direct deny (blocking source)"
                      : `Role: ${source.roleLabel}`}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label>
                Override
                <select
                  defaultValue={permission.override ?? "clear"}
                  name="override"
                >
                  <option value="clear">No override</option>
                  <option value="grant">Grant</option>
                  <option value="deny">Deny</option>
                </select>
              </label>
            </div>
            <div>
              <button type="submit" disabled={isPending}>
                Save override
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
