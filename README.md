# WPMoo/core

Domain-free, single-tenant SaaS operating foundation for Next.js apps
(shadcn-compatible admin, Better Auth, RBAC/IAM, audit, provider seams).

> **Status:** Phase 4.6 real-slice reconciliation is in progress. Phase 0-4.5
> produced the proof foundation, security helpers, RBAC/audit seams, admin UI
> patterns, and shadcn-compatible visual alignment. Phase 4.6 reconciles that
> proof work into route-bound product behavior and adds permanent architecture
> contract gates before Phase 5 RBAC/IAM depth.

## Docs

- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Extension Guide](docs/EXTENSION_GUIDE.md)
- [Deployment Notes](docs/deploy/README.md)
- [Dependency Approval](docs/security/DEPENDENCY_APPROVAL.md)

## Scope

Core provides the operating foundation: auth, users, roles/permissions, audit,
settings, files, jobs, provider interfaces, privacy/GDPR basics, and i18n.
Downstream products add their own domain models and screens on top.

## License

MIT. See [LICENSE](LICENSE).
