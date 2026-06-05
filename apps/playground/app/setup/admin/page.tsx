export const dynamic = "force-dynamic";

export default function SetupAdminPage() {
  return (
    <main className="shell">
      <section className="proof-panel">
        <p className="eyebrow">First admin</p>
        <h1>Claim admin</h1>
        <form className="stack">
          <label>
            Bootstrap token
            <input name="token" type="password" autoComplete="one-time-code" />
          </label>
          <button type="submit">Claim admin</button>
        </form>
      </section>
    </main>
  );
}
