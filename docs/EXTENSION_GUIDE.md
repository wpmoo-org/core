# Extension Guide — WPMoo/core

This guide explains how downstream products build on top of WPMoo/core
without modifying the upstream foundation.

> **Boundary rule:** All extension work described here happens in your downstream
> product repository. For core v1, the canonical downstream mode is a fork or
> monorepo/submodule composition that can add app routes, DB schema, migrations,
> seed composition, worker composition, and provider composition. Treat package
> dependency-only consumption as a future/narrow mode unless the extension needs
> only UI/provider packages. Do not submit domain models, product-specific screens,
> or business logic back to upstream `wpmoo-org/core`.

> **Composition principle:** Do not use module-level mutable registries (no
> `registerSection()`, `registerProvider()` at module scope). Compose sections,
> privacy providers, and capabilities explicitly at the app/worker/seed
> composition root. This avoids SSR race conditions, duplicate registration, and
> hidden global state.

---

## Core philosophy

Core provides the operating layer: auth, users, roles, audit, settings,
storage, email, jobs, payment event recording, privacy, i18n.

**Your product adds:**
- Domain models (new tables in your copy of `packages/db`)
- Domain-specific server actions and route handlers
- Product screens in your app
- Domain-specific jobs
- Product-specific email templates

Core does NOT and MUST NOT contain: Customer, Order, Course, Event, Project,
Task, CRM, CMS, subscription plans, product analytics, or multi-tenant logic.

---

## Extending user profiles

Core provides minimal, domain-free profile fields in `user_profile`:
`phone`, `bio`, `timezone`, `locale`, `avatar_file_id`.

**Do not add product-specific fields to core `user_profile` or Better Auth `user`.**
Do not use `user_profile.metadata jsonb` as a catch-all — it loses type safety,
makes querying hard, and complicates privacy export.

Instead, create a product-owned one-to-one extension table:

```ts
// schema/todo-profile.ts
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const todoUserProfile = pgTable('todo_user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  defaultTodoView:          text('default_todo_view'),
  dailyDigestEnabled: boolean('daily_digest_enabled').notNull().default(false),
  todoDisplayName:     text('todo_display_name'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
```

Relationship:
```
user  1──1  user_profile          ← core generic profile
user  1──1  todo_user_profile  ← product-specific extension
```

---

## Extending settings navigation

`SectionedSettingsShell` (from `@wpmoo/ui`) is a generic nav + content shell
that takes a `sections` prop. It knows nothing about routes or labels.

Core defines its own sections as an app-level config (not in `@wpmoo/ui`):

```ts
// apps/playground/config/settings-sections.ts  (core dogfood app)
export const coreSettingsSections = [
  { id: 'profile',       href: '/settings/profile',       labelKey: 'Settings.Sections.Profile' },
  { id: 'account',       href: '/settings/account',       labelKey: 'Settings.Sections.Account' },
  { id: 'security',      href: '/settings/security',      labelKey: 'Settings.Sections.Security' },
  { id: 'sessions',      href: '/settings/sessions',      labelKey: 'Settings.Sections.Sessions' },
  { id: 'notifications', href: '/settings/notifications', labelKey: 'Settings.Sections.Notifications' },
  { id: 'privacy',       href: '/settings/privacy',       labelKey: 'Settings.Sections.Privacy' },
]
```

Your downstream app copies this list and extends it in its own layout:

```tsx
// apps/todo/app/settings/layout.tsx
import { SectionedSettingsShell } from '@wpmoo/ui'
import { coreSettingsSections } from '@/config/core-settings-sections'
import { todoSettingsSections } from '@/config/todo-settings-sections'

export default function Layout({ children }) {
  return (
    <SectionedSettingsShell sections={[...coreSettingsSections, ...todoSettingsSections]}>
      {children}
    </SectionedSettingsShell>
  )
}
```

Your product settings routes:
```
/settings/profile/todo  ← self-service Todo profile
/settings/profile/todo/page.tsx  ← reads/writes todo_user_profile
```

The same `UserWorkspaceShell` pattern applies to admin user workspace:

```tsx
// Admin user detail layout
<UserWorkspaceShell sections={[...coreUserSections, ...todoUserSections]}>
  {children}
</UserWorkspaceShell>
```

