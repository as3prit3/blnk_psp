.PHONY: up down restart logs-backend logs-blnk logs-hyperswitch ps clean

# ─────────────────────────────────────────
# START EVERYTHING
# ─────────────────────────────────────────
up:
	@echo "🚀 Creating shared network..."
	docker network create shared_net 2>/dev/null || true

	@echo "🚀 Starting Hyperswitch (standard profile)..."
	cd hyperswitch && printf "1" | bash scripts/setup.sh

	@echo "🔗 Connecting Hyperswitch to shared network..."
	docker network connect shared_net hyperswitch-hyperswitch-server-1 2>/dev/null || true
	docker network connect shared_net hyperswitch-hyperswitch-control-center-1 2>/dev/null || true
	docker network connect shared_net hyperswitch-hyperswitch-web-1 2>/dev/null || true

	@echo "🚀 Starting Backend + Blnk..."
	docker compose up -d --build

	@echo "✅ All services are up!"
	@echo "   Control Center  → http://localhost:9000"
	@echo "   Hyperswitch API → http://localhost:8080"
	@echo "   Backend         → http://localhost:3000"
	@echo "   Blnk            → http://localhost:5300"

# ─────────────────────────────────────────
# STOP EVERYTHING
# ─────────────────────────────────────────
down:
	@echo "🛑 Stopping Backend + Blnk..."
	docker compose down

	@echo "🛑 Stopping Hyperswitch..."
	cd hyperswitch && docker compose down

	@echo "🧹 Removing shared network..."
	docker network rm shared_net 2>/dev/null || true

	@echo "✅ All services stopped."

# ─────────────────────────────────────────
# RESTART
# ─────────────────────────────────────────
restart: down up

# ─────────────────────────────────────────
# LOGS
# ─────────────────────────────────────────
logs-backend:
	docker compose logs backend -f

logs-blnk:
	docker compose logs server -f

logs-hyperswitch:
	cd hyperswitch && docker compose logs hyperswitch-server -f

logs-all:
	docker compose logs -f &
	cd hyperswitch && docker compose logs -f

# ─────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────
ps:
	@echo "=== Your Services ==="
	docker compose ps
	@echo ""
	@echo "=== Hyperswitch Services ==="
	cd hyperswitch && docker compose ps

# ─────────────────────────────────────────
# CLEAN (removes volumes too — careful!)
# ─────────────────────────────────────────
clean:
	docker compose down -v
	cd hyperswitch && docker compose down -v
	docker network rm shared_net 2>/dev/null || true
	@echo "🧹 Everything removed including volumes."
