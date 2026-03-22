#!/bin/bash
set -e

echo "=== Meets VPS Setup ==="

# ── Detect public IP ────────────────────────────────────────────────────────
VPS_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
       || curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
       || hostname -I | awk '{print $1}')

if [ -z "$VPS_IP" ]; then
  echo "ERROR: Could not detect public IP. Set VPS_IP manually in .env"
  exit 1
fi

echo "Detected public IP: $VPS_IP"

# ── Generate TURN secret ────────────────────────────────────────────────────
TURN_SECRET=$(openssl rand -hex 32)

# ── Write .env ──────────────────────────────────────────────────────────────
cat > .env << EOF
VPS_IP=${VPS_IP}
TURN_SECRET=${TURN_SECRET}
EOF

echo "Generated .env with TURN secret"

# ── Install Docker if missing ───────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! command -v docker compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
  echo "Installing Docker Compose plugin..."
  apt-get update -qq && apt-get install -y docker-compose-plugin
fi

# ── Open required ports (ufw) ───────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow 80/tcp   comment "Meets HTTP"  2>/dev/null || true
  ufw allow 3478/udp comment "TURN UDP"    2>/dev/null || true
  ufw allow 3478/tcp comment "TURN TCP"    2>/dev/null || true
  ufw allow 5349/tcp comment "TURNS TLS"  2>/dev/null || true
  echo "Firewall rules applied"
fi

# ── Build & start ───────────────────────────────────────────────────────────
echo ""
echo "Building Docker images (this takes ~3-5 min on first run)..."
docker compose build --no-cache

echo ""
echo "Starting services..."
docker compose up -d

echo ""
echo "============================================"
echo " Meets is running!"
echo " Open in browser: http://${VPS_IP}"
echo "============================================"
