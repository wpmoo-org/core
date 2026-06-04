# Developer Guide — WPMoo/core

> **Note:** This guide describes the target developer workflow. The scaffold
> (package.json, Docker Compose, source tree) is added in Phase 1. Until then,
> commands below document the intended setup, not a currently runnable state.

WPMoo/core is a domain-free, single-tenant SaaS operating foundation for
Next.js apps. It provides auth, RBAC/IAM, admin shell, audit logging, user
management, settings, and provider-based email/storage/payment/jobs.

Downstream products add their own domain models and screens on top.

---

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker & Docker Compose
- PostgreSQL client (optional, for direct DB access)

---

## Local setup

```bash
# 1. Clone
git clone https://github.com/wpmoo-org/core.git
cd core

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Copy env
cp .env.example .env
# Fill in BETTER_AUTH_SECRET (random 64-char string) and ADMIN_BOOTSTRAP_TOKEN

# 4. Start infrastructure (Postgres, MinIO, Mailpit)
docker compose up -d postgres minio minio-init mailpit

# 5. Run migrations
pnpm db:migrate

# 6. Seed roles and permissions
pnpm db:seed

# 7. Start the app
pnpm dev
```

Open http://localhost:3000. Register an account, then claim admin at
http://localhost:3000/setup/admin using your `ADMIN_BOOTSTRAP_TOKEN`.

**Dev services:**
- App: http://localhost:3000
- Mailpit (email): http://localhost:8025
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)
- Drizzle Studio: `pnpm db:studio` → http://localhost:4983

---

## Package layout

```
packages/
  auth/        Better Auth config and session helpers
  audit/       Audit event write/read
  config/      Shared env helpers and @t3-oss/env-core base schema utilities.
               Note: provider packages validate their own env vars locally.
  db/          Drizzle schema, migrations, high-level DB helpers
  email/       Email provider interface (Mailpit dev / Brevo prod)
  errors/      Canonical error code registry for server actions and UI messages
  i18n/        next-intl config, message loading, re-export codegen, i18n scripts
  jobs/        pg-boss job registry and typed payloads
  logging/     Structured logging facade (pretty dev logs, JSON production logs)
  payment/     Payment provider interface (Stripe one-time checkout)
  privacy/     GDPR export/delete and cookie consent helpers
  rate-limit/  RateLimiter interface (Postgres-backed / no-op implementations)
  rbac/        Permission model, role lifecycle, guard functions
  security/    Security headers, secret encryption helpers, CSRF/cookie/webhook utilities
  storage/     S3 provider interface (MinIO dev / S3 prod)
  ui/          Shared UI primitives (Base UI) and data-table patterns

apps/
  playground/  The Next.js application (composition root)
  worker/      Background job runner
```

This is the **target** layout. Provider packages (`email`, `storage`, `payment`,
`jobs`, `privacy`) are created the first time a build slice exercises them, each
with a working local implementation and a contract test — they do not exist as
empty interfaces ("no dormant interfaces"). Early phases may not contain all of
the packages above yet.

### Package availability by phase

| Package(s) | First appears in code | Notes |
|---|---|---|
| `db`, `config`, `security`, `errors`, `logging` | Phase 1 (Proof Pack) | foundation + writing conventions |
| `i18n` (route infra), `ui` (date util) | Phase 1 | cross-cutting infra, front-loaded |
| `auth` | Phase 1 (email/password + session proof) | grows through Phase 2 |
| `rate-limit` | Phase 1 (interface + no-op) → Phase 2 (Postgres auth-path impl) | no Redis |
| `rbac`, `audit` | Phase 2 (first secure slice) | |
| `email` | Phase 2 (Mailpit local) → Phase 7 (Brevo/SES prod adapter) | |
| `privacy` | Phase 2 (composition seam) → Phase 7 (export/delete impl) | |
| `storage`, `jobs`, `payment` | Phase 7 (Platform Adapters) | created at first touch with local impl + test |

