<div align="center">

<img src="public/logo.png" alt="Nubycord Logo" width="80"/>

# Ⲛⳙⲃⲩⲥⲟⲅ𝖽‡ — by PsychAnon

**A high-performance Discord mass DM automation tool with a sleek web dashboard.**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express)](https://expressjs.com)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey)](https://github.com)

</div>

---

## Overview

Nubycord is a powerful Discord self-bot automation dashboard built for running large-scale DM campaigns across multiple accounts simultaneously. It features adaptive rate-limit handling, multiple member scraping strategies, proxy support, and automated captcha solving — all controllable from a real-time web UI.

---

## Screenshots

> **Note:** Place your screenshots in the `screenshots/` folder and they will render here on GitHub.

| Overview | Scraper |
|----------|---------|
| ![Overview](screenshots/overview.png) | ![Scraper](screenshots/scraper.png) |

| Tokens | Config |
|--------|--------|
| ![Tokens](screenshots/tokens.png) | ![Config](screenshots/config.png) |

| Advanced | Logs |
|----------|------|
| ![Advanced](screenshots/advanced.png) | ![Logs](screenshots/logs.png) |

---

## Features

### Campaign Engine
- **Multi-token parallel DMs** — Run unlimited self-bot tokens simultaneously, each with its own independent send queue
- **Shared pool architecture** — All tokens draw from a single shared member pool, guaranteeing zero duplicate DMs
- **Adaptive delay scaling** — Automatically increases send delay when rate-limited (up to 2–4 min cap) and gradually recovers on success
- **Per-token send limit** — Optional cap per token per run, with configurable cooldown before re-joining the pool
- **Token health monitoring** — Automatically retires tokens that hit 5 consecutive errors
- **Pause / Resume / Stop** — Full campaign lifecycle controls with live state tracking
- **Campaign scheduler** — Schedule campaigns to start after a chosen delay

### Member Scraping (4 Methods)
- **Opcode 14** — Lazy-loads members by simulating Discord's guild member list scroll; ideal for large servers
- **Reaction Scraper** — Fetches all users who reacted to a specific message with a given emoji
- **Keyword Scraper** — Finds members who posted messages containing specified keywords within a time window
- **Bruteforce (Opcode 8)** — Samples user IDs across a given snowflake ID range to discover accounts

All scrapers automatically deduplicate against the existing member list and filter out already-blocked accounts.

### Token Management
- Supports plain token format (`token`) and email-pass-token format (`email:password:token`)
- One-click token validation — confirms each token is live and shows the associated username
- Per-token live stats: messages sent, errors, and current status (active / rate-limited / done / invalid)

### Proxy Support
- HTTP, SOCKS4, and SOCKS5 proxy formats
- Format: `host:port` or `host:port:user:pass`
- Real proxy health testing via Discord API endpoint verification
- Automatic proxy rotation per campaign run

### Captcha Solving
- Supports **Anti-Captcha** (anti-captcha.com) for hCaptcha Enterprise (Discord's captcha)
- Polling-based solver with 3-minute timeout and automatic retry
- Account balance check from the dashboard

### Blocked Member Tracking
- Failed DMs (DMs disabled, deleted accounts, unauthorized) are automatically added to a persistent blocked list
- Blocked members are excluded from all future campaigns
- Blocked list is visible and clearable from the dashboard

### Campaign History
- Full per-run history: start time, end time, total sent, per-token summary
- Stored locally in `campaign_history.json`, capped at 50 entries
- Viewable in the History tab with a clear-all option

### Dashboard UI
- Real-time stats polling every 3 seconds
- Live progress bar during active campaigns
- Browser push notification on campaign completion
- Dark mode / Light mode toggle with persistent preference
- Live log stream with pause, resume, and clear controls

---

## Setup

### Requirements
- Node.js 18 or higher
- A Discord account token (self-bot)

### Installation

```bash
git clone https://github.com/iamfontane/nubycord.git
cd nubycord
npm install
```

### Start

```bash
node app.js
# or
npm start
```

Open your browser to `http://localhost:5000`

---

## Configuration

All settings are managed from the web dashboard (Config tab) and saved to `config.json`. Key fields:

| Field | Description | Default |
|-------|-------------|---------|
| `dm_delay_min` | Minimum delay between DMs per token (ms) | `6000` |
| `dm_delay_max` | Maximum delay between DMs per token (ms) | `8000` |
| `login_delay_min` | Minimum stagger delay between token logins (ms) | `2000` |
| `login_delay_max` | Maximum stagger delay between token logins (ms) | `4000` |
| `per_token_limit` | Max DMs per token per session (0 = unlimited) | `0` |
| `token_cooldown_ms` | Cooldown before a token re-joins after hitting its limit | `30000` |
| `dm_messages` | Array of message templates (one is chosen randomly per DM) | — |
| `proxy.enabled` | Enable proxy rotation | `false` |
| `proxy.proxies` | List of proxy strings | `[]` |
| `captcha.enabled` | Enable captcha auto-solving | `false` |
| `captcha.apiKey` | Anti-Captcha API key | `""` |

---

## Data Files

| File | Purpose |
|------|---------|
| `data/tokens.txt` | One token per line — plain or `email:pass:token` format |
| `data/members.txt` | Target Discord user IDs (one per line) |
| `data/blocked_members.txt` | Persistent list of IDs to permanently skip |
| `data/serverId.txt` | Default server ID used by scrapers |
| `campaign_history.json` | Run history (auto-managed) |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/data` | Full dashboard state |
| `GET` | `/api/config` | Current config |
| `POST` | `/api/update-config` | Save config changes |
| `POST` | `/api/start` | Start DM campaign |
| `POST` | `/api/stop` | Stop all active clients |
| `POST` | `/api/pause` | Pause campaign (holds without consuming pool) |
| `POST` | `/api/resume` | Resume paused campaign |
| `POST` | `/api/schedule` | Schedule campaign with a delay |
| `POST` | `/api/cancel-schedule` | Cancel pending schedule |
| `POST` | `/api/update-tokens` | Save token list |
| `POST` | `/api/validate-tokens` | Validate tokens and return usernames |
| `POST` | `/api/update-members` | Save member list |
| `POST` | `/api/update-server-id` | Save default server ID |
| `POST` | `/api/scrape-opcode14` | Run Opcode 14 scraper |
| `POST` | `/api/scrape-reaction` | Run Reaction scraper |
| `POST` | `/api/scrape-opcode8` | Run Bruteforce scraper |
| `POST` | `/api/scrape-keywords` | Run Keyword scraper |
| `GET` | `/api/proxy-stats` | Get proxy manager stats |
| `POST` | `/api/test-proxy` | Test a single proxy string |
| `GET` | `/api/captcha-balance` | Check captcha solver account balance |
| `GET` | `/api/logs` | Get live log buffer |
| `DELETE` | `/api/logs` | Clear log buffer |
| `GET` | `/api/blocked` | Get blocked member list |
| `DELETE` | `/api/blocked` | Clear blocked list |
| `GET` | `/api/history` | Get campaign history |
| `DELETE` | `/api/history` | Clear campaign history |

---

## Important Notes

- This tool operates as a Discord **self-bot**, which violates Discord's Terms of Service. Use at your own risk.
- Do not edit `members.txt` manually while a campaign is actively running.
- Only run `node app.js`. Do not run `dm.js` directly — it is a legacy module and will exit with an error if invoked standalone.
- Recommended send delays: 6–12 seconds minimum. Lower delays significantly increase ban risk.

---

## Author

Built by [PsychAnon](https://github.com/iamfontane)
