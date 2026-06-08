import Link from "next/link";
import { headers } from "next/headers";
import { createAdminPageContext } from "../../../../lib/admin-context";
import { createPlaygroundQueryClient } from "../../../../lib/db";
import { loadAdminRolesPage } from "../../../../lib/phase2-pages";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const requestHeaders = await headers();
  const localePrefix = requestHeaders.get("x-wpmoo-locale") === "de" ? "/de" : "";
  const page = await loadAdminRolesPage(
    await createAdminPageContext(),
    createPlaygroundQueryClient()
  );

  return (
    <section className="admin-panel admin-stack">
      <div>
        <p className="eyebrow">Admin</p>
        <h1>Roles</h1>
        <p>Review role permission sets before binding critical changes.</p>
      </div>
      <div className="admin-access-table" aria-label="Admin roles">
        {page.roles.map((role) => (
          <div className="admin-access-row" key={role.id}>
            <div>
              <p><strong>{role.label}</strong></p>
              <p>{role.name} · {role.kind} · {role.stage}</p>
              {role.description !== null ? <p>{role.description}</p> : null}
            </div>
            <div>
              <p>{role.permissionCount} permissions</p>
            </div>
            <div>
              <Link className="admin-link" href={`${localePrefix}/admin/roles/${role.id}`}>
                Edit permissions
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
