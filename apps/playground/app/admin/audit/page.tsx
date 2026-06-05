import {
  authorizeAdminPage,
  type AdminPageAuthorizeContext
} from "../../../lib/phase2-access";

export const dynamic = "force-dynamic";

const auditRows = [
  {
    action: "system.admin.bootstrap",
    risk: "critical",
    target: "user:admin"
  },
  {
    action: "admin.users.role.assign",
    risk: "high",
    target: "user:core"
  }
];

export async function authorizeAdminAuditPage(context: AdminPageAuthorizeContext) {
  return authorizeAdminPage({ action: "read", resource: "admin.audit" }, context);
}

export default function AdminAuditPage() {
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
            {auditRows.map((row) => (
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
