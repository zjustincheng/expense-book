#!/usr/bin/env bash
set -euo pipefail

# Build backend and frontend images and push both to the in-cluster
# local-registry via kubectl port-forward (works from any LAN machine).

BACKEND_REPO="${BACKEND_REPO:-expense-book-backend}"
FRONTEND_REPO="${FRONTEND_REPO:-expense-book-frontend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
LOCAL_PORT="${LOCAL_PORT:-15000}"

echo "=== Building ${BACKEND_REPO}:${IMAGE_TAG} ==="
docker build -f backend/Dockerfile -t "${BACKEND_REPO}:${IMAGE_TAG}" .

echo "=== Building ${FRONTEND_REPO}:${IMAGE_TAG} ==="
docker build -f frontend/Dockerfile -t "${FRONTEND_REPO}:${IMAGE_TAG}" .

echo "=== Forwarding kube-system/svc/local-registry -> 127.0.0.1:${LOCAL_PORT} ==="
kubectl port-forward -n kube-system svc/local-registry "${LOCAL_PORT}:5000" >/tmp/expense-book-reg-pf.log 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${LOCAL_PORT}/v2/" >/dev/null; then
    break
  fi
  sleep 0.5
done

if ! curl -sf "http://127.0.0.1:${LOCAL_PORT}/v2/" >/dev/null; then
  echo "Error: local-registry port-forward did not become ready." >&2
  cat /tmp/expense-book-reg-pf.log >&2
  exit 1
fi

echo "=== Tagging and pushing to local-registry ==="
for repo in "$BACKEND_REPO" "$FRONTEND_REPO"; do
  docker tag "${repo}:${IMAGE_TAG}" "127.0.0.1:${LOCAL_PORT}/${repo}:${IMAGE_TAG}"
  docker push "127.0.0.1:${LOCAL_PORT}/${repo}:${IMAGE_TAG}"
  docker rmi "127.0.0.1:${LOCAL_PORT}/${repo}:${IMAGE_TAG}" >/dev/null 2>&1 || true
  echo "=== Registry tags for ${repo} ==="
  curl -sf "http://127.0.0.1:${LOCAL_PORT}/v2/${repo}/tags/list" && echo ""
done

echo "=== Done! Registered in local-registry ==="
echo "  - localhost:5000/${BACKEND_REPO}:${IMAGE_TAG}"
echo "  - localhost:5000/${FRONTEND_REPO}:${IMAGE_TAG}"
