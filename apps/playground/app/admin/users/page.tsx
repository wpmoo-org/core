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

export const dynamic = "force-dynamic";

export async function authorizeAdminUsersPage(context: AdminPageAuthorizeContext) {
  return authorizeAdminPage({ action: "read", resource: "admin.users" }, context);
}

export default async function AdminUsersPage() {
  const page = await loadAdminUsersPage(
    phase2StaticAdminContext,
    createStaticPageQueryClient(phase2AdminUserRows)
  );

  return (
    <main className="shell">
      <section className="proof-panel wide">
        <p className="eyebrow">Admin</p>
        <h1>Users</h1>
        <table className="data-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {page.users.map((user) => (
              <tr key={user.email}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
