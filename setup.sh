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

# ── Ask for domain name ─────────────────────────────────────────────────────
echo ""
read -rp "Enter your domain name (e.g. meets.example.com) or press Enter to use IP only: " DOMAIN
DOMAIN="${DOMAIN:-}"

TURN_DOMAIN=""
if [ -n "$DOMAIN" ]; then
  read -rp "Enter TURN subdomain (default: turn.${DOMAIN}): " TURN_DOMAIN
  TURN_DOMAIN="${TURN_DOMAIN:-turn.${DOMAIN}}"
  echo ""
  echo "Main domain:  ${DOMAIN}"
  echo "TURN domain:  ${TURN_DOMAIN}"
  echo ""
  echo "Make sure BOTH DNS A records point to ${VPS_IP} before continuing."
  read -rp "Press Enter when DNS is configured..."
fi

# ── Generate TURN secret ────────────────────────────────────────────────────
TURN_SECRET=$(openssl rand -hex 32)

# ── Write .env ──────────────────────────────────────────────────────────────
cat > .env << EOF
VPS_IP=${VPS_IP}
TURN_SECRET=${TURN_SECRET}
DOMAIN=${DOMAIN}
TURN_DOMAIN=${TURN_DOMAIN}
TURN_HOST=${DOMAIN:-${VPS_IP}}
EOF

echo "Generated .env"

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

# ── TLS certificates ────────────────────────────────────────────────────────
mkdir -p ssl coturn-certs

if [ -n "$DOMAIN" ]; then
  # ── Let's Encrypt via certbot ──────────────────────────────────────────
  if ! command -v certbot &>/dev/null; then
    echo "Installing certbot..."
    apt-get update -qq && apt-get install -y certbot
  fi

  CERT_DOMAINS="-d ${DOMAIN}"
  if [ -n "$TURN_DOMAIN" ] && [ "$TURN_DOMAIN" != "$DOMAIN" ]; then
    CERT_DOMAINS="${CERT_DOMAINS} -d ${TURN_DOMAIN}"
  fi

  echo ""
  echo "Requesting Let's Encrypt certificate for: ${DOMAIN} ${TURN_DOMAIN}"

  # Stop anything on port 80 so certbot standalone can bind
  docker compose down 2>/dev/null || true

  certbot certonly --standalone --non-interactive --agree-tos \
    --register-unsafely-without-email \
    ${CERT_DOMAINS} \
    --cert-name "${DOMAIN}"

  LE_LIVE="/etc/letsencrypt/live/${DOMAIN}"

  # Copy cert files (not symlink — Docker volumes can't follow host-absolute symlinks)
  cp -L "${LE_LIVE}/fullchain.pem" ssl/cert.pem
  cp -L "${LE_LIVE}/privkey.pem"   ssl/key.pem
  cp -L "${LE_LIVE}/fullchain.pem" coturn-certs/cert.pem
  cp -L "${LE_LIVE}/privkey.pem"   coturn-certs/key.pem
  chmod 644 coturn-certs/key.pem

  echo "Let's Encrypt certificate installed"

  # ── Auto-renewal cron with post-hook to copy certs and reload services ─
  PROJ_DIR="$(pwd)"
  cat > /etc/letsencrypt/renewal-hooks/deploy/meets-reload.sh << DEPLOY
#!/bin/bash
LE_LIVE="/etc/letsencrypt/live/${DOMAIN}"
cp -L "\${LE_LIVE}/fullchain.pem" "${PROJ_DIR}/ssl/cert.pem"
cp -L "\${LE_LIVE}/privkey.pem"   "${PROJ_DIR}/ssl/key.pem"
cp -L "\${LE_LIVE}/fullchain.pem" "${PROJ_DIR}/coturn-certs/cert.pem"
cp -L "\${LE_LIVE}/privkey.pem"   "${PROJ_DIR}/coturn-certs/key.pem"
chmod 644 "${PROJ_DIR}/coturn-certs/key.pem"
docker compose -f "${PROJ_DIR}/docker-compose.yml" restart frontend coturn
DEPLOY
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/meets-reload.sh

  cat > /etc/cron.d/meets-cert-renew << CRON
0 3 * * * root certbot renew --quiet
CRON
  echo "Auto-renewal cron job installed (runs daily at 03:00)"

else
  # ── Self-signed fallback ───────────────────────────────────────────────
  echo ""
  echo "WARNING: No domain set. Using self-signed certificate."
  echo "TURNS (TURN over TLS) will NOT work in most browsers with self-signed certs."
  echo "WebRTC media relay requires a valid TLS certificate."
  echo "Strongly recommended: set up a domain with Let's Encrypt."
  echo ""

  if [ ! -f ssl/cert.pem ]; then
    openssl req -x509 -newkey rsa:2048 \
      -keyout ssl/key.pem -out ssl/cert.pem \
      -days 3650 -nodes \
      -subj "/CN=${VPS_IP}"
    cp ssl/cert.pem coturn-certs/cert.pem
    cp ssl/key.pem  coturn-certs/key.pem
    chmod 644 coturn-certs/key.pem
    echo "Self-signed TLS certificate generated"
  else
    echo "TLS certificate already exists, skipping"
  fi
fi

# ── Open required ports (ufw) ───────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow 80/tcp   comment "Meets HTTP"        2>/dev/null || true
  ufw allow 443/tcp  comment "Meets HTTPS+TURNS"  2>/dev/null || true
  ufw allow 3478/udp comment "TURN UDP"           2>/dev/null || true
  ufw allow 3478/tcp comment "TURN TCP"           2>/dev/null || true
  ufw allow 5349/tcp comment "TURNS TLS"          2>/dev/null || true
  ufw allow 49152:65535/udp comment "TURN relay"  2>/dev/null || true
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
if [ -n "$DOMAIN" ]; then
  echo " Meets is running!"
  echo " Open in browser: https://${DOMAIN}"
  if [ -n "$TURN_DOMAIN" ]; then
    echo " TURN relay:     ${TURN_DOMAIN} (ports 443, 5349, 3478)"
  fi
else
  echo " Meets is running!"
  echo " Open in browser: https://${VPS_IP}"
  echo " (Accept the self-signed certificate warning)"
  echo ""
  echo " NOTE: TURNS may not work with self-signed certs."
  echo " Set up a domain + Let's Encrypt for full functionality."
fi
echo "============================================"
