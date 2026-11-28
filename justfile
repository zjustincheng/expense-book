# Expense Book Kubernetes & Operations Runner
# Run `just --list` to see all available recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

k8s_ns    := "expense-book"
k8s_chart := "./charts/expense-book"
k8s_host  := "expbook.culater.cc"
k3s_ip    := "192.168.2.56"

default:
    @just --list --unsorted

# Edit SOPS-encrypted Kubernetes secrets
[group('k8s')]
secrets-edit:
    sops secrets.enc.yaml

# Lint the Helm chart
[group('k8s')]
k8s-lint:
    helm lint {{k8s_chart}}

# Render Kubernetes manifests via helmfile
[group('k8s')]
k8s-template:
    helmfile template

# Preview cluster changes before deploying
[group('k8s')]
k8s-diff:
    helmfile diff

# Build and push backend & frontend images to local-registry
[group('k8s')]
k8s-push:
    ./scripts/push-images.sh

# Deploy or upgrade expense-book in Kubernetes via helmfile
[group('k8s')]
k8s-deploy:
    helmfile sync

# Restart backend and frontend Deployments and wait for rollout
[group('k8s')]
k8s-restart:
    kubectl rollout restart -n {{k8s_ns}} deploy/expense-book-backend deploy/expense-book-frontend
    kubectl rollout status -n {{k8s_ns}} deploy/expense-book-backend --timeout=120s
    kubectl rollout status -n {{k8s_ns}} deploy/expense-book-frontend --timeout=120s

# Build, push images, lint chart, deploy, and wait for rollout
[group('k8s')]
k8s-release: k8s-push k8s-lint k8s-deploy k8s-restart

# Show Kubernetes resources in the expense-book namespace
[group('k8s')]
k8s-status:
    kubectl get all,ingress,pvc,secret -n {{k8s_ns}} -o wide

# Follow backend pod logs
[group('k8s')]
k8s-logs-backend:
    kubectl logs -n {{k8s_ns}} deploy/expense-book-backend -f --tail=100

# Follow frontend pod logs
[group('k8s')]
k8s-logs-frontend:
    kubectl logs -n {{k8s_ns}} deploy/expense-book-frontend -f --tail=100

# Back up the Kubernetes PostgreSQL database into backups/
[group('k8s')]
k8s-backup:
    @mkdir -p backups
    @ts=$(date +%Y%m%d-%H%M%S); \
    dest="backups/expense-book-pg-${ts}.sql"; \
    kubectl exec -n database statefulset/postgres -- pg_dump -U postgres expense_book > "${dest}"; \
    echo "Saved PostgreSQL backup to ${dest}"

# Verify LAN Traefik routing and public HTTPS endpoint
[group('k8s')]
k8s-check:
    @echo "=== Traefik LAN check ==="
    curl -fsS -H "Host: {{k8s_host}}" "http://{{k3s_ip}}/api/health" && echo ""
    @echo "=== Public HTTPS health ==="
    curl -fsS "https://{{k8s_host}}/api/health" && echo ""
