# Deployment (`expbook.culater.cc`)

Expense Book supports running on **PostgreSQL** (`DB_DRIVER=postgres` or `postgresql://...`) or **SQLite3** (`DB_DRIVER=sqlite` / file path), and is deployed to the local K3s Kubernetes cluster using **Helm/Helmfile**, **SOPS + age**, the in-cluster **`local-registry`**, **Traefik**, **`external-dns`**, and the shared **`k3s-local` Cloudflare Tunnel**.

## Kubernetes Architecture

1. **`expense-book-backend` Deployment** (`backend/Dockerfile`):
   - Runs Fastify on port `4000` (`ClusterIP` service `expense-book-backend:4000`).
   - Connects to the shared PostgreSQL instance in namespace `database` (`postgres.database.svc.cluster.local:5432`, database `expense_book`) using `DB_DRIVER=postgres` and `DATABASE_URL` from SOPS-encrypted `Secret/expense-book-config`.
   - Stores attachments in `/data/attachments` backed by `PersistentVolumeClaim/expense-book-attachments` (`local-path`, `5Gi`, `Recreate` deployment strategy).
   - Runs PostgreSQL migrations automatically on container startup (`node backend/dist/db/migrate.js`).

2. **`expense-book-frontend` Deployment** (`frontend/Dockerfile`):
   - Runs Next.js standalone server on port `3000` (`ClusterIP` service `expense-book-frontend:3000`).
   - Proxies `/api/*` and `/auth/*` requests to `http://expense-book-backend:4000`.

3. **Ingress & Cloudflare Tunnel (`expbook.culater.cc`)**:
   - `Ingress/expense-book` (`ingressClassName: traefik`) routes `expbook.culater.cc` `/` to `expense-book-frontend:3000`.
   - `external-dns.kubernetes.io/target` points `expbook.culater.cc` to the cluster's `k3s-local` Cloudflare Tunnel (`4c05ccd5-59ed-4bb7-9460-599af41922f2.cfargotunnel.com`).

## Kubernetes Deployment Commands

```sh
./scripts/push-images.sh   # Build and push backend/frontend images to local-registry
helm lint ./charts/expense-book
helmfile sync              # Deploy or upgrade namespace expense-book
just k8s-check             # Verify LAN Traefik + public HTTPS health
```

---

## Legacy Docker Compose + SQLite Setup

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
