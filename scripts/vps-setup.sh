#!/usr/bin/env bash
# =============================================================
# PowerHub — Hostinger VPS First-Time Setup
# Run as root on Ubuntu 22.04 (Hostinger VPS)
# Usage:  bash vps-setup.sh
# =============================================================
set -euo pipefail

DOMAIN="power.microgenn.com"
APP_DIR="/var/www/powerhub"
REPO="https://github.com/MicrogennSenthil/PowerHub.git"
NODE_VERSION="20"
PG_DB="powerhub"
PG_USER="powerhub"

echo "================================================"
echo " PowerHub VPS Setup — $DOMAIN"
echo "================================================"

# ── 1. System packages ──────────────────────────────
echo "[1/9] Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw postgresql postgresql-contrib

# ── 2. Node.js via nvm ──────────────────────────────
echo "[2/9] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install $NODE_VERSION
  nvm use $NODE_VERSION
  nvm alias default $NODE_VERSION
fi

# Ensure node/npm are on PATH for non-interactive shells
echo 'export NVM_DIR="$HOME/.nvm"' >> /etc/profile.d/nvm.sh
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /etc/profile.d/nvm.sh
source /etc/profile.d/nvm.sh

# ── 3. pnpm ─────────────────────────────────────────
echo "[3/9] Installing pnpm..."
npm install -g pnpm pm2

# ── 4. PostgreSQL ────────────────────────────────────
echo "[4/9] Setting up PostgreSQL..."
PG_PASSWORD=$(openssl rand -base64 24)
sudo -u postgres psql -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASSWORD';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;" 2>/dev/null || true

# ── 5. Clone repo ────────────────────────────────────
echo "[5/9] Cloning repository..."
mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull origin main
else
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 6. Environment file ──────────────────────────────
echo "[6/9] Writing .env file..."
cat > "$APP_DIR/artifacts/api-server/.env" <<EOF
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://$PG_USER:$PG_PASSWORD@localhost:5432/$PG_DB

# ── Clerk (copy from Replit secrets) ──
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
SESSION_SECRET=$(openssl rand -hex 32)

# ── MHMS integration (optional) ──
# MHMS_API_URL=
# MHMS_API_KEY=
EOF

echo ""
echo "  ⚠  Edit $APP_DIR/artifacts/api-server/.env and fill in Clerk keys before continuing."
read -rp "  Press ENTER when .env is ready..."

# ── 7. Build ─────────────────────────────────────────
echo "[7/9] Installing dependencies and building..."
cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/powerhub run build

# Push DB schema
cd "$APP_DIR"
pnpm --filter @workspace/api-server run db:push || true

# ── 8. PM2 process ───────────────────────────────────
echo "[8/9] Configuring PM2..."
cat > "$APP_DIR/ecosystem.config.cjs" <<'ECOSYSTEM'
module.exports = {
  apps: [
    {
      name: "powerhub-api",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/powerhub",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      env_file: "artifacts/api-server/.env",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
    },
  ],
};
ECOSYSTEM

pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

# ── 9. Nginx + SSL ───────────────────────────────────
echo "[9/9] Configuring Nginx and SSL..."
cat > "/etc/nginx/sites-available/powerhub" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # Serve the built React frontend
    root /var/www/powerhub/artifacts/powerhub/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
    }

    # SPA fallback — all non-/api routes serve index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Bridge installer download (no auth)
    location /api/download/ {
        proxy_pass http://127.0.0.1:8080/api/download/;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/powerhub /etc/nginx/sites-enabled/powerhub
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL certificate
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@microgenn.com || \
  echo "  ⚠  Certbot failed — ensure DNS for $DOMAIN points to this VPS IP before retrying: certbot --nginx -d $DOMAIN"

# ── Firewall ─────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "================================================"
echo " ✅  PowerHub setup complete!"
echo "    App:  https://$DOMAIN"
echo "    API:  https://$DOMAIN/api/healthz"
echo "    DB:   postgresql://$PG_USER:*****@localhost/$PG_DB"
echo ""
echo "    PM2 status:  pm2 status"
echo "    PM2 logs:    pm2 logs powerhub-api"
echo "================================================"
