import {
  authorizeAdminPage,
  type AdminPageAuthorizeContext
} from "../../../lib/phase2-access";
import {
  createStaticPageQueryClient,
  loadAdminAuditPage,
  phase2AuditRows,
  phase2StaticAdminContext
} from "../../../lib/phase2-pages";

export const dynamic = "force-dynamic";

export async function authorizeAdminAuditPage(context: AdminPageAuthorizeContext) {
  return authorizeAdminPage({ action: "read", resource: "admin.audit" }, context);
}

export default async function AdminAuditPage() {
  const page = await loadAdminAuditPage(
    phase2StaticAdminContext,
    createStaticPageQueryClient(phase2AuditRows)
  );

  return (
    <main className="shell">
      <section className="proof-panel wide">
        <p className="eyebrow">Admin</p>
        <h1>Audit</h1>
        <table className="data-grid">
          <thead>
            <tr>
              <th>Action</th>
              <th>Target</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {page.auditRows.map((row) => (
              <tr key={`${row.action}:${row.target}`}>
                <td>{row.action}</td>
                <td>{row.target}</td>
                <td>{row.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
