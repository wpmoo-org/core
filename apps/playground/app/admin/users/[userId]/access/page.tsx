import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AdminUserPermissionOverrides } from "../../../../../../components/admin/admin-user-permission-overrides";
import { createAdminPageContext } from "../../../../../../lib/admin-context";
import {
  parseActionFeedbackFromSearchParams,
  parseLocale
} from "../../../../../../lib/action-feedback";
import { readRequestCsrfToken } from "../../../../../../lib/csrf";
import { createPlaygroundQueryClient } from "../../../../../../lib/db";
import { loadAdminUserAccessPage } from "../../../../../../lib/phase2-pages";
import { saveUserPermissionOverride } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Readonly<{
  action?: string | string[];
  code?: string | string[];
  result?: string | string[];
}>;

type AdminUserAccessPageProps = Readonly<{
  params: Promise<{
    userId: string;
  }>;
  searchParams?: Promise<SearchParams>;
}>;

export default async function AdminUserAccessPage({
  params,
  searchParams
}: AdminUserAccessPageProps) {
  const { userId } = await params;
  const requestHeaders = await headers();
  const accessPage = await loadAdminUserAccessPage(
    await createAdminPageContext(),
    createPlaygroundQueryClient(),
    userId
  );

  if (accessPage === null) {
    notFound();
  }

  return (
    <section className="admin-panel">
      <AdminUserPermissionOverrides
        accessPage={accessPage}
        csrfToken={readRequestCsrfToken(requestHeaders)}
        initialState={parseActionFeedbackFromSearchParams(await Promise.resolve(searchParams))}
        locale={parseLocale(requestHeaders.get("x-wpmoo-locale") ?? undefined)}
        saveUserPermissionOverride={saveUserPermissionOverride}
      />
    </section>
  );
}
