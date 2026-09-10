# Expense Book

A shared-money application built with Next.js, React, TypeScript, Tailwind, shadcn/ui components, a separate Fastify API, PostgreSQL/Drizzle, and Terraform for AWS.

## Current milestone

The first working slice supports creating groups at zero, recording income/expenses, direct obligations, transfers, settlements, and non-cash corrections; previewing balance changes; explaining member balances; suggesting settlements; reversing entries; and exporting member balances. The backend lifecycle service also supports drafts, linked partial refunds, atomic corrections, exact preview tokens, and stale-preview protection. The website currently offers equal splits and one cash participant; the API also supports exact amounts, weights, percentages, and multiple cash participants.

Cognito authorization-code sign-in with PKCE and access-token verification is implemented but has not been tested against a live AWS user pool. The historical files remain examples only and are not imported.

Admins can now add, rename, archive, and restore members; link their own account; invite people to existing members; and manage admin/editor/viewer access. Invitations expire after seven days and require the invited, verified email to accept. Removing access preserves financial history, and a group must retain at least one admin.

Records can be labeled with an optional project/trip and category/tag. Labels appear on activity and can be searched independently, while the original values remain part of each immutable input snapshot.

Admins can create reusable project and category options from **Members & access**. Archived options remain available for historical records but are removed from new record choices.

Admins can also choose a group default split method (equal, weights, percentages, or exact amounts). New activity forms start with that method, and each record can still override it.

Member balance cards link to statements listing every contributing record and that member’s exact balance effect. The API also supports reusable named split templates for the next form enhancement.

Use **Reports** from a group dashboard to filter posted activity by date range, project, category, record type, or member. The page keeps each financial concept separate and exports the filtered rows to CSV.

## Structure

- `frontend/`: Next.js website, UI components, server-side authentication callback and API proxy.
- `backend/`: Fastify API, domain calculations, authorization, Drizzle schema/migrations, tests.
- `infrastructure/`: local PostgreSQL Compose configuration and AWS Terraform foundation.
- `.github/workflows/`: automated quality checks. Cloud deployment automation is pending environment setup.

## Run locally

Requires Node.js 24, npm, and Docker Compose (or an existing PostgreSQL database).

```sh
nvm use
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose -f infrastructure/compose.yaml up -d
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. The API listens on `127.0.0.1:4000`. The example backend environment explicitly enables a local development identity; it is rejected in production and on non-loopback interfaces. Local development groups belong to that shared development identity. Configure Cognito before exposing the app to other users; see [infrastructure setup](infrastructure/README.md).

No demo transactions are inserted. Create a group with two or more members, then use **Add record → Preview balance changes → Confirm and post**.

Open **Members & access** to manage a group. Local development uses `DEV_USER_EMAIL=developer@example.test`; invite that address to try account linking locally. For multiple real users, configure Cognito. Invitation links work without email delivery; optional Amazon SES setup is described in the infrastructure guide.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Backend integration tests use an isolated in-memory PostgreSQL engine (PGlite) by default. CI sets `TEST_DATABASE_URL` to a disposable PostgreSQL 17 database. Never point this variable at an existing database: tests apply schema migrations directly and create test records.

Browser tests start their own ephemeral backend and the built frontend. Install a Playwright browser with `npx playwright install chromium`, or use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. Run the production build first. Tests use ports 3100 and 4002, separate from the local preview.

The build uses Next.js's supported webpack option because the local sandbox blocks Turbopack worker sockets. Backend tests and builds do not require AWS credentials.

## Financial conventions

Money is stored as integer minor units and transported as decimal strings. Expressions use bounded rational arithmetic and round half-up once; splits use largest remainder with stable member-ID ordering. Positive outstanding means a member should receive; negative means they should pay. Transfers and settlements each record a cash movement once. Obligations and corrections do not claim cash moved.

The journal is append-only, records the actor and original input, and uses database transactions, group-scoped foreign keys, deferred balance constraints, and retry keys for financial posting. A reversal retains the original record. A new group always starts at zero.

## Before a complete MVP or deployment

See [the implementation handoff](docs/IMPLEMENTATION_STATUS.md) for verified scope, limitations, and prioritized next steps. No AWS resources have been provisioned.
