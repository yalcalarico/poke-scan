#!/usr/bin/env bash
# Levanta backend y frontend en paralelo con la salida prefijada.
# Ctrl+C (o cualquier error) baja los dos procesos.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"
WAIT_INFRA="${WAIT_INFRA:-60}"

BLUE=$'\033[36m'
PINK=$'\033[35m'
DIM=$'\033[2m'
RED=$'\033[31m'
YELLOW=$'\033[33m'
OFF=$'\033[0m'

info() { printf '%sdev%s %s\n' "$DIM" "$OFF" "$*"; }
ok()   { printf '%s ok%s %s\n' "$YELLOW" "$OFF" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$OFF" >&2; exit 1; }

# ── puerto ocupado? ─────────────────────────────────────────────────────────
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

for pair in "api:$API_PORT" "web:$WEB_PORT"; do
  name="${pair%%:*}"; port="${pair##*:}"
  if port_busy "$port"; then
    die "El puerto $port ($name) ya está ocupado.
    Liberálo con:  lsof -ti:$port | xargs kill
    O usá otro:   API_PORT=3002 WEB_PORT=3001 ./scripts/dev.sh"
  fi
done

# ── infra ───────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  die "Docker no está instalado."
fi
if ! docker info >/dev/null 2>&1; then
  die "Docker no está corriendo. Abrí Docker Desktop."
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  info "Levantando PostgreSQL y Redis..."
  docker compose up -d db redis >/dev/null || die "Falló docker compose up"
fi

info "Esperando que PostgreSQL esté healthy (máx ${WAIT_INFRA}s)..."
for i in $(seq 1 "$WAIT_INFRA"); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' pokemon-scanner-db 2>/dev/null)" = "healthy" ]; then
    ok "PostgreSQL healthy · Redis healthy"
    break
  fi
  [ "$i" = "$WAIT_INFRA" ] && die "PostgreSQL no quedó healthy en ${WAIT_INFRA}s. Mirá: make logs"
  sleep 1
done

# ──Arrancar ambos ───────────────────────────────────────────────────────────
pids=()
STOPPING=0

cleanup() {
  STOPPING=1
  trap - INT TERM EXIT
  echo ""
  info "Apagando…"
  for pid in "${pids[@]}"; do
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null
  done
  sleep 0.4
  for pid in "${pids[@]}"; do
    pkill -KILL -P "$pid" 2>/dev/null
    kill -KILL "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  info "Listo."
}
trap cleanup INT TERM EXIT 2>/dev/null

# `disown` saca los jobs de la tabla de bash para que no imprima
# "Terminated: 15" al bajarlos.
( cd backend  && PORT="$API_PORT" pnpm run start:dev 2>&1 | sed -u "s/^/${BLUE}[api]${OFF} /" ) &
pids+=($!)
disown 2>/dev/null

( cd frontend && PORT="$WEB_PORT" pnpm run dev      2>&1 | sed -u "s/^/${PINK}[web]${OFF} /" ) &
pids+=($!)
disown 2>/dev/null

echo ""
ok "API  → http://localhost:${API_PORT}/api/health"
ok "Web  → http://localhost:${WEB_PORT}"
info  "Ctrl+C para bajar ambos."
echo ""

# Si alguno de los dos muere, cortar el otro.
# OJO: `wait -n` no existe en bash 3.2 (el de macOS), así que hacemos polling.
while [ "$STOPPING" -eq 0 ]; do
  alive=0
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null && alive=1
  done
  [ "$alive" -eq 0 ] && break
  sleep 1
done

[ "$STOPPING" -eq 0 ] && info "Uno de los procesos terminó. Bajando el otro."
exit 0
