import { notFound } from "next/navigation";
import { createPlaygroundEnv } from "../../config/env";
import type { RegistrationMode } from "../../lib/phase2-access";
import { loadRegisterPage } from "../../lib/phase2-pages";

export const dynamic = "force-dynamic";

export function resolveRegisterPageAccess(mode: RegistrationMode) {
  return loadRegisterPage({ mode }).access;
}

export default function RegisterPage() {
  const env = createPlaygroundEnv(process.env);
  const page = loadRegisterPage({
    mode: env.REGISTRATION_MODE
  });

  if (!page.access.allowed) {
    notFound();
  }

  return (
    <main className="shell">
      <section className="proof-panel">
        <p className="eyebrow">Create account</p>
        <h1>Register</h1>
        <form className="stack">
          <label>
            Name
            <input name="name" type="text" autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" />
          </label>
          <button type="submit">Create account</button>
        </form>
      </section>
    </main>
  );
}
