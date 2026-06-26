# Nubycord — First-Time VPS Deploy

Run this **once** on a fresh Ubuntu 22.04 / 24.04 VPS.
Installs Node 22, PM2, Nginx, SSL, Playwright Chromium — writes `.env` automatically — **zero interactive prompts after the first sudo password entry**.

---

## Prerequisites

| What | Where |
|------|-------|
| Ubuntu 22.04 or 24.04 VPS | Any VPS provider |
| Domain A-record → VPS IP | Your DNS provider |
| GitHub Classic Token (repo scope) | GitHub → Settings → Developer settings → Personal access tokens |
| Non-root SSH user with `sudo` | Provided by your VPS (e.g. `ubuntu`, `admin`) |

> **Supabase credentials, session secret, domain, and repo details are already embedded in `deploy.sh`.**
> The only value you need to supply is your **GitHub token**.

---

## Steps

### 1. SSH into your VPS

```bash
ssh ubuntu@YOUR_VPS_IP
```

> Substitute `ubuntu` with your actual username (`admin`, `ec2-user`, etc.)

### 2. Download `deploy.sh` directly from the private repo

```bash
curl -H "Authorization: token YOUR_GITHUB_TOKEN" \
     -H "Accept: application/vnd.github.v3.raw" \
     -L "https://api.github.com/repos/nubydev/nubycord/contents/deploy.sh" \
     -o deploy.sh
```

### 3. Set your GitHub token inside the script

Open it (`nano deploy.sh`) and fill in the single required line:

```bash
GITHUB_TOKEN=""      # ← paste your GitHub Classic Token here
```

Everything else — Supabase URL, service key, session secret, domain, repo — is already pre-filled.

### 4. Run it

```bash
chmod +x deploy.sh && bash deploy.sh
```

You may be prompted for your **sudo password once** at the start. After that the script runs entirely non-interactively and completes in 5–10 minutes.

---

## What the script does (in order)

1. Caches sudo credentials for the duration of the run (keepalive background process)
2. Installs system packages + Playwright OS dependencies via `apt`
3. Installs Node.js 22 via NodeSource
4. Installs PM2 globally
5. Creates `/opt/nubycord` and grants ownership to your user
6. Clones `nubydev/nubycord` to `/opt/nubycord`
7. Writes `/opt/nubycord/.env` with all credentials (chmod 600)
8. Creates `.sessions/` and `userdata/` runtime directories
9. Runs `npm install` (builds bcrypt native addon)
10. Installs Playwright Chromium
11. Starts the app under PM2 (auto-restart, 600 MB memory cap)
12. Registers PM2 with systemd as your user (survives reboots)
13. Configures Nginx as a reverse proxy for `nubycord.ydns.eu`
14. Obtains a Let's Encrypt SSL certificate (HTTPS + HTTP→HTTPS redirect)
15. Enables UFW firewall (ports 22, 80, 443)

Your GitHub token is saved to `~/.nubycord_token` (chmod 600) for later use by `redeploy.sh`.

---

## First-time Supabase setup

Only needed **once** if the database tables don't exist yet:

1. Open **Supabase SQL Editor** → run `supabase/database.sql`
   → creates the `nubycord_users` table and disables RLS
2. Open **Supabase SQL Editor** → run `supabase/admin.sql`
   → edit the password inside first; your mutex key is returned in Results

Or visit `https://nubycord.ydns.eu/setup` after deploy to create the first admin via the browser.

---

## Useful post-deploy commands

```bash
pm2 logs nubycord            # tail live logs
pm2 monit                    # interactive process monitor
pm2 restart nubycord         # restart app
pm2 stop nubycord            # stop app
sudo nginx -t                # validate nginx config
sudo systemctl reload nginx  # reload nginx
sudo certbot renew --dry-run # test SSL auto-renewal
```

---

## Redeploying after code updates

```bash
bash /opt/nubycord/redeploy.sh
```

See `redeploy.md` for full details.
