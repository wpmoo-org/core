export default function HomePage() {
  return (
    <main className="shell">
      <section className="proof-panel">
        <p className="eyebrow">Phase 1 proof pack</p>
        <h1>WPMoo Core</h1>
        <p className="lead">
          Auth schema proof, strict env validation, i18n routing, and
          deterministic UTC formatting are wired before product slices land.
        </p>
        <dl className="facts">
          <div>
            <dt>UTC sample</dt>
            <dd>Jun 4, 2026 at 10:30 AM</dd>
          </div>
          <div>
            <dt>German route</dt>
            <dd>/de/admin/users</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