If your checkout predates a package's phase, that package legitimately does not
exist yet — that is by design, not a missing file.

---

## Quality gates

Run before every pull request:

```bash
pnpm lint          # ESLint (dependency boundaries enforced)
pnpm typecheck     # tsc --noEmit across all packages
pnpm test          # Vitest unit tests, including fast PGlite-backed DB tests
pnpm test:e2e      # Playwright smoke tests
pnpm build         # Production build
pnpm db:test:migrate  # Real PostgreSQL migration smoke (fresh DB)
pnpm i18n:check    # Lingual-backed catalog checks + WPMoo strict checks
pnpm knip          # Unused dependency/export/file report (baseline may be non-blocking early)
```

CI runs all required gates on every PR via GitHub Actions. Commit messages are
validated with commitlint; lefthook installs local hooks for developer ergonomics,
but CI remains the source of truth.

---

## Adding a new package

1. Create `packages/<name>/package.json` with `"name": "@wpmoo/<name>"`.
2. Add to `pnpm-workspace.yaml` if not using a glob.
3. Add boundary rules to `eslint.config.mjs` if the package has import restrictions.
4. Export from `packages/<name>/src/index.ts`.

---

## Adding a new admin route

1. Create the route in `apps/playground/app/admin/<route>/page.tsx`.
2. Run the i18n re-export codegen:
   ```bash
   pnpm i18n:routes
   ```
   This generates the corresponding `apps/playground/app/[locale]/admin/<route>/page.tsx`.
3. Add the route to the central safe return path allowlist if it should be a
   valid redirect target from user actions.
4. Protect the route with the single `authorize()` seam in the server action or
   page loader — one call resolves the session, enforces active-user lifecycle,
   and checks the permission:
   ```ts
   const actor = await authorize({ resource: 'admin.users', action: 'read' })
   ```
   Every mutating server action goes through the security `action()` wrapper.
   Every mutating route handler goes through `routeAction()` so the handler
   returns a `Response`. Both wrappers enforce DTO validation → `authorize()` →
   stable error code → safe redirect → CSRF for high/critical actions. Do not
   call the low-level `requirePermission` primitive directly in new code.

---

## Database changes

Migration workflow summary:
1. Edit schema in `packages/db/src/schema/`.
2. `pnpm --filter @wpmoo/db db:generate` → review the SQL diff carefully.
3. Commit schema file + migration file together in one commit.
4. `pnpm --filter @wpmoo/db db:migrate` to apply locally.

**Never use `drizzle-kit push --force` on a DB with real data.** It bypasses
migration history and can cause unrecoverable schema conflicts. Use it only on
throwaway local databases.

For multi-step destructive migrations (renaming/dropping columns): add the new
column, deploy and backfill, then drop the old column in a separate migration.

---

## Environment variables

See `.env.example` for all variables with descriptions.

Required at minimum: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`NEXT_PUBLIC_APP_URL`, and `ADMIN_BOOTSTRAP_TOKEN` (first deploy only, rotate
after first admin claims). In production, set `REGISTRATION_MODE` and
`REQUIRE_EMAIL_VERIFICATION` intentionally instead of relying on implicit defaults
(`invite_only` and `true` are the safe defaults). If
`REQUIRE_EMAIL_VERIFICATION=true`, production email delivery must be configured
before bootstrap/admin flows. `APP_ENCRYPTION_KEY` is required in production when
OAuth/TOTP secrets are persisted by core rather than safely handled by the pinned
Better Auth version.

Env validation is package-local. Packages use `@t3-oss/env-core`; the Next.js app
uses `@t3-oss/env-nextjs` to enforce the server/client split and `NEXT_PUBLIC_`
requirements. Each provider package (`email`, `payment`, `storage`, `jobs`,
`rate-limit`) validates its own env vars at startup. A missing required provider
var will fail fast — check the startup logs for which package triggered the error.
