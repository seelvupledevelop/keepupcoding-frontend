#!/usr/bin/env bash
# =============================================================================
# KeepUpCoding frontend — deploy / update (idempotent)
# Validates required env, builds the static image, starts Caddy + frontend,
# waits for health checks, then probes the public site.
# Never prints secret values. Never overwrites .env.
# Usage: ./scripts/deploy.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

set -a; # shellcheck disable=SC1091
source .env; set +a

MISSING=()
for VAR in APP_DOMAIN ACME_EMAIL; do
  VAL="${!VAR:-}"
  if [[ -z "$VAL" || "$VAL" == *example.com* ]]; then
    MISSING+=("$VAR")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: required environment variables missing or still placeholders:" >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  echo "Edit .env and re-run." >&2
  exit 1
fi

echo "==> Building frontend image…"
docker compose build --pull

echo "==> Starting Caddy + frontend…"
docker compose up -d

echo "==> Waiting for health checks…"
for i in $(seq 1 30); do
  UNHEALTHY=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"unhealthy"' || true)
  HEALTHY=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || true)
  if [[ "$HEALTHY" -ge 1 && "$UNHEALTHY" -eq 0 ]]; then break; fi
  sleep 2
done
docker compose ps || true

echo "==> Probing https://${APP_DOMAIN} (first hit may take ~30s while Caddy issues the TLS certificate)…"
for i in $(seq 1 12); do
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' -m 8 "https://${APP_DOMAIN}/" || true)
  if [[ "$CODE" == "200" ]]; then
    echo "    OK — https://${APP_DOMAIN} responds 200."
    break
  fi
  sleep 5
done
[[ "${CODE:-}" == "200" ]] || echo "    ! Site did not answer 200 yet — check DNS and: docker compose logs caddy"

echo "==> Deploy complete: https://${APP_DOMAIN}"
