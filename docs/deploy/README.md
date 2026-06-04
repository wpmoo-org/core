# Deployment Notes — WPMoo/core

> **Status:** target deployment guide. Runtime files (`package.json`, Dockerfiles,
> Compose files, app and worker sources) are added during Phase 1+. Until then,
> this document defines the intended deployment contract.
>
> All platforms require the same base environment variables — see `.env.example`
> once the scaffold exists.

## Pre-deploy checklist

Base requirements:
- [ ] `DATABASE_URL` points to production Postgres 17.
- [ ] `BETTER_AUTH_SECRET` is a unique random secret.
- [ ] `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` match the production domain.
- [ ] `REGISTRATION_MODE` is set intentionally (`invite_only` is the safe default;
      first deploy uses the documented single-use bootstrap registration exception;
      `disabled` disables even that exception and requires another documented admin-creation path).
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` unless there is a documented exception.
- [ ] Production email delivery is configured and verified when
      `REQUIRE_EMAIL_VERIFICATION=true`.
- [ ] `ADMIN_BOOTSTRAP_TOKEN` is set for first deploy only; rotate/delete it after
      the first admin claims access.
- [ ] `APP_ENCRYPTION_KEY` is set if core persists OAuth/TOTP secrets instead of
      relying on verified Better Auth safe storage.
- [ ] `pnpm db:migrate` has been run against the production DB.
- [ ] `pnpm db:seed` has been run (idempotent).
- [ ] GitHub secret scanning + push protection are enabled on the repo.

Provider-dependent requirements:

| Provider area | Required when | Required vars / setup |
|---|---|---|
| Storage | File uploads, avatars, or privacy export artifacts are enabled | Bucket exists; credentials have least-privilege read/write/delete; public URL only for public assets |
| Email | Required for production auth/bootstrap when `REQUIRE_EMAIL_VERIFICATION=true`; also required for invite, notification, or data-export emails | Provider credentials are set and sender/domain is verified |
| Payment | Stripe one-time checkout is enabled | Live Stripe keys and webhook secret are set; webhook route is configured |
| Worker | Jobs, privacy export, cleanup, email sending, or async tasks are enabled | Worker process is deployed separately from serverless web where required |

Payment is an extension point. Do not require Stripe credentials for deployments
that do not enable payment flows.

## Vercel

```bash
# Set env vars in Vercel dashboard or via CLI
vercel env add DATABASE_URL production
# ... repeat for all required vars

# Deploy
vercel --prod
```

Notes:
- Worker (`apps/worker`) is a long-running process — not suitable for Vercel serverless.
  Deploy the worker separately (Railway, Fly.io, or Docker).
- Set `NEXT_PUBLIC_APP_URL` to your Vercel production URL.

## Fly.io

Deploy web + worker as two separate Fly apps from the same repo.

```bash
# Web app
fly launch --name wpmoo-web --dockerfile apps/playground/Dockerfile
fly secrets set DATABASE_URL="..." BETTER_AUTH_SECRET="..."

# Worker
fly launch --name wpmoo-worker --dockerfile apps/worker/Dockerfile
fly secrets set DATABASE_URL="..."
```

## Railway

Use Railway's monorepo support. Point the web service at `apps/playground`
and the worker service at `apps/worker`. Set environment variables in the
Railway dashboard.

## Docker Compose (self-hosted)

```bash
# Production compose file included at repo root
docker compose -f docker-compose.prod.yml up -d

# Run migrations before starting the app
docker compose -f docker-compose.prod.yml run --rm web pnpm db:migrate
docker compose -f docker-compose.prod.yml run --rm web pnpm db:seed
```

## Database

Postgres 17 required. Managed options: Supabase, Neon, Railway Postgres,
Fly Postgres, AWS RDS. Ensure the DB user has `CREATE` and `ALTER` privileges
for migrations.

Enable `pg_boss` schema creation: pg-boss needs to create its own schema on
first run. The `DATABASE_URL` user must have sufficient privileges.

## Production hardening (required before production)

> These reflect locked architecture decisions. They are summarized here now (ahead
> of full Phase 8 polish) because this repo is public and operators read it early.

**Connection pooling / serverless.** All state lives in one Postgres (sessions,
jobs, rate-limit, audit, payments, app data), so connection budget matters.
- Tune `DATABASE_POOL_MAX`, `WORKER_DATABASE_POOL_MAX`,
  `DATABASE_STATEMENT_TIMEOUT_MS`, and `DATABASE_LOCK_TIMEOUT_MS`.
- On serverless (Vercel), front Postgres with a **transaction-mode pooler**
  (PgBouncer/Neon/Supabase pooler). With transaction-mode pooling, **disable
  Drizzle prepared statements or use the serverless driver** — prepared statements
  are incompatible with transaction pooling.

**Least-privilege DB users.** Use a DDL-capable user for `db:migrate` and a
separate runtime user without DDL. Where supported, the runtime user has no
`UPDATE`/`DELETE` on `audit_event` (append-only); GDPR pseudonymization runs as a
separate privileged job/function.

**Backups / recovery.** Enable automated backups + point-in-time recovery,
rehearse a restore, and record your RPO/RTO. A read replica is recommended for
reporting/scale headroom. Losing the single database loses all state.

**Rate-limit prefilter.** The built-in limiter is Postgres-backed; under attack it
adds load to the DB it protects. In production, put a cheap **edge/WAF/IP
pre-rejection** in front of auth routes. The limiter **fails closed** on auth
paths when the store is unavailable.

**Email for verified flows.** With `REQUIRE_EMAIL_VERIFICATION=true`, a production
email provider (SMTP/Brevo/SES) is a hard prerequisite for auth/bootstrap — local
Mailpit is dev-only and is not a production deployment.
