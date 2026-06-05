export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="shell">
      <section className="proof-panel">
        <p className="eyebrow">Core</p>
        <h1>Dashboard</h1>
        <dl className="facts">
          <div>
            <dt>Authorization</dt>
            <dd>Server-side authorize seam</dd>
          </div>
          <div>
            <dt>Audit</dt>
            <dd>Transaction-bound events</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
