# WPMoo/core

Domain-free, single-tenant SaaS operating foundation for Next.js apps
(shadcn-compatible admin, Better Auth, RBAC/IAM, audit, provider seams).

> **Status:** Phase 4.5 visual alignment. The core foundation has completed the
> proof pack, first secure slice, hardening pass, and initial UI pattern
> standardization. The current pass tightens shadcn-compatible admin visuals and
> rendered DataTable interactions before RBAC/IAM depth.

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
