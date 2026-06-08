import { headers } from "next/headers";

import { createAdminPageContext } from "../../../lib/admin-context";
import { createPlaygroundQueryClient } from "../../../lib/db";
import { readRequestCsrfToken } from "../../../lib/csrf";
import { loadAdminUsersPage } from "../../../lib/phase2-pages";
import { AdminUserRoles } from "../../../components/admin/admin-user-roles";
import {
  parseActionFeedbackFromSearchParams,
  parseLocale
} from "../../../lib/action-feedback";
import {
  assignAdminRole,
  bulkAssignAdminRole,
  revokeAdminRole
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Readonly<{
  action?: string | string[];
  code?: string | string[];
  result?: string | string[];
}>;

type AdminUsersPageProps = Readonly<{
  searchParams?: Promise<SearchParams>;
}>;

export default async function AdminUsersPage({
  searchParams
}: AdminUsersPageProps) {
  const requestHeaders = await headers();
  const requestLocale = parseLocale(
    requestHeaders.get("x-wpmoo-locale") ?? undefined
  );
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const initialState = parseActionFeedbackFromSearchParams(resolvedSearchParams);
  const csrfToken = readRequestCsrfToken(requestHeaders);
  const page = await loadAdminUsersPage(
    await createAdminPageContext(),
    createPlaygroundQueryClient()
  );

  return (
    <section className="admin-panel">
      <p className="eyebrow">Admin</p>
      <h1>Users</h1>
      <AdminUserRoles
        assignAdminRole={assignAdminRole}
        bulkAssignAdminRole={bulkAssignAdminRole}
        csrfToken={csrfToken}
        initialState={initialState}
        locale={requestLocale}
        revokeAdminRole={revokeAdminRole}
        users={page.users}
      />
    </section>
  );
}
