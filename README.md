# WPMoo/core

Domain-free, single-tenant SaaS operating foundation for Next.js apps
(shadcn-compatible admin, Better Auth, RBAC/IAM, audit, provider seams).

> **Status:** Phase 1 proof scaffold. The Better Auth proof pack pins the auth
> package line, wires the initial auth factory, records schema diffs, and blocks
> migration generation until proof approval.

## Docs

- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Extension Guide](docs/EXTENSION_GUIDE.md)
- [Deployment Notes](docs/deploy/README.md)
- [Dependency Approval](docs/security/DEPENDENCY_APPROVAL.md)

## Scope

Core provides the operating foundation: auth, users, roles/permissions, audit,
settings, files, jobs, provider interfaces, privacy/GDPR basics, and i18n.
Downstream products add their own domain models and screens on top.
