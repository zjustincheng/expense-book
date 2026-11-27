# Expense Book

A shared-money application built with Next.js, React, TypeScript, Tailwind, shadcn/ui components, a Fastify API, and a local SQLite database with Drizzle ORM—packaged for self-hosting on a local Linux machine with Docker Compose and Cloudflare Tunnel (`expbook.culater.cc`).

## Current milestone

The working application supports creating groups at zero, recording income/expenses, direct obligations, transfers, settlements, and non-cash corrections; previewing balance changes; explaining member balances; suggesting settlements; reversing entries; and exporting member balances. The backend lifecycle service also supports drafts, linked partial refunds, atomic corrections, exact preview tokens, and stale-preview protection.

Built-in local accounts (`AUTH_MODE=local`) provide email/password registration, sign-in, and session management backed by SQLite, while receipt/file attachments are stored on the local filesystem (`/data/attachments`) alongside the SQLite database (`/data/expense-book.sqlite`).

Admins can add, rename, archive, and restore members; link their own account; invite people to existing members; and manage admin/editor/viewer access. Invitations expire after seven days and require the invited email to accept. Removing access preserves financial history, and a group must retain at least one admin.

Records can be labeled with an optional project/trip and category/tag. Labels appear on activity and can be searched independently, while the original values remain part of each immutable input snapshot.

## Structure

- `frontend/`: Next.js website, UI components, local sign-in/registration UI, and API proxy.
- `backend/`: Fastify API, domain calculations, authorization, SQLite/Drizzle schema & migrations, local account auth, local attachment storage, and tests.
- `compose.yaml` & `infrastructure/`: Docker Compose stack (`backend`, `frontend`, `cloudflared`) and Cloudflare Tunnel configuration (`infrastructure/cloudflared/config.yml`).

## Self-hosting with Docker Compose & Cloudflare Tunnel (`expbook.culater.cc`)

1. Copy `.env.example` to `.env` and set your Cloudflare Tunnel token:
   ```sh
   cp .env.example .env
   ```
2. In the Cloudflare Zero Trust dashboard (**Networks → Tunnels**):
   - Create or select your tunnel and copy its token into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
   - Add a **Public Hostname** route:
     - **Domain**: `expbook.culater.cc`
     - **Service**: `http://frontend:3000`
3. Start the stack:
   ```sh
   docker compose up -d --build
   ```
   - SQLite database is persisted on the host at `./data/expense-book.sqlite` (WAL mode enabled).
   - Attachments are persisted on the host at `./data/attachments`.
   - The frontend is also bound locally on `http://127.0.0.1:3000` and exposed publicly at `https://expbook.culater.cc` via the `cloudflared` container.

## Run locally for development

Requires Node.js 24 and npm. No external database container is required (uses Node's built-in SQLite engine).

```sh
nvm use
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. The API listens on `127.0.0.1:4000`. By default, `backend/.env.example` sets `AUTH_MODE=development` for single-user loopback development, or set `AUTH_MODE=local` in both `backend/.env` and `frontend/.env.local` to test full email/password registration and sign-in locally.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

### Git hooks

Husky Git hooks are configured automatically on `npm ci` / `npm install`:

- `pre-commit`: runs staged-file safety/hygiene checks (`scripts/pre-commit-checks.mjs`, including blocked secret/env/db files, large-file guard, conflict markers, secret patterns, JSON syntax, `.only` test guard, and targeted TypeScript typechecking) plus `lint-staged` (`eslint` for lint, naming conventions, and code smells, and `prettier --check`).
- `commit-msg`: validates commit messages against Conventional Commits via `commitlint` (`commitlint.config.mjs`).
- `pre-push`: runs `npm run check:secrets` (`node scripts/pre-commit-checks.mjs --all`) across all Git-tracked files to verify no sensitive files, keys, tokens, or credentials are present before pushing.

## Financial conventions

Money is stored as integer minor units and transported as decimal strings. Expressions use bounded rational arithmetic and round half-up once; splits use largest remainder with stable member-ID ordering. Positive outstanding means a member should receive; negative means they should pay. Transfers and settlements each record a cash movement once. Obligations and corrections do not claim cash moved.

The journal is append-only, records the actor and original input, and uses database transactions, group-scoped foreign keys, balance checks, and retry keys for financial posting. A reversal retains the original record. A new group always starts at zero.
