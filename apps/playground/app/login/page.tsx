export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="shell">
      <section className="proof-panel">
        <p className="eyebrow">Sign in</p>
        <h1>Login</h1>
        <form className="stack">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button type="submit">Continue</button>
        </form>
      </section>
    </main>
  );
}
