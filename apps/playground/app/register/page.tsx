import {
  resolveRegistrationAccess,
  type RegistrationMode
} from "../../lib/phase2-access";

export const dynamic = "force-dynamic";

export function resolveRegisterPageAccess(mode: RegistrationMode) {
  return resolveRegistrationAccess({ mode });
}

export default function RegisterPage() {
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
