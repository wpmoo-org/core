# Dependency Approval — WPMoo/core

> **Status:** target supply-chain workflow for Phase 1 implementation.

Core uses conservative dependency defaults:

```ini
ignore-scripts=true
save-exact=true
```

## Rules

- Keep `ignore-scripts=true` globally.
- Do not re-enable lifecycle scripts globally.
- Use exact dependency versions; the lockfile is the source of truth.
- Any dependency that requires a build/install script must be approved explicitly
  with `pnpm approve-builds` or a documented allowlist entry.
- Review why the build script is needed, what it executes, and whether a safer
  alternative exists.
- Socket.dev and `pnpm audit --audit-level=high` run in CI, but human review is
  still required for install scripts and suspicious package behavior.

## Approval record template

```md
- Package: <name>@<version>
- Script required: <postinstall/build/etc.>
- Reason: <why this is necessary>
- Risk review: <network/fs/native binary notes>
- Approved by/date: <human/date>
```
