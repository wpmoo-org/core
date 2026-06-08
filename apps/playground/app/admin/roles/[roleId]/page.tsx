import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AdminRolePermissionsEditor } from "../../../../../components/admin/admin-role-permissions-editor";
import { createAdminPageContext } from "../../../../../lib/admin-context";
import {
  parseActionFeedbackFromSearchParams,
  parseLocale
} from "../../../../../lib/action-feedback";
import { readRequestCsrfToken } from "../../../../../lib/csrf";
import { createPlaygroundQueryClient } from "../../../../../lib/db";
import { loadAdminRoleEditorPage } from "../../../../../lib/phase2-pages";
import { saveRolePermissions } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Readonly<{
  action?: string | string[];
  code?: string | string[];
  result?: string | string[];
}>;

type AdminRoleEditorPageProps = Readonly<{
  params: Promise<{
    roleId: string;
  }>;
  searchParams?: Promise<SearchParams>;
}>;

export default async function AdminRoleEditorPage({
  params,
  searchParams
}: AdminRoleEditorPageProps) {
  const { roleId } = await params;
  const requestHeaders = await headers();
  const page = await loadAdminRoleEditorPage(
    await createAdminPageContext(),
    createPlaygroundQueryClient(),
    roleId
  );

  if (page === null) {
    notFound();
  }

  return (
    <section className="admin-panel">
      <AdminRolePermissionsEditor
        csrfToken={readRequestCsrfToken(requestHeaders)}
        initialState={parseActionFeedbackFromSearchParams(await Promise.resolve(searchParams))}
        locale={parseLocale(requestHeaders.get("x-wpmoo-locale") ?? undefined)}
        permissions={page.permissions}
        role={page.role}
        saveRolePermissions={saveRolePermissions}
      />
    </section>
  );
}