Admin routes:
```
/admin/users/[id]/todo  ← admin view/edit Todo profile
```

Permissions for admin mutations — use the single `authorize()` seam (resolves
session → active-user lifecycle → permission), with a product-specific permission:
```ts
// Product-specific permission — not admin.users:update
const actor = await authorize({
  resource: 'todo.user_profile',
  action: 'update',
})
```

---

## Extending the capability catalog

Add product capabilities as an explicit array merged at seed time.
Do not mutate the catalog array at module scope.

```ts
// config/capabilities.ts (downstream product)
export const todoCapabilities = [
  {
    id: 'todo.user_profile:read',
    resource: 'todo.user_profile',
    action: 'read',
    label: 'Read Todo profile',
    category: 'Todo',
    risk: 'low',
    labelKey: 'Permissions.Todo.UserProfile.Read.label',
    descriptionKey: 'Permissions.Todo.UserProfile.Read.description',
    categoryKey: 'Permissions.Categories.Todo',
  },
  {
    id: 'todo.user_profile:update',
    resource: 'todo.user_profile',
    action: 'update',
    label: 'Update Todo profile',
    category: 'Todo',
    risk: 'medium',
    labelKey: 'Permissions.Todo.UserProfile.Update.label',
    descriptionKey: 'Permissions.Todo.UserProfile.Update.description',
    categoryKey: 'Permissions.Categories.Todo',
  },
]
```

Seed composition root:

```ts
// seed.ts
import { coreCapabilities, syncCapabilities } from '@wpmoo/rbac'
import { todoCapabilities } from './config/capabilities'

await syncCapabilities(db, [...coreCapabilities, ...todoCapabilities])
```

`syncCapabilities` is idempotent (upsert by `id`) and never deletes rows.

---

## Extending privacy export and anonymization

> **Phase note:** core's `privacy` package starts as a composition seam (Phase 2)
> and gains the export/delete implementation in Phase 7. The provider interface is
> created at first touch with a working local implementation and a test — not as a
> dormant stub.

**Product-specific profile fields may contain PII.** They must participate in
privacy export and account anonymization. Missing this is a GDPR gap.

Use `createPrivacyService` with an explicit provider array at composition root:

```ts
// packages/privacy
export type PrivacyProvider = {
  namespace: string
  exportUserData?: (ctx: { userId: string; db: DbClient }) => Promise<Record<string, unknown>>
  anonymizeUser?:  (ctx: { userId: string; tx: DbTransaction }) => Promise<void>
}

export function createPrivacyService(providers: PrivacyProvider[]) {
  // validates no duplicate namespaces at construction time
  // calls all providers in sequence
  // anonymizeUser runs inside the caller's transaction
}
```

Downstream composition root (worker or app):

```ts
import { corePrivacyProviders, createPrivacyService } from '@wpmoo/privacy'

const todoProfileProvider: PrivacyProvider = {
  namespace: 'todoProfile',
  exportUserData: async ({ userId, db }) => ({
    todoProfile: await getTodoProfileByUserId(db, userId),
  }),
  anonymizeUser: async ({ userId, tx }) => {
    await anonymizeTodoProfile(tx, userId)
  },
}

export const privacyService = createPrivacyService([
  ...corePrivacyProviders,
  todoProfileProvider,
])
```

Rules:
- `anonymizeUser` always receives a DB transaction — anonymization must be atomic.
- `exportUserData` is read-only, no transaction required.
- `createPrivacyService` fails at construction if two providers share the same `namespace`.
- Register every table that holds user-identifiable data. If unsure, err on the side of inclusion.

---

## Adding domain models

In your downstream product:

1. Add new tables to `packages/db/src/schema/` in a new file (e.g. `schema/todo-items.ts`).
2. Export from `packages/db/src/index.ts`.
3. Generate and commit a versioned migration: `pnpm --filter @wpmoo/db db:generate`.
4. Add high-level helper functions in `packages/db/src/todo-items.ts` — avoid spreading
   raw Drizzle queries through app routes.

---

## Adding product-specific permissions

