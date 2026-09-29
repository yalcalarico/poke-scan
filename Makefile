# ═══════════════════════════════════════════════════════════════════════════
#  Pokémon Cards Scanner
#  `make` solo muestra la ayuda. Todo lo demás son targets.
# ═══════════════════════════════════════════════════════════════════════════

SHELL := /bin/bash
.DEFAULT_GOAL := help
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:

API_PORT  ?= 3001
WEB_PORT  ?= 3000
DB_PORT   ?= 55432

BLUE  := \033[36m
BOLD  := \033[1m
DIM   := \033[2m
RED   := \033[31m
YEL   := \033[33m
GRN   := \033[32m
OFF   := \033[0m

.PHONY: help dev dev-api dev-web stop setup install infra-up infra-down infra-logs \
        infra-reset db-migrate db-push db-generate db-reset db-studio db-stats \
        seed sync prices test test-backend test-frontend test-watch lint \
        typecheck build build-backend build-frontend check doctor clean \
        cache-clear tesseract-check

## ── Ayuda ──────────────────────────────────────────────────────────────────
help: ## Mostrar esta ayuda
	@printf "$(BOLD)Pokémon Cards Scanner$(OFF) — comandos disponibles\n\n"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(BOLD)%-16s$(OFF) %s\n", $$1, $$2}'
	@printf "\n$(DIM)Arranque rápido:  make setup   →   make dev$(OFF)\n"
	@printf "$(DIM)Primera vez?      make setup   (deps + infra + schema + catálogo)$(OFF)\n\n"

## ── Arranque ───────────────────────────────────────────────────────────────
setup: install infra-up db-generate db-migrate ## Instalar todo desde cero (primera vez)
	@printf "\n$(GRN)✓ Listo.$(OFF) Ahora: $(BOLD)make dev$(OFF)\n"
	@printf "  $(DIM)web → http://localhost:$(WEB_PORT)   api → http://localhost:$(API_PORT)/api/health$(OFF)\n\n"

dev: ## Levantar API + web en paralelo (Ctrl+C baja ambos)
	@./scripts/dev.sh

dev-api: ## Levantar solo la API en watch
	@printf "$(BLUE)[api]$(OFF) http://localhost:$(API_PORT)\n"
	@cd backend && PORT=$(API_PORT) pnpm run start:dev

dev-web: ## Levantar solo el frontend
	@printf "$(BOLD)[web]$(OFF) http://localhost:$(WEB_PORT)\n"
	@cd frontend && PORT=$(WEB_PORT) pnpm run dev

stop: ## Matar procesos de dev por los puertos
	@for p in $(API_PORT) $(WEB_PORT); do \
	  ids=$$(lsof -ti:$$p 2>/dev/null || true); \
	  if [ -n "$$ids" ]; then kill $$ids 2>/dev/null || true; \
	    printf "  puerto %s liberado\n" "$$p"; fi; done
	@printf "  puertos libres\n"

install: ## pnpm install en backend y frontend
	@pnpm install
	@cd backend  && pnpm install
	@cd frontend && pnpm install

## ── Infraestructura ────────────────────────────────────────────────────────
infra-up: ## Levantar PostgreSQL y Redis
	@docker compose up -d db redis
	@printf "  esperando health…\n"
	@for i in $$(seq 1 30); do \
	  [ "$$(docker inspect -f '{{.State.Health.Status}}' pokemon-scanner-db 2>/dev/null)" = healthy ] && break; sleep 1; done
	@docker compose ps --format "  {{.Name}}  {{.Status}}"

infra-down: ## Apagar contenedores (conservan los datos)
	@docker compose down
	@printf "  contenedores apagados, volumenes intactos\n"

infra-logs: ## Ver logs de PostgreSQL y Redis
	@docker compose logs -f

infra-reset: ## ⚠ Destruir la base de datos y empezar de cero
	@printf "$(RED)Esto borra TODAS las colecciones, usuarios y usuarios de prueba.$(OFF)\n"
	@printf "  (las cartas del catálogo hay que volver a sincronizarlas con: make sync)\n"
	@read -p "  Escribí 'si' para confirmar: " a; [ "$$a" = "si" ] || { printf "  cancelado\n"; exit 1; }
	@docker compose down -v
	@docker compose up -d db redis
	@for i in $$(seq 1 30); do \
	  [ "$$(docker inspect -f '{{.State.Health.Status}}' pokemon-scanner-db 2>/dev/null)" = healthy ] && break; sleep 1; done
	@$(MAKE) --no-print-directory db-push
	@printf "$(GRN)  base recreada, sin cartas. Corré 'make sync'.$(OFF)\n"

## ── Base de datos ───────────────────────────────────────────────────────────
db-migrate: ## Aplicar migraciones
	@cd backend && pnpm exec prisma migrate deploy
	@cd backend && pnpm exec prisma generate

db-push: ## Sincronizar el schema sin migraciones (solo dev)
	@cd backend && pnpm exec prisma db push
	@cd backend && pnpm exec prisma generate

db-generate: ## Regenerar el cliente Prisma
	@cd backend && pnpm exec prisma generate

db-studio: ## Abrir Prisma Studio (GUI de la base)
	@cd backend && pnpm exec prisma studio

db-stats: ## Ver cuántos registros hay de cada cosa
	@docker exec pokemon-scanner-db psql -U pokemon -d pokemon_cards -c "\
	SELECT (SELECT COUNT(*) FROM cards)       AS cartas,   \
	       (SELECT COUNT(*) FROM card_sets)   AS sets,     \
	       (SELECT COUNT(*) FROM card_prices) AS precios,   \
	       (SELECT COUNT(*) FROM users)       AS usuarios, \
	       (SELECT COUNT(*) FROM collections) AS colecciones, \
	       (SELECT COUNT(*) FROM share_links) AS links;"

db-reset: ## Recrear solo la base y el schema
	@docker exec pokemon-scanner-db psql -U pokemon -d postgres -c "DROP DATABASE IF EXISTS pokemon_cards;" >/dev/null
	@docker exec pokemon-scanner-db psql -U pokemon -d postgres -c "CREATE DATABASE pokemon_cards;" >/dev/null
	@$(MAKE) --no-print-directory db-migrate
	@printf "  base vacía. 'make sync' para cargar el catálogo.\n"

## ── Datos ──────────────────────────────────────────────────────────────────
seed: ## Importar 2 páginas de cartas (para probar rápido)
	@cd backend && pnpm run db:seed

sync: ## ⚠ Sincronizar el catálogo completo de pokemontcg.io (~20.670 cartas, varios minutos)
	@printf "$(YEL)  Sincronizando catálogo completo. La API de pokemontcg.io es lenta y a veces falla;$(OFF)\n"
	@printf "  el proceso es reanudable: si se corta, volvé a correrlo y sigue donde quedó.\n\n"
	@cd backend && pnpm run db:sync

prices: ## Refrescar los precios guardados
	@printf "  los precios se consultan bajo demanda (cache 1 h en Redis)\n"
	@printf "  para precargar los de tu colección, usá la API:\n"
	@printf "    curl -X POST http://localhost:$(API_PORT)/api/cards/<id>/prices -H 'X-Admin-Key: <ADMIN_KEY>'\n"

cache-clear: ## Vaciar la caché de Redis
	@docker exec pokemon-scanner-redis redis-cli FLUSHDB
	@printf "  caché vaciada\n"

## ── Calidad ────────────────────────────────────────────────────────────────
test: test-backend test-frontend ## Correr todos los tests
	@printf "\n$(GRN)✓ tests$(OFF)\n"

test-backend: ## Tests del backend
	@cd backend && pnpm run test

test-frontend: ## Tests del frontend
	@cd frontend && pnpm run test

test-watch: ## Tests del backend en watch
	@cd backend && pnpm run test:watch

lint: ## Lint en backend y frontend
	@cd backend  && pnpm run lint
	@cd frontend && pnpm run lint
	@printf "\n$(GRN)✓ lint$(OFF)\n"

typecheck: ## Typecheck del frontend
	@cd frontend && pnpm exec tsc --noEmit
	@printf "\n$(GRN)✓ types$(OFF)\n"

check: lint typecheck test build ## Correr todo: lint + types + tests + build
	@printf "\n$(GRN)✓ todo verde$(OFF)\n"

build: build-backend build-frontend ## Build de producción
	@printf "\n$(GRN)✓ build$(OFF)\n"

build-backend: ## Build del backend
	@cd backend && pnpm run build

build-frontend: ## Build del frontend
	@cd frontend && pnpm run build

## ── Diagnóstico ────────────────────────────────────────────────────────────
doctor: ## Verificar que todo esté en orden
	@printf "\n$(BOLD)Diagnóstico$(OFF)\n\n"
	@printf "  %-22s " "docker"; \
	  if docker info >/dev/null 2>&1; then printf "$(GRN)corriendo$(OFF)\n"; \
	  else printf "$(RED)no corriendo$(OFF)\n"; fi
	@printf "  %-22s " "postgres"; \
	  h=$$(docker inspect -f '{{.State.Health.Status}}' pokemon-scanner-db 2>/dev/null || echo "n/a"); \
	  if [ "$$h" = healthy ]; then printf "$(GRN)healthy$(OFF)\n"; \
	  else printf "$(RED)$$h$(OFF)\n"; fi
	@printf "  %-22s " "redis"; \
	  if [ "$$(docker inspect -f '{{.State.Health.Status}}' pokemon-scanner-redis 2>/dev/null)" = healthy ]; then \
	    printf "$(GRN)healthy$(OFF)\n"; else printf "$(YEL)no healthy$(OFF)\n"; fi
	@printf "  %-22s " "deps backend"; \
	  [ -d backend/node_modules ] && printf "$(GRN)instaladas$(OFF)\n" || printf "$(RED)falta 'make install'$(OFF)\n"
	@printf "  %-22s " "deps frontend"; \
	  [ -d frontend/node_modules ] && printf "$(GRN)instaladas$(OFF)\n" || printf "$(RED)falta 'make install'$(OFF)\n"
	@printf "  %-22s " "catálogo"; \
	  n=$$(docker exec pokemon-scanner-db psql -U pokemon -d pokemon_cards -tAc \
	    "SELECT COUNT(*) FROM cards" 2>/dev/null || echo 0); \
	  if [ "$$n" -ge 20000 ] 2>/dev/null; then printf "$(GRN)$$n cartas (completo)$(OFF)\n"; \
	  elif [ "$$n" -gt 0 ] 2>/dev/null; then printf "$(YEL)$$n cartas (incompleto: make sync)$(OFF)\n"; \
	  else printf "$(YEL)vacío (make sync)$(OFF)\n"; fi
	@printf "  %-22s " "puerto api ($(API_PORT))"; \
	  lsof -nP -iTCP:$(API_PORT) -sTCP:LISTEN >/dev/null 2>&1 \
	    && printf "$(YEL)ocupado (¿'make dev' corriendo?)$(OFF)\n" \
	    || printf "$(GRN)libre$(OFF)\n"
	@printf "  %-22s " "puerto web ($(WEB_PORT))"; \
	  lsof -nP -iTCP:$(WEB_PORT) -sTCP:LISTEN >/dev/null 2>&1 \
	    && printf "$(YEL)ocupado (¿'make dev' corriendo?)$(OFF)\n" \
	    || printf "$(GRN)libre$(OFF)\n"
	@printf "  %-22s " "api http"; \
	  if [ -n "$$(lsof -ti:$(API_PORT) 2>/dev/null || true)" ]; then \
	    r=$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$(API_PORT)/api/health 2>/dev/null || echo 000); \
	    [ "$$r" = 200 ] && printf "$(GRN)200 OK$(OFF)\n" || printf "$(RED)$$r$(OFF)\n"; \
	  else printf "$(DIM)no corriendo$(OFF)\n"; fi
	@printf "  %-22s " "assets tesseract"; \
	  if [ -s frontend/public/tesseract/lang/eng.traineddata.gz ]; then \
	    printf "$(GRN)self-hosted (OCR offline OK)$(OFF)\n"; \
	  else printf "$(RED)falta (make tesseract-check)$(OFF)\n"; fi
	@printf "\n"

tesseract-check: ## Verificar que el OCR funcione offline (sin internet)
	@cd frontend && pnpm exec vitest run lib/scanner/__tests__/ocr.test.ts --reporter=dot
	@printf "\n$(GRN)✓ OCR local OK$(OFF)  (el escáner no necesita internet)\n"

## ── Limpieza ───────────────────────────────────────────────────────────────
clean: ## Borrar builds y caches
	@rm -rf backend/dist backend/dist-seed frontend/.next
	@printf "  builds borrados (node_modules intacto)\n"
	@printf "  para node_modules también: rm -rf node_modules backend/node_modules frontend/node_modules\n"
