# Nubycord

A Discord automation dashboard for mass DM campaigns, member scraping, token management, proxy/captcha support, and Playwright-powered Chromium automation with advanced fingerprinting.

## Stack

- **Backend**: Node.js + Express (`app.js`)
- **Auth/DB**: Supabase (PostgreSQL) — `nubycord_users` table
- **Sessions**: `session-file-store` — persisted to `.sessions/` on disk, survives restarts
- **Discord**: `discord.js-selfbot-v13` (self-bot)
- **Browser Automation**: Playwright + Chromium (headless, stealth fingerprinted)
- **Frontend**: Vanilla HTML/CSS/JS in `/public`
- **User data**: Per-user flat files under `userdata/<uuid>/`

## Required Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses RLS) |
| `SESSION_SECRET` | Random secret string for signing session cookies |
| `NODE_ENV` | Set to `production` on VPS to enable secure cookies |
| `PORT` | Optional, defaults to 5000 |

## First-Time Setup

1. Run `supabase_setup.sql` in the Supabase SQL Editor to create the table
2. Run `ALTER TABLE nubycord_users DISABLE ROW LEVEL SECURITY;` (app uses service key server-side)
3. Visit `/setup` to create the first admin account
4. Log in at `/login.html` with your generated mutex and password

## Running

```
node app.js
```

Serves on port 5000.

## Key Files

- `app.js` — Express server, all API endpoints, and DM campaign logic (entry point)
- `script/playwright-browser.js` — Playwright Chromium engine: stealth join, token validation, proxy-aware
- `script/fingerprint.js` — Advanced fingerprint engine: UA pool, canvas/WebGL noise, navigator overrides, headless bypass
- `script/scrapers.js` — Opcode 14, Reaction, Opcode 8, and Keyword scrapers
- `script/proxy.js` — Smart proxy manager (HTTP/HTTPS/SOCKS4/5) with scoring, round-robin, bulk-test
- `script/captcha.js` — Anti-Captcha + 2Captcha dual-service integration
- `script/auth.js` — Authentication logic (Supabase)
- `script/userdata.js` — Per-user file I/O helpers
- `script/settings.js` — Server settings manager
- `scripts/` — Symlink → `script/` (required by app.js requires)
- `public/index.html` — Dashboard UI
- `public/styles.css` — Styling (dark + light mode)

## Architecture Notes

### Campaign Engine (app.js)
- Uses **recursive `setTimeout`** (not `setInterval`) for per-token DM loops, enabling adaptive delays.
- **Adaptive delay scaling**: delay increases ×1.5 on rate limits (capped at 2min/4min), gradually decreases 5% per successful send back to configured minimum.
- **Token health monitoring**: tracks consecutive errors per token; retires a token after 5 consecutive non-captcha/non-blocked/non-rate-limit errors.
- **Per-token send limit** (`config.per_token_limit`): when hit, the client disconnects and optionally re-logs after `config.token_cooldown_ms`.
- **Pause/Resume**: `campaignPaused` flag; paused tokens hold without consuming from the pool, then resume seamlessly.
- **Campaign history**: saved to `campaign_history.json` on stop/completion. Stores per-token breakdown, totals, duration.
- **Scraper deduplication**: all 4 scraper endpoints filter `blocked_members.txt` before saving to `members.txt`.

### Log Levels
- `success` = green, `error` = red, `warn` = yellow (captcha/rate limit), `blocked` = orange, `ready` = cyan, `done` = blue/grey, `info` = grey

### Frontend
- `saveConfig()` / `loadData()` both query `#messagesContainer textarea` (class `dm-message-textarea`) for DM message content.
- Auto-polling every 3 seconds. Focused inputs are skipped to avoid clobbering user typing.
- Dark/light mode toggled via `body.light-mode` CSS class, persisted in `localStorage`.
- Progress bar visible during active campaigns. Paused/scheduled badges appear in the status card.
- **History tab** renders last 50 campaigns with per-token breakdown via `<details>` expandable.
- **Live Token Stats** panel appears in the Tokens tab during a campaign, showing per-token DMs sent, errors, and status.
- Browser Notification API fires on campaign completion (if permission granted).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/data` | Full state: tokens, members, blocked count, tokenStats, paused, scheduled |
| GET | `/api/config` | Current config.json |
| GET | `/api/logs` | In-memory log buffer |
| DELETE | `/api/logs` | Clear logs |
| GET | `/api/blocked` | Blocked members list |
| DELETE | `/api/blocked` | Clear blocked list |
| GET | `/api/history` | Campaign history array |
| DELETE | `/api/history` | Clear history |
| POST | `/api/start` | Start campaign |
| POST | `/api/stop` | Stop campaign, save partial history |
| POST | `/api/pause` | Pause campaign |
| POST | `/api/resume` | Resume campaign |
| POST | `/api/schedule` | Schedule campaign (`{ delayMs }`) |
| POST | `/api/cancel-schedule` | Cancel scheduled campaign |
| POST | `/api/update-tokens` | Save tokens |
| POST | `/api/update-members` | Save members |
| POST | `/api/update-server-id` | Save server ID |
| POST | `/api/update-config` | Update config.json |
| POST | `/api/validate-tokens` | Validate token list |
| POST | `/api/scrape-opcode14` | Opcode 14 scraper |
| POST | `/api/scrape-reaction` | Reaction scraper |
| POST | `/api/scrape-opcode8` | Bruteforce scraper |
| POST | `/api/scrape-keywords` | Keyword scraper |
| POST | `/api/test-proxy` | Test single proxy |
| POST | `/api/proxy-bulk-test` | Test list of proxies concurrently with scoring |
| GET | `/api/proxy-stats-v2` | Scored proxy stats for loaded proxy list |
| GET | `/api/captcha-balance` | Get Anti-Captcha balance |
| POST | `/api/captcha-balance-v2` | Get balance for Anti-Captcha or 2Captcha |
| POST | `/api/playwright/join-server` | Join server via Chromium + fingerprint + proxy + captcha |
| POST | `/api/playwright/validate-tokens` | Validate tokens via real Chromium browser |
| POST | `/api/playwright/mass-join` | Mass join loaded tokens to server via Chromium |
| GET | `/api/fingerprint/sample` | Generate a sample browser fingerprint profile |
