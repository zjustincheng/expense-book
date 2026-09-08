# Implementation handoff

## Completed first slice

- npm workspace with `frontend/`, `backend/`, and `infrastructure/`, strict TypeScript, ESLint, Prettier, lockfiles, and GitHub Actions quality checks.
- Responsive group dashboard, zero-balance group creation, transaction preview/posting, member balance explanations, record effects, reversal action, settlement suggestions, and CSV member-balance export.
- Fastify API with validated requests, group authorization, idempotent financial writes, atomic ledger posting, and repeatable-read dashboard snapshots.
- Exact rational expression evaluation, deterministic minor-unit allocations, five distinct financial concepts, normalized effects, and immutable journal/reversal history.
- Drizzle migrations with composite tenant foreign keys, append-only triggers, and deferred ledger balance checks.
- Cognito PKCE sign-in scaffolding, HTTP-only token cookies, same-origin checks for website mutations, and API access-token verification. Production refuses the development identity.
- Terraform foundation for RDS, private S3 attachments, Cognito, Secrets Manager, ECR, ECS cluster, and CloudWatch logs. Local PostgreSQL Compose file.
- Financial lifecycle service with draft revisions, exact preview tokens, optimistic draft posting, linked partial refunds, and atomic reversal/replacement corrections. Preview tokens expire after ten minutes and are invalidated by any group ledger change.
- Member and access management UI/API: add, rename, archive/restore, account linking, verified-email invitations, revocation, admin/editor/viewer roles, last-admin protection, versioned writes, and immutable management history. Archived members retain balances and can participate in settlements, transfers, and corrections, but cannot receive new ordinary allocations or obligations.
- Optional SES invitation delivery with copyable links, delivery status, and explicit retry; no live AWS sender configured.
- Transaction lifecycle UI: save/edit/discard drafts, preview and post drafts, record partial refunds, reverse refunds, and correct posted records with an atomic reversal/replacement preview. Detailed cash participants and split methods remain intact when drafts are edited.
- Project/trip and category/tag labels on record inputs, with activity badges and independent dashboard filters. Labels are preserved through drafts, refunds, and corrections.
- Reports page and filtered API endpoint for date ranges, project, category, record type, and member, with separated totals and filtered CSV export.
- Group-managed project and category labels with PostgreSQL storage, admin creation/archival, and dropdowns in new record forms. Historical free-text labels remain readable.
- Group default split method setting for equal, weights, percentages, or exact amounts; new forms use it while preserving per-record overrides.
- Member statement pages with contributing-record effects and PostgreSQL-backed saved split-template records/API scaffolding.
- Attachment storage foundation: PostgreSQL metadata with tenant-safe entry foreign keys and AWS S3 SDK dependencies are in place; signed upload/download routes and UI are the next part of this milestone.
- Signed S3 upload and download URL routes with MIME/size limits, tenant authorization, and five-minute URL expiry. Live AWS credentials and browser upload wiring remain deployment setup work.
- CSV imports now support a validated preview, duplicate detection, payer mapping, and explicit creation of reviewable drafts for income and expense rows. Historical rows are never posted automatically; other record types remain in preview until their member mapping is defined.
- Terraform IAM foundation for separate ECS execution and backend runtime roles, including scoped private-attachment access and runtime secret reads.
- Terraform ECS task definitions/services now include a public-subnet HTTPS Application Load Balancer, ACM certificate input, frontend health checks, and load-balancer-to-task security-group ingress. CloudFront, Route 53, and backend service discovery remain deployment-layer work.
- Terraform now includes a CloudFront distribution with disabled caching, HTTPS redirect, a Route 53 alias for the application hostname, and private Cloud Map registration for backend ECS tasks. CloudFront requires a separate us-east-1 ACM certificate.

## Verified at this stopping point

- 48 domain/API/authentication tests pass using PGlite, including tenant isolation, retry-key conflicts, partial settlements, reversals, zero-start groups, invitation email matching, expiry/revocation, permission enforcement, archival, concurrent admin changes, and signed JWT verification.
- Six installed-Chrome browser tests pass, covering the original workflow plus draft persistence/discard, stale-preview protection, refunds/reversals/corrections, detailed split editing, and retry-safe writes after dropped responses.
- Browser workflow passes in installed Chrome: create group, preview/post income, inspect balance explanation, post a partial settlement, reload persisted data, check the 390px dashboard for overflow, then add/rename/archive/restore a member and accept an invitation at that mobile size.
- ESLint, strict TypeScript checks, formatting, and frontend/backend production builds pass.
- Terraform formatting and provider-backed validation pass. No Terraform plan against an AWS account or deployment has run.
- CI is configured to repeat checks against PostgreSQL 17 and Chromium. Run it on the connected GitHub repository after committing this milestone.
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

1. Connect saved split templates to a one-click selector in the record form, then add further split controls. The API and website support managed labels, group default methods, equal, percentage, weight, and exact splits plus multiple cash participants.
2. Date-scoped reports, complete pagination, member statements with contributing-record drill-down, and fuller exports. Current dashboard totals include all posted records, activity shows the latest 100 entries, and exports cover cumulative member balances.
3. Attachment metadata, authorized S3 uploads/downloads, and content validation. Terraform provisions storage only; the application does not yet accept attachments.
4. Live Cognito and SES verification, refresh-token rotation, provider logout/revocation, and operational session handling. Signed JWT and mocked userInfo tests pass; these do not replace a live integration check.
5. Extract the dashboard and route modules into smaller feature modules as features arrive; keep financial rules in the domain layer. Complete a dedicated accessibility audit and expand browser coverage to real multi-user sessions.
6. AWS environment layer: VPC/networking, least-privilege database role, remote Terraform state, deployment OIDC, SES sender provisioning, backup restoration, and monitoring. The checked-in ALB, ECS, CloudFront, Route 53, and Cloud Map layers have not been applied.

Optional opening balances and full historical import remain later scope. The old source files must not be treated as verified balances or imported automatically.

## Decisions needed later

AWS region/account, domain, existing network versus a new VPC, initial environment sizing, and operational ownership. Cognito and the application stack are already confirmed; do not re-ask those decisions.

## Resuming

Read `WEBSITE_GUIDELINES.md`, this file, and `README.md`. Finish the transaction lifecycle UI before adding more reporting UI. Preserve the existing test suite and add meaningful authorization/concurrency tests when those features change.
