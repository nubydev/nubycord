#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Nubycord — One-shot VPS deploy
#  Target : Ubuntu 22.04 / 24.04 (run as a non-root user with sudo access)
#  Domain : nubycord.ydns.eu
#
#  USAGE  : bash deploy.sh
#  Fill in GITHUB_TOKEN below — everything else is pre-configured.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ══════════════════════════════════════════════════════
#  ▼▼▼  ONLY THIS FIELD NEEDS TO BE FILLED IN  ▼▼▼
# ══════════════════════════════════════════════════════

GITHUB_TOKEN="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"      # GitHub Classic Token (repo scope)

# ══════════════════════════════════════════════════════
#  Everything below is pre-configured — do not change
# ══════════════════════════════════════════════════════

CERTBOT_EMAIL="evolvfork@gmail.com"

SUPABASE_URL="https://iubrlcflomfdcxkryeox.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1YnJsY2Zsb21mZGN4a3J5ZW94Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA3OTI3NSwiZXhwIjoyMDg4NjU1Mjc1fQ.G7hHY29XiHPsW5PQ6B7c8oQ5ghGH5_f_4jsSCTJBnog"
SESSION_SECRET="fDmNJphrWWZsnuuQ8vokNS1SFiUjafJRzN7MlAE8RJosn6UjlM2FyPJnssRgnIdF7K30pMvPRV7X3mTd/yylGQ=="

DOMAIN="nubycord.ydns.eu"
APP_DIR="/opt/nubycord"
APP_PORT="5000"
PM2_APP="nubycord"
NODE_MAJOR="22"
GITHUB_USER="nubydev"
GITHUB_REPO="nubycord"
TOKEN_FILE="${HOME}/.nubycord_token"

# ══════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
die()     { echo -e "${RED}✖ $*${NC}"; exit 1; }

CURRENT_USER="$(whoami)"
CURRENT_HOME="$HOME"

[[ -z "$GITHUB_TOKEN" ]] && die "GITHUB_TOKEN is empty — set it at the top of this script"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Nubycord VPS Deployment"
echo "  Domain  : ${DOMAIN}"
echo "  App Dir : ${APP_DIR}"
echo "  User    : ${CURRENT_USER}"
echo "══════════════════════════════════════════════════════"
echo ""

# ── Sudo keepalive ─────────────────────────────────────────────────────────────
info "Validating sudo access…"
sudo -v || die "sudo failed"
( while true; do sudo -v; sleep 50; done ) &
SUDO_KEEPALIVE_PID=$!
trap 'kill $SUDO_KEEPALIVE_PID 2>/dev/null; true' EXIT INT TERM
success "Sudo access confirmed"

# ── 1. System packages ─────────────────────────────────────────────────────────
info "Updating apt…"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y -q
sudo apt-get upgrade -y -q -o Dpkg::Options::="--force-confold"

info "Installing nginx, certbot, and base tools…"
sudo apt-get install -y \
    curl wget git gnupg2 ca-certificates lsb-release \
    build-essential python3 python3-pip \
    nginx certbot python3-certbot-nginx \
    || die "Failed to install nginx/certbot — check apt output above"

# Ensure nginx sites dirs exist (some minimal installs omit them)
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

# Ensure nginx includes sites-enabled (add if missing from nginx.conf)
if ! sudo grep -q "sites-enabled" /etc/nginx/nginx.conf 2>/dev/null; then
    sudo sed -i '/http {/a\\tinclude /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
fi

sudo systemctl enable nginx
sudo systemctl start  nginx || sudo systemctl restart nginx

info "Installing Playwright system dependencies (best-effort)…"
sudo apt-get install -y -q \
    libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    libgcc-s1 libstdc++6 fonts-liberation xdg-utils \
    2>/dev/null || true
# libasound2 → libasound2t64 on Ubuntu 24.04
sudo apt-get install -y -q libasound2t64 2>/dev/null || \
sudo apt-get install -y -q libasound2    2>/dev/null || true

success "System packages installed"

# ── 2. Node.js ─────────────────────────────────────────────────────────────────
if ! node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}"; then
    info "Installing Node.js ${NODE_MAJOR}.x…"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash - >/dev/null 2>&1
    sudo apt-get install -y -q nodejs
fi
success "Node $(node --version) / npm $(npm --version)"

# ── 3. PM2 ─────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    info "Installing PM2…"
    sudo npm install -g pm2 --quiet
fi
success "PM2 $(pm2 --version)"

# ── 4. App directory ───────────────────────────────────────────────────────────
info "Preparing app directory ${APP_DIR}…"
sudo mkdir -p "$APP_DIR"
sudo chown -R "${CURRENT_USER}:${CURRENT_USER}" "$APP_DIR"
success "App directory ready"

# ── 5. Clone / pull repo ───────────────────────────────────────────────────────
CLONE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

if [ -d "${APP_DIR}/.git" ]; then
    info "Repo exists — pulling latest…"
    cd "$APP_DIR"
    git remote set-url origin "$CLONE_URL"
    git fetch --quiet origin
    git reset --hard origin/main --quiet 2>/dev/null \
        || git reset --hard origin/master --quiet
