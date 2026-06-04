# WPMoo/core

Domain-free, single-tenant SaaS operating foundation for Next.js apps
(shadcn-compatible admin, Better Auth, RBAC/IAM, audit, provider seams).

> **Status:** contract/docs scaffold. Phase 1 implementation will add the
> runnable monorepo scaffold (`package.json`, workspaces, Docker Compose, apps,
> packages, tests, and CI). Until then, commands in the docs describe the target
> workflow rather than a currently runnable repository.

## Docs

- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Extension Guide](docs/EXTENSION_GUIDE.md)
- [Deployment Notes](docs/deploy/README.md)
- [Dependency Approval](docs/security/DEPENDENCY_APPROVAL.md)

## Scope

Core provides the operating foundation: auth, users, roles/permissions, audit,
settings, files, jobs, provider interfaces, privacy/GDPR basics, and i18n.
Downstream products add their own domain models and screens on top.
