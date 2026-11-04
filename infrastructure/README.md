# Infrastructure

## Self-Hosted Docker Compose + Cloudflare Tunnel (`expbook.culater.cc`)

Run the full self-hosted stack from the repository root:

```sh
cp .env.example .env
# Set CLOUDFLARE_TUNNEL_TOKEN in .env
docker compose up -d --build
```

Or using `infrastructure/compose.yaml`:

```sh
docker compose -f infrastructure/compose.yaml up -d --build
```

### Services

- **`backend`**: Fastify API with SQLite database (`/data/expense-book.sqlite`) and local attachment storage (`/data/attachments`).
- **`frontend`**: Next.js standalone server proxying API and attachment requests to `http://backend:4000`.
- **`cloudflared`**: Cloudflare Tunnel connector exposing `http://frontend:3000` at `https://expbook.culater.cc` (see `infrastructure/cloudflared/config.yml`).
