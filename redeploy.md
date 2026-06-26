# Nubycord — Redeploy (after code updates)

Zero-downtime redeploy whenever you push new code. Requires `deploy.sh` to have run at least once.

---

## Run from the VPS

```bash
bash /opt/nubycord/redeploy.sh
```

Or pull the latest `redeploy.sh` itself first:

```bash
cd /opt/nubycord && git pull && bash redeploy.sh
```

> Token is read automatically from `~/.nubycord_token` (saved by `deploy.sh`).
> If the file is missing you'll be prompted once and it will be saved for next time.

---

## What the script does

| Step | Condition |
|------|-----------|
| Pulls latest commits from GitHub | Always |
| Exits early if nothing changed | No new commits |
| Runs `npm install` | Only if `package.json` changed |
| Reinstalls Playwright Chromium | Only if playwright version changed |
| Reloads Nginx | Only if a nginx/conf file changed |
| `pm2 reload` (zero-downtime) | Always on new commits |

---

## Force restart (no code change)

```bash
pm2 restart nubycord
```

## Check status

```bash
pm2 logs nubycord --lines 50
pm2 status
```

## Roll back to a previous commit

```bash
cd /opt/nubycord
git log --oneline -10
git checkout <hash> -- .
pm2 restart nubycord
```
