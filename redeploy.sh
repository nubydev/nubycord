#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Nubycord — Zero-downtime redeploy
#  Run as the same non-root user you used for deploy.sh.
#  Usage: bash /opt/nubycord/redeploy.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/opt/nubycord"
PM2_APP="nubycord"
GITHUB_USER="nubydev"
GITHUB_REPO="nubycord"
TOKEN_FILE="${HOME}/.nubycord_token"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; GREY='\033[0;90m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
skip()    { echo -e "${GREY}– $*${NC}"; }
die()     { echo -e "${RED}✖ $*${NC}"; exit 1; }

[ -d "$APP_DIR" ] || die "App not found at ${APP_DIR} — run deploy.sh first"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Nubycord Redeploy"
echo "══════════════════════════════════════════════════════"
echo ""

# ── GitHub token ───────────────────────────────────────────────────────────────
if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
    GITHUB_TOKEN=$(cat "$TOKEN_FILE")
    skip "Using stored GitHub token from ${TOKEN_FILE}"
else
    read -rsp "  GitHub Classic Token: " GITHUB_TOKEN; echo ""
    printf '%s' "$GITHUB_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
fi

CLONE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

# ── Pull latest ────────────────────────────────────────────────────────────────
info "Fetching latest from GitHub…"
cd "$APP_DIR"

git remote set-url origin "$CLONE_URL"

OLD_HEAD=$(git rev-parse HEAD)
OLD_PKG=$(git show HEAD:package.json 2>/dev/null | md5sum)
OLD_PW=$(git show HEAD:package.json 2>/dev/null \
    | grep '"playwright"' | grep -oP '[\d]+\.[\d]+\.[\d]+' | head -1 || echo "")

git fetch --quiet origin
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
git reset --hard "origin/${BRANCH}" --quiet

NEW_HEAD=$(git rev-parse HEAD)
NEW_PKG=$(git show HEAD:package.json | md5sum)
NEW_PW=$(git show HEAD:package.json \
    | grep '"playwright"' | grep -oP '[\d]+\.[\d]+\.[\d]+' | head -1 || echo "")

# Scrub token from remote immediately
git remote set-url origin "https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
    warn "Already up to date ($(git rev-parse --short HEAD)). Nothing to deploy."
    echo ""
    echo "  Use  pm2 restart ${PM2_APP}  to force-restart anyway."
    echo ""
    exit 0
fi

CHANGED_FILES=$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")
COMMIT_COUNT=$(git rev-list --count "${OLD_HEAD}..${NEW_HEAD}")

success "Pulled ${COMMIT_COUNT} new commit(s) → $(git rev-parse --short HEAD)"
echo ""
echo -e "${GREY}  Changed files:${NC}"
echo "$CHANGED_FILES" | sed 's/^/    /' | head -20
[ "$(echo "$CHANGED_FILES" | wc -l)" -gt 20 ] && echo "    … and more"
echo ""

# ── npm install (only if package.json changed) ─────────────────────────────────
if [ "$OLD_PKG" != "$NEW_PKG" ]; then
    info "package.json changed — reinstalling dependencies…"
    npm install --no-fund --no-audit --registry https://registry.npmjs.org 2>&1 | tail -5
    success "Dependencies updated"
else
    skip "package.json unchanged — skipping npm install"
fi

# ── Playwright (only if version changed) ──────────────────────────────────────
if [ "$OLD_PW" != "$NEW_PW" ]; then
    info "Playwright version changed (${OLD_PW} → ${NEW_PW}) — reinstalling Chromium…"
    npx playwright install chromium 2>&1 | tail -3
    sudo npx playwright install-deps chromium 2>/dev/null | tail -3 || true
    success "Playwright Chromium updated"
else
    skip "Playwright unchanged — skipping browser reinstall"
fi

# ── Nginx (only if config changed) ────────────────────────────────────────────
if echo "$CHANGED_FILES" | grep -q "nginx\|\.conf"; then
    info "Nginx config touched — testing and reloading…"
    sudo nginx -t && sudo systemctl reload nginx
    success "Nginx reloaded"
else
    skip "No nginx changes"
fi

# ── PM2 reload (zero-downtime) ────────────────────────────────────────────────
info "Reloading app (zero-downtime)…"

if pm2 describe "$PM2_APP" &>/dev/null; then
    pm2 reload "$PM2_APP" --update-env
    success "App reloaded"
else
    warn "PM2 process not found — fresh start"
    pm2 start app.js \
        --name "$PM2_APP" \
        --cwd  "$APP_DIR" \
        --max-memory-restart 600M \
        --restart-delay 3000 \
        --max-restarts 10
    pm2 save --force >/dev/null
    success "App started"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo -e "  ${GREEN}Redeploy complete!${NC}  $(git log -1 --format='%s' | cut -c1-55)"
echo ""
echo "  Commit : $(git rev-parse --short HEAD) (was $(git rev-parse --short "$OLD_HEAD"))"
echo "  Status : pm2 logs ${PM2_APP}"
echo "══════════════════════════════════════════════════════"
