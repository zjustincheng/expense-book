# Implementation handoff

## Completed first slice

- npm workspace with `frontend/`, `backend/`, and `infrastructure/`, strict TypeScript, ESLint, Prettier, lockfiles, and GitHub Actions quality checks.
- Responsive group dashboard, zero-balance group creation, transaction preview/posting, member balance explanations, record effects, reversal action, settlement suggestions, and CSV member-balance export.
- Fastify API with validated requests, group authorization, idempotent financial writes, atomic ledger posting, and repeatable-read dashboard snapshots.
- Exact rational expression evaluation, deterministic minor-unit allocations, five distinct financial concepts, normalized effects, and immutable journal/reversal history.
- Drizzle migrations with composite tenant foreign keys, append-only triggers, and deferred ledger balance checks.
- Cognito PKCE sign-in scaffolding, HTTP-only token cookies, same-origin checks for website mutations, and API access-token verification. Production refuses the development identity.
- Terraform foundation for RDS, private S3 attachments, Cognito, Secrets Manager, ECR, ECS cluster, and CloudWatch logs. Local PostgreSQL Compose file.

## Verified at this stopping point

- 30 domain/API tests pass using PGlite, including tenant isolation, retry-key conflicts, partial settlements, reversals, and zero-start groups.
- Browser workflow passes in installed Chrome: create group, preview/post income, inspect balance explanation, post a partial settlement, reload persisted data, and check a 390px mobile layout for overflow.
- ESLint, strict TypeScript checks, formatting, and frontend/backend production builds pass.
- Terraform formatting and provider-backed validation pass. No Terraform plan against an AWS account or deployment has run.
- CI is configured to repeat checks against PostgreSQL 17 and Chromium, but remote GitHub Actions has not run because this directory is not a connected Git repository.
- Live Cognito, AWS integrations, Docker-based local startup, and production operations have not been exercised here.

## Review findings addressed

- Kept decimal money out of binary floating-point calculations and API serialization.
- Prevented duplicate financial writes and rejected a reused request key with changed content.
- Rejected foreign-group members, unauthorized group reads, same-member transfers, and unbalanced cash/splits.
- Kept reversal history and overpayment balances instead of erasing originals or capping outstanding amounts.
- Added database enforcement of immutable and balanced ledger records.
- Kept private responses uncached and access tokens out of browser JavaScript.
- Used bounded request bodies, expression size/depth limits, safe log fields, and CSV formula escaping.

## Dependency audit follow-up

The online npm audit reports four moderate findings in the development-only `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild` dependency chain. The underlying advisory is [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), involving the esbuild development server. This application does not run that server. The audit's suggested automatic fix downgrades Drizzle Kit across a major compatibility boundary; it was not applied blindly. Revisit an upstream update or a tested dependency override before exposing development tooling. No high or critical findings were reported.

## Remaining product work

1. Invitations, role management, adding/archiving members, and account linking. Currently a group creator has admin access; authorization recognizes editor/viewer roles, but there is no management UI yet.
2. Draft/post lifecycle, atomic reversal/replacement corrections, linked partial/full refunds, and stale-preview detection. The current API posts directly after preview and supports standalone full reversals. Never use a manual adjustment as a substitute for the planned linked refund workflow.
3. Projects, categories/tags, stored default split rules, more split controls, and multiple cash participants in the website. The API already calculates equal, percentage, weight, and exact splits.
4. Date-scoped reports, complete pagination, member statements with contributing-record drill-down, and fuller exports. Current dashboard totals include all posted records, activity shows the latest 100 entries, and exports cover cumulative member balances.
5. Attachment metadata, authorized S3 uploads/downloads, and content validation. Terraform provisions storage only; the application does not yet accept attachments.
6. Live Cognito verification, refresh-token rotation, provider logout/revocation, authentication tests with signed JWTs, and operational session handling.
7. Extract the dashboard and route modules into smaller feature modules as the next features arrive; keep financial rules in the domain layer. Complete a dedicated accessibility audit and expand browser tests beyond the first workflow.
8. AWS environment layer: VPC/networking, ECS tasks/services and IAM, least-privilege database role, TLS, load balancer, CloudFront, Route 53, remote Terraform state, deployment OIDC, backup restoration, and monitoring. No apply/deployment has occurred.

Optional opening balances and full historical import remain later scope. The old source files must not be treated as verified balances or imported automatically.

## Decisions needed later

AWS region/account, domain, existing network versus a new VPC, initial environment sizing, and operational ownership. Cognito and the application stack are already confirmed; do not re-ask those decisions.

## Resuming

Read `WEBSITE_GUIDELINES.md`, this file, and `README.md`. Start with invitations/member management or finish the transaction lifecycle before adding more reporting UI. Preserve the existing test suite and add meaningful authorization/concurrency tests when those features change. The repository has no Git metadata yet.