1. Add entries to your product capability array (see "Extending the capability catalog" above).
2. Add the corresponding translation keys to your message files:
   ```json
   // messages/en/permissions.json
   {
     "Permissions": {
       "Todo": {
         "UserProfile": {
           "Read":   { "label": "Read Todo profile",   "description": "..." },
           "Update": { "label": "Update Todo profile", "description": "..." }
         }
       },
       "Categories": { "Todo": "Todo" }
     }
   }
   ```
3. Guard your server actions with the single `authorize()` seam:
   ```ts
   const actor = await authorize({ resource: 'todo.user_profile', action: 'read' })
   ```

---

## Adding admin screens

Product admin screens live in your app alongside core admin screens.
Use the same patterns:
- Route-backed workspace (`/admin/<domain>/[id]/<section>`)
- High-level DB helpers (no raw Drizzle in route files)
- single `authorize({ resource, action })` seam in every server action (never bare `requirePermission`)
- Audit every critical mutation inside the DB transaction
- Run the i18n re-export codegen after adding each route:
  ```bash
  pnpm i18n:routes
  ```

---

## Adding background jobs

> **Phase note:** core's `jobs` (pg-boss) provider reaches full maturity in core
> Phase 7 (see DEVELOPER_GUIDE → "Package availability by phase"). Follow the same
> rule in your product: create a provider boundary only when a slice exercises it,
> with a working local implementation and a test — no dormant interfaces.

1. Define a typed payload in `packages/jobs/src/payloads.ts`.
2. Add the job name to the typed job registry config in `packages/jobs`.
3. Add the handler in `apps/worker/src/handlers/<job-name>.ts`.
4. Enqueue via `enqueueJob('job-name', payload)` from your server action.

---

## Adding email templates

> **Phase note:** core ships email with a Mailpit/local implementation in Phase 2
> and the production adapter (Brevo/SES) in Phase 7. Local Mailpit is dev-only —
> production verified-email flows require a configured prod provider. Follow the
> first-touch / no-dormant-interfaces rule for any provider code you add.

1. Add a template function in `packages/email/src/templates/<template-name>.ts`
   returning `{ subject, text, html }`.
2. Use it via `createEmailSenderFromEnv().sendEmail(...)` in a server action or job.
3. For localized emails (sent from a worker), use `createTranslator` with explicitly
   loaded messages — workers do not have a request context.

---

## Logging product events

Use `@wpmoo/logging` for product-specific diagnostics instead of direct
`console.log`. Keep log metadata structured, avoid raw PII/secrets, and pass
request/job correlation IDs when available. Use audit events for security or
admin mutation history; use logging for operational diagnostics.

---

## Billing extension point

Core ships three payment tables:
- `payment_customer` — maps users to provider (Stripe) customer IDs
- `payment` — one-time payment lifecycle record
- `payment_event` — idempotent webhook event log

Core provides a Stripe one-time checkout flow. It does NOT implement
subscription management UI.

To add subscription billing in your downstream product:
1. Create product-specific subscription tables (e.g. `user_subscription`) via
   a migration in your downstream product — do not add them to upstream core.
2. Add Stripe subscription webhook handlers to your app's payment webhook route.
3. Gate product features on subscription status via a subscription status check
   or product-specific permission — not by modifying core RBAC tables.

Do NOT extend core's `payment_event` table with subscription fields. Use a
separate `subscription_event` table in your downstream schema instead.

---

## What NOT to modify in core

- `packages/db/src/schema/` auth tables (user, session, account, verification,
  two_factor, passkey) — Better Auth depends on their exact shape.
- `packages/db/src/schema/` core profile tables (`user_profile`) — add a
  product-owned extension table instead.
- `packages/rbac/src/guards.ts` guard logic — add guards, don't weaken them.
- `packages/ui/src/` — if you need a new UI component, add it to
  `apps/playground/components/` first; promote to `packages/ui` only when
  it's truly domain-free and reusable.
- The audit `action` namespace — use your own dot-namespaced actions
  (`todo.user_profile.update`, not core admin action IDs such as `admin.users.*`).
- Core message files (`messages/en/`, `messages/de/`) — add your own namespaces
  in separate files; do not add product-domain keys to core message files.
- Core privacy providers — extend via `createPrivacyService` composition, not
  by editing `packages/privacy/src/providers.ts`.
