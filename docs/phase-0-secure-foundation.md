# Phase 0 secure foundation

The application keeps PostgreSQL, Prisma, Better Auth, NestJS, Next.js, and Eve.
The migration history remains additive.

Every CRM root record stores an organization ID. Authenticated tRPC requests require an active organization membership. The Prisma client adds that organization to scoped reads and writes. Database triggers reject cross-workspace CRM links.

Better Auth continues to store `owner`, `admin`, and `member`. The Verbytic application maps these values to Founder, Admin, and Operator. Founder and Admin can decide approvals and change suppression policy. Operator can use assigned CRM workflows.

Better Auth encrypts provider account tokens. The Slack user grant uses AES-256-GCM with `BETTER_AUTH_SECRET`. Existing plaintext provider and Slack grants require reconnection.

`DATABASE_URL` belongs to a runtime login with membership in `crm_runtime`. `MIGRATION_DATABASE_URL` belongs to a migration administrator and must only be available to migration jobs. The runtime role has no schema creation rights. It cannot update or delete GTM audit events.

Run `bun run --filter=@crm/db db:deploy` with the migration URL. Then run `bun run --filter=@crm/db db:provision-runtime` once.

Use separate databases and credentials for local, test, preview, and production. Set `DEPLOYMENT_ENVIRONMENT` and `DATABASE_ENVIRONMENT` to the same value. The API rejects a mismatch.

Phase 0 adds lifecycle states, reply classes, strategic account and ICP attributes, versioned research briefs, approval decisions, suppression controls, and append-only audit attribution. The approval queue lists strategic accounts first and older work next.

External provider writes remain disabled while `EXTERNAL_WRITES_ENABLED` is not `true`. Phase 0 keeps this value `false`.
