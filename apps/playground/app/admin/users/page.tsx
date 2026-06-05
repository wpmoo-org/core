export const dynamic = "force-dynamic";

const users = [
  {
    email: "admin@example.test",
    name: "Admin User",
    role: "admin"
  },
  {
    email: "user@example.test",
    name: "Core User",
    role: "user"
  }
];

export default function AdminUsersPage() {
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
            {users.map((user) => (
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
