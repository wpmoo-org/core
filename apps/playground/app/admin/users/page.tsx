import { headers } from "next/headers";

import {
  authorizeAdminPage,
  type AdminPageAuthorizeContext
} from "../../../lib/phase2-access";
import {
  createStaticPageQueryClient,
  loadAdminUsersPage,
  phase2AdminUserRows,
  phase2StaticAdminContext
} from "../../../lib/phase2-pages";
import { AdminUserRoles } from "../../../components/admin/admin-user-roles";
import {
  parseActionFeedbackFromSearchParams,
  parseLocale
} from "../../../lib/action-feedback";

export const dynamic = "force-dynamic";

type SearchParams = Readonly<{
  action?: string | string[];
  code?: string | string[];
  result?: string | string[];
}>;

type AdminUsersPageProps = Readonly<{
  searchParams?: SearchParams | Promise<SearchParams>;
}>;

export async function authorizeAdminUsersPage(context: AdminPageAuthorizeContext) {
  return authorizeAdminPage({ action: "read", resource: "admin.users" }, context);
}

export default async function AdminUsersPage({
  searchParams
}: AdminUsersPageProps = {}) {
  const requestLocale = parseLocale(
    (await headers()).get("x-wpmoo-locale") ?? undefined
  );
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const initialState = parseActionFeedbackFromSearchParams(resolvedSearchParams);

  const page = await loadAdminUsersPage(
    phase2StaticAdminContext,
    createStaticPageQueryClient(phase2AdminUserRows)
  );

  return (
    <section className="admin-panel">
      <p className="eyebrow">Admin</p>
      <h1>Users</h1>
      <AdminUserRoles
        initialState={initialState}
        locale={requestLocale}
        users={page.users}
      />
    </section>
  );
}
