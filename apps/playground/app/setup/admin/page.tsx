import { notFound } from "next/navigation";
import type { RegistrationMode } from "../../../lib/phase2-access";
import { loadSetupAdminPage, readRegistrationMode } from "../../../lib/phase2-pages";

export const dynamic = "force-dynamic";

export function resolveBootstrapPageAccess(mode: RegistrationMode) {
  return loadSetupAdminPage({ mode }).access;
}

export default function SetupAdminPage() {
  const page = loadSetupAdminPage({
    mode: readRegistrationMode(process.env.REGISTRATION_MODE)
  });

  if (!page.access.allowed) {
    notFound();
  }

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