else
    info "Cloning repo to ${APP_DIR}…"
    sudo rm -rf "$APP_DIR"
    sudo mkdir -p "$APP_DIR"
    sudo chown "${CURRENT_USER}:${CURRENT_USER}" "$APP_DIR"
    git clone "$CLONE_URL" "$APP_DIR" --quiet
    cd "$APP_DIR"
fi

# Scrub token from git config immediately
git remote set-url origin "https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
printf '%s' "$GITHUB_TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
success "Repo ready at ${APP_DIR}"

# ── 6. Write .env ──────────────────────────────────────────────────────────────
info "Writing .env…"
cat > "${APP_DIR}/.env" <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=${APP_PORT}
EOF
chmod 600 "${APP_DIR}/.env"
success ".env written"

# ── 7. Runtime directories ─────────────────────────────────────────────────────
mkdir -p "${APP_DIR}/.sessions" "${APP_DIR}/userdata"
chmod 750 "${APP_DIR}/.sessions" "${APP_DIR}/userdata"
success "Runtime directories ready"

# ── 8. npm install ─────────────────────────────────────────────────────────────
info "Installing npm dependencies…"
cd "$APP_DIR"
npm install --no-fund --no-audit --registry https://registry.npmjs.org 2>&1 | tail -5
success "npm dependencies installed"

# ── 9. Playwright Chromium ─────────────────────────────────────────────────────
info "Installing Playwright Chromium…"
npx playwright install chromium 2>&1 | tail -3
sudo npx playwright install-deps chromium 2>/dev/null | tail -3 || true
success "Playwright Chromium ready"

# ── 10. PM2 start / restart ────────────────────────────────────────────────────
info "Starting app under PM2…"
cd "$APP_DIR"

if pm2 describe "$PM2_APP" &>/dev/null; then
    pm2 restart "$PM2_APP" --update-env
else
    pm2 start app.js \
        --name "$PM2_APP" \
        --cwd  "$APP_DIR" \
        --max-memory-restart 600M \
        --restart-delay 3000 \
        --max-restarts 10
fi
pm2 save --force >/dev/null

# Register PM2 with systemd
sudo env PATH="$PATH:/usr/bin:/usr/local/bin" \
    pm2 startup systemd -u "$CURRENT_USER" --hp "$CURRENT_HOME" 2>/dev/null || \
    warn "PM2 startup skipped — run 'pm2 startup' manually if needed"
pm2 save --force >/dev/null
success "App running under PM2 (name: ${PM2_APP})"

# ── 11. Nginx reverse proxy ────────────────────────────────────────────────────
info "Configuring Nginx…"

NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_TMP="$(mktemp)"

cat > "$NGINX_TMP" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        client_max_body_size 10M;
    }
}
NGINX

sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo cp "$NGINX_TMP" "$NGINX_CONF"
rm -f "$NGINX_TMP"
sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t || die "Nginx config test failed"
sudo systemctl reload nginx
success "Nginx configured and reloaded"

# ── 12. SSL with Certbot ───────────────────────────────────────────────────────
info "Obtaining SSL certificate…"
sudo certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$CERTBOT_EMAIL" \
    --redirect \
    --no-eff-email \
    || warn "Certbot failed — DNS may not be pointing to this server yet. Re-run after DNS propagates."

sudo systemctl enable certbot.timer 2>/dev/null || true
sudo systemctl start  certbot.timer 2>/dev/null || true

# ── 13. Firewall ───────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    info "Configuring UFW firewall…"
    sudo ufw allow 22/tcp  >/dev/null 2>&1 || true
    sudo ufw allow 80/tcp  >/dev/null 2>&1 || true
    sudo ufw allow 443/tcp >/dev/null 2>&1 || true
    sudo ufw --force enable >/dev/null 2>&1 || true
    success "UFW enabled (22, 80, 443 open)"
fi

# ── Done ───────────────────────────────────────────────────────────────────────
kill $SUDO_KEEPALIVE_PID 2>/dev/null || true
trap - EXIT INT TERM

echo ""
echo "══════════════════════════════════════════════════════"
echo -e "  ${GREEN}Deployment complete!${NC}"
echo ""
echo "  Live at : https://${DOMAIN}"
echo "  App dir : ${APP_DIR}"
echo "  PM2 app : ${PM2_APP}"
echo ""
echo "  Useful commands:"
echo "    pm2 logs ${PM2_APP}          — tail live logs"
echo "    pm2 monit                  — process monitor"
echo "    pm2 restart ${PM2_APP}       — restart app"
echo "    sudo nginx -t              — test nginx config"
echo "    sudo certbot renew --dry-run"
echo ""
echo "  First time setup:"
echo "    Visit https://${DOMAIN}/setup to create your admin account"
echo ""
echo "  (Only if Supabase tables missing)"
echo "    Run supabase/database.sql then supabase/admin.sql"
echo "    in the Supabase SQL Editor"
echo "══════════════════════════════════════════════════════"
