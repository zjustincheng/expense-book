# Self-Hosted Deployment (`expbook.culater.cc`)

Expense Book is configured for self-hosting on a local Linux machine using Docker Compose, a local SQLite database, local filesystem attachment storage, and a Cloudflare Tunnel exposing `https://expbook.culater.cc`.

## Architecture

1. **`backend` container** (`backend/Dockerfile`):
   - Runs Fastify on port `4000` inside the internal Docker network.
   - Uses Node 24's built-in SQLite engine (`node:sqlite`) with WAL mode enabled, storing the database at `/data/expense-book.sqlite` (mounted from `./data` on the Linux host).
   - Stores receipt and file attachments under `/data/attachments` (mounted from `./data/attachments` on the Linux host).
   - Runs SQLite migrations automatically on container startup (`node backend/dist/db/migrate.js`).
   - Uses built-in local email/password accounts (`AUTH_MODE=local`) stored in SQLite (`users` and `user_sessions` tables).

2. **`frontend` container** (`frontend/Dockerfile`):
   - Runs the Next.js standalone server on port `3000`.
   - Proxies `/api/*` and `/auth/*` requests to `http://backend:4000`.
   - Binds to `127.0.0.1:3000` on the host for local health checks and troubleshooting.

3. **`cloudflared` container** (`cloudflare/cloudflared:latest`):
   - Connects outbound to Cloudflare's edge and routes `https://expbook.culater.cc` to `http://frontend:3000` without requiring open inbound firewall ports on the host machine.

## Setup Steps

1. **Configure `.env`**:

   ```sh
   cp .env.example .env
   ```

   Edit `.env` and set:

   ```dotenv
   APP_URL=https://expbook.culater.cc
   AUTH_MODE=local
   DATA_DIR=./data
   CLOUDFLARE_TUNNEL_TOKEN=<your-cloudflare-tunnel-token>
   ```

2. **Configure Cloudflare Tunnel Route**:
   - In the Cloudflare Zero Trust dashboard (**Networks → Tunnels**):
     - Select your tunnel and go to the **Public Hostname** tab.
     - Add a public hostname:
       - **Subdomain**: `expbook`
       - **Domain**: `culater.cc`
       - **Service Type**: `HTTP`
       - **URL**: `frontend:3000`
   - Alternatively, if using a locally-managed tunnel credentials file, see `infrastructure/cloudflared/config.yml`.

3. **Start the Services**:

   ```sh
   docker compose up -d --build
   ```

4. **Backups**:
   All persistent state resides in `./data`:
   - `./data/expense-book.sqlite` (plus `-wal` / `-shm` files while running)
   - `./data/attachments/`
