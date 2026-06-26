require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { Client } = require('discord.js-selfbot-v13');
const chalk = require('chalk');
const axios = require('axios');
const ProxyManager = require('./scripts/proxy');
const DiscordScrapers = require('./scripts/scrapers');
const CaptchaSolver = require('./scripts/captcha');
const Auth = require('./scripts/auth');
const UD = require('./scripts/userdata');
const Settings = require('./scripts/settings');
const { PlaywrightBrowser, batchValidateTokens, batchGenerateTokens } = require('./scripts/playwright-browser');
const Fingerprint = require('./scripts/fingerprint');
const { humanThink } = require('./scripts/human-behavior');
const Sequences = require('./scripts/sequences');
const Analytics = require('./scripts/analytics');
const TokenTiers = require('./scripts/token-tiers');
const Paraphrase = require('./scripts/paraphrase');
const IpRep      = require('./scripts/ip-reputation');

// ─── Startup env validation ───────────────────────────────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SESSION_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    console.error(chalk.redBright(`[FATAL] Missing required environment variables: ${missingEnv.join(', ')}`));
    console.error(chalk.yellow('Set them before starting the server.'));
    process.exit(1);
}

// ─── Crash handlers ───────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error(chalk.redBright('[UNCAUGHT EXCEPTION]'), err);
});
process.on('unhandledRejection', (reason) => {
    console.error(chalk.redBright('[UNHANDLED REJECTION]'), reason);
});

function extractToken(raw) {
    const trimmed = raw.trim();
    const parts = trimmed.split(':');
    if (parts.length >= 3) return parts.slice(2).join(':');
    return trimmed;
}

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust first proxy (nginx/caddy on VPS)
app.set('trust proxy', 1);

// Ensure sessions directory exists
const SESSION_DIR = path.join(__dirname, '.sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

app.use(express.json());
app.use(session({
    store: new FileStore({ path: SESSION_DIR, retries: 1, ttl: 7 * 24 * 60 * 60 }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'strict' : 'lax'
    }
}));

// ─── Campaign event webhook (per-user) ────────────────────────────────────────
async function fireCampaignWebhook(userId, event, data = {}) {
    try {
        const config = UD.loadUserConfig(userId);
        const webhookUrl = config.campaign_webhook_url;
        if (!webhookUrl) return;
        const events = config.campaign_webhook_events || {};
        if (!events[event]) return;

        const eventMeta = {
            campaign_started:        { color: 0x57f287, title: '🚀 ¢αмραιgη ѕтαятє∂ ...' },
            campaign_completed:      { color: 0x5865f2, title: '🏁 ¢αмραιgη ¢σмρℓєтє∂ ...' },
            campaign_stopped:        { color: 0xed4245, title: '🛑 ¢αмραιgη ѕтσρρє∂ ...' },
            token_retired:           { color: 0xfee75c, title: '⚠️ тσкєη яєтιяє∂ ...' },
            token_unhealthy:         { color: 0xed4245, title: '🔴 тσкєη υηнєαℓтну ...' },
            token_rate_limit_spike:  { color: 0xff7700, title: '⚡ яαтє ℓιмιт ѕριкє ∂єтє¢тє∂ ...' },
        };
        const meta = eventMeta[event] || { color: 0x99aab5, title: '🔔 єvєηт ∂єтє¢тє∂ ...' };

        const sep = '\n─────────────────────\n';

        let description;
        const now = new Date().toUTCString();

        if (event === 'campaign_started') {
            const labelLine = data['Label'] ? [`🏷️ Label — **${data['Label']}**`] : [];
            description = [
                ...labelLine,
                `👥 Members Targeted — **${data['Members'] ?? '?'}**`,
                `🪙 Tokens Loaded — **${data['Tokens'] ?? '?'}**`,
                `🕒 Start Time — ${now}`,
            ].join(sep);
        } else if (event === 'campaign_completed') {
            const labelLine = data['Label'] ? [`🏷️ Label — **${data['Label']}**`] : [];
            description = [
                ...labelLine,
                `📨 DMs Sent — **${data['DMs Sent'] ?? '?'}**`,
                `✅ Success Rate — **${data['Success Rate'] ?? '?'}**`,
                `👥 Members Targeted — **${data['Members'] ?? '?'}**`,
                `🪙 Tokens Used — **${data['Tokens Used'] ?? '?'}**`,
                `🚫 Blocked This Run — **${data['Blocked'] ?? '?'}**`,
                `⏱ Duration — **${data['Duration'] ?? '?'}**`,
                `🕒 Started — ${data['Start Time'] ?? '?'}`,
                `🏁 Ended — ${now}`,
            ].join(sep);
        } else if (event === 'campaign_stopped') {
            const labelLine = data['Label'] ? [`🏷️ Label — **${data['Label']}**`] : [];
            description = [
                ...labelLine,
                `📨 DMs Sent — **${data['DMs Sent'] ?? '?'}**`,
                `🪙 Tokens Active — **${data['Tokens Used'] ?? '?'}**`,
                `🚫 Blocked This Run — **${data['Blocked'] ?? '?'}**`,
                `⏱ Duration — **${data['Duration'] ?? '?'}**`,
                `🛑 Stopped At — ${now}`,
            ].join(sep);
        } else if (event === 'token_retired') {
            description = [
                `🪙 Token — \`${data['Token'] ?? '?'}\``,
                `📋 Reason — **${data['Reason'] ?? '?'}**`,
                `🏷 Status — **${data['Status'] ?? '?'}**`,
                `📨 DMs Sent — **${data['Sent'] ?? '?'}**`,
                `❌ Errors — **${data['Errors'] ?? '?'}**`,
                `🕒 Retired At — ${now}`,
            ].join(sep);
        } else if (event === 'token_unhealthy') {
            description = [
                `🪙 Token — \`${data['Token'] ?? '?'}\``,
                `❌ Consecutive Errors — **${data['Errors'] ?? '?'}**`,
                `🕒 Detected At — ${now}`,
            ].join(sep);
        } else if (event === 'token_rate_limit_spike') {
            description = [
                `🪙 Token — \`${data['Token'] ?? '?'}\``,
                `⚡ Rate Limits — **${data['Rate Limits'] ?? '?'}**`,
                `⏱ Current Delay — **${data['Current Delay'] ?? '?'}**`,
                `📨 DMs Sent — **${data['Sent'] ?? '?'}**`,
                `🕒 Spike Detected At — ${now}`,
            ].join(sep);
        } else {
            description = Object.entries(data)
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => `**${k}** — ${v}`)
                .join(sep);
        }

        await axios.post(webhookUrl, {
            username: 'Nubycord Logs',
            avatar_url: 'https://i.imgur.com/4M34hi2.png',
            embeds: [{
                title: meta.title,
                color: meta.color,
                description,
                footer: { text: 'Nubycord Campaign Monitor' },
                timestamp: new Date().toISOString(),
            }]
        }, { timeout: 5000 });
    } catch (err) {
        console.error('[WEBHOOK] Campaign webhook failed:', err.message);
    }
}

// ─── Discord webhook login notification ───────────────────────────────────────
async function fireLoginWebhook(user, displayName, loginType, loginCount, ip, userAgent, source) {
    const webhookUrl = Settings.getWebhookUrl();
    if (!webhookUrl) return;
    try {
        const isAdmin = user.is_admin;
        const color   = isAdmin ? 0xffc83c : 0x5865f2;
        const roleLabel = isAdmin ? '👾 Admin' : '👾 User';
        const typeLabel = loginType === 'first-time' ? '🆕 First-time Setup' : loginType === 'test' ? '🧪 Test Ping' : '🔁 Returning Login';
        const createdAt = user.created_at ? new Date(user.created_at).toUTCString() : 'Unknown';
        const now = new Date().toUTCString();

        const sep = '\n─────────────────────\n';
        const sourceDisplay = (() => {
            try {
                const u = new URL(source);
                const p = u.pathname && u.pathname !== '/' ? u.pathname : '';
                return `🌐 Source — [${u.host}${p}](${source})`;
            } catch { return `🌐 Source — \`${source || 'Unknown'}\``; }
        })();
        const description = [
            sourceDisplay,
            `👤 Display Name — **${displayName || 'Not set'}**`,
            `🔑 Mutex — \`${user.mutex}\``,
            `🎭 Role — ${roleLabel}`,
            `📋 Login Type — ${typeLabel}`,
            `🔢 Total Logins — **${loginCount}**`,
            `🌐 IP Address — \`${ip || 'Unknown'}\``,
            `🖥️ User-Agent — ${(userAgent || 'Unknown').slice(0, 200)}`,
            `📅 Account Created — ${createdAt}`,
            `🕒 Login Time — ${now}`
        ].join(sep);

        const embed = {
            title: '🔐 ℓσgιη ∂єтє¢тє∂ ...',
            color,
            description,
            footer: { text: 'Nubycord Login Monitor' },
            timestamp: new Date().toISOString()
        };

        await axios.post(webhookUrl, { username: 'Nubycord Logs', avatar_url: 'https://i.imgur.com/4M34hi2.png', embeds: [embed] }, { timeout: 5000 });
    } catch (err) {
        console.error(chalk.redBright('[WEBHOOK] Failed to send login notification:'), err.message);
    }
}

// ─── Auth middleware helpers ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    if (req.headers['content-type'] === 'application/json' || req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    res.status(403).json({ success: false, message: 'Admin only' });
}

// ─── Auth routes (public) ─────────────────────────────────────────────────────
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

// ─── One-time admin bootstrap (disabled once any admin exists) ────────────────
app.get('/setup', async (req, res) => {
    const exists = await Auth.adminExists().catch(() => false);
    if (exists) return res.redirect('/login.html');
    res.sendFile(path.join(__dirname, 'public/setup.html'));
});

app.post('/auth/bootstrap', async (req, res) => {
    try {
        const exists = await Auth.adminExists();
        if (exists) return res.json({ success: false, message: 'Admin already exists.' });
        const { password } = req.body;
        if (!password || password.length < 8) return res.json({ success: false, message: 'Password must be at least 8 characters.' });
        const mutex = Auth.generateMutex();
        await Auth.createAdmin(mutex, password);
        res.json({ success: true, mutex });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/auth/check-mutex', async (req, res) => {
    try {
        const { mutex } = req.body;
        if (!mutex || !mutex.trim()) return res.json({ exists: false });
        console.log(chalk.cyan('[AUTH] check-mutex for:'), mutex.trim().slice(0, 10) + '...');
        const user = await Auth.getUserByMutex(mutex);
        if (!user) {
            console.log(chalk.yellow('[AUTH] Mutex not found in DB'));
            return res.json({ exists: false });
        }
        console.log(chalk.greenBright('[AUTH] Mutex found, is_admin:'), user.is_admin);
        res.json({ exists: true, hasPassword: !!user.password_hash });
    } catch (err) {
        console.error(chalk.redBright('[AUTH] check-mutex exception:'), err.message);
        res.status(500).json({ exists: false, serverError: true, message: 'Database error. Check server configuration.' });
    }
});

app.post('/auth/setup-password', async (req, res) => {
    try {
        const { mutex, password, displayName } = req.body;
        if (!password || password.length < 8) return res.json({ success: false, message: 'Password too short' });
        if (!displayName || displayName.trim().length < 2) return res.json({ success: false, message: 'Display name must be at least 2 characters' });
        const user = await Auth.getUserByMutex(mutex);
        if (!user) return res.json({ success: false, message: 'Invalid access key' });
        if (user.password_hash) return res.json({ success: false, message: 'Password already set' });
        const updated = await Auth.setPassword(mutex, password);
        const name = displayName.trim().slice(0, 32);
        await Auth.setDisplayName(mutex, name);
        req.session.userId       = updated.id;
        req.session.mutex        = updated.mutex;
        req.session.isAdmin      = updated.is_admin;
        req.session.displayName  = name;
        const loginCount = Settings.incrementLoginCount(mutex);
        const ip     = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'Unknown';
        const ua     = req.headers['user-agent'] || 'Unknown';
        const source = req.headers['referer'] || req.headers['origin'] || 'Unknown';
        fireLoginWebhook(updated, name, 'first-time', loginCount, ip, ua, source);
        activeSessions.set(req.sessionID, { userId: updated.id, mutex: updated.mutex.slice(0, 12) + '...', ip, ua: ua.slice(0, 80), loginTime: new Date().toISOString() });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { mutex, password } = req.body;
        const user = await Auth.getUserByMutex(mutex);
        if (!user || !user.password_hash) return res.json({ success: false, message: 'Invalid credentials' });
        const ok = await Auth.verifyPassword(user.password_hash, password);
        if (!ok) return res.json({ success: false, message: 'Incorrect password' });
        const displayName = user.display_name || null;
        req.session.userId      = user.id;
        req.session.mutex       = user.mutex;
        req.session.isAdmin     = user.is_admin;
        req.session.displayName = displayName;
        const loginCount = Settings.incrementLoginCount(mutex);
        const ip     = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'Unknown';
        const ua     = req.headers['user-agent'] || 'Unknown';
        const source = req.headers['referer'] || req.headers['origin'] || 'Unknown';
        fireLoginWebhook(user, displayName, 'returning', loginCount, ip, ua, source);
        activeSessions.set(req.sessionID, { userId: user.id, mutex: user.mutex.slice(0, 12) + '...', ip, ua: ua.slice(0, 80), loginTime: new Date().toISOString() });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/auth/logout', (req, res) => {
    activeSessions.delete(req.sessionID);
    req.session.destroy(() => res.json({ success: true }));
});

// Admin-only routes
app.post('/auth/admin/generate-mutex', requireAdmin, async (req, res) => {
    try {
        const mutex = Auth.generateMutex();
        await Auth.createUser(mutex, req.session.mutex);
        res.json({ success: true, mutex });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/auth/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await Auth.listUsers();
        res.json({ success: true, users });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/auth/admin/delete-user', requireAdmin, async (req, res) => {
    try {
        const { mutex } = req.body;
        if (mutex === req.session.mutex) return res.json({ success: false, message: 'Cannot delete yourself' });
        await Auth.deleteUser(mutex);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── Admin: Webhook / Global Settings ────────────────────────────────────────
app.get('/api/admin/settings', requireAdmin, (req, res) => {
    res.json({ success: true, webhookUrl: Settings.getWebhookUrl() });
});

app.post('/api/admin/settings', requireAdmin, express.json(), (req, res) => {
    const { webhookUrl } = req.body;
    Settings.setWebhookUrl((webhookUrl || '').trim());
    res.json({ success: true, message: 'Settings saved' });
});

app.get('/api/version', requireAuth, (req, res) => {
    res.json({ success: true, version: Settings.getAppVersion() });
});

app.get('/api/admin/version', requireAdmin, (req, res) => {
    res.json({ success: true, version: Settings.getAppVersion() });
});

app.post('/api/admin/version', requireAdmin, express.json(), (req, res) => {
    const { version } = req.body;
    if (!version || typeof version !== 'string' || !version.trim()) {
        return res.json({ success: false, message: 'Invalid version string' });
    }
    Settings.setAppVersion(version.trim());
    res.json({ success: true, message: 'Version updated', version: version.trim() });
});

app.post('/api/admin/test-webhook', requireAdmin, async (req, res) => {
    const webhookUrl = Settings.getWebhookUrl();
    if (!webhookUrl) return res.json({ success: false, message: 'No webhook URL configured.' });
    try {
        const testUser = {
            mutex: req.session.mutex || 'ADMIN-TEST',
            is_admin: true
        };
        await fireLoginWebhook(testUser, 'Admin (Test)', 'test', 0, '127.0.0.1', req.headers['user-agent'] || 'Unknown', req.headers['referer'] || 'Admin Test Webhook');
        res.json({ success: true, message: 'Test webhook sent.' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── Admin: Users with display names + login counts ──────────────────────────
app.get('/auth/admin/users-extended', requireAdmin, async (req, res) => {
    try {
        const users = await Auth.listUsers();
        const extended = users.map(u => ({
            ...u,
            loginCount: Settings.getLoginCount(u.mutex)
        }));
        res.json({ success: true, users: extended });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Serve admin panel (admin only via redirect guard in HTML)
app.get('/admin.html', requireAuth, (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// Static files (login.html served above; everything else gated)
app.use((req, res, next) => {
    const pub = ['/login.html', '/setup', '/favicon.ico', '/logo.png', '/styles.css', '/setup.html', '/robots.txt', '/sitemap.xml', '/manifest.json'];
    if (pub.some(p => req.path === p) || req.path.startsWith('/auth/')) return next();
    requireAuth(req, res, next);
});

app.use(express.static('public'));

// ─── Per-user campaign state ───────────────────────────────────────────────────
const userState = {};
const activeSessions = new Map();

function getState(userId) {
    if (!userState[userId]) {
        userState[userId] = {
            activeClients: {},
            currentStatus: {},
            campaignPaused: false,
            pausedTokens: new Set(),
            scrapingActive: false,
            scrapingType: null,
            campaignScheduleTimer: null,
            campaignScheduledAt: null,
            tokenStats: {},
            logBuffer: [],
            logClearTimer: null,
            recentOutcomes: [],
            abTestStats: {},
            tokenReserveQueue: [],
            sentVariantMap: {},
            variantReplies: {},
            friendPending: {},
            autoReplied: new Set(),
            dmStatusLog: [],
            nodeWorkers: {},
            // Rate-limit spike tracking: { [token]: number[] } — array of timestamps
            rateLimitEvents: {},
            // Shared member pool exposed for distributed node access
            sharedPool: null,
        };
    }
    return userState[userId];
}

const MAX_LOG_ENTRIES = 2000;

function pushLog(userId, level, message) {
    const st = getState(userId);
    const entry = { ts: new Date().toISOString(), level, message };
    st.logBuffer.push(entry);
    if (st.logBuffer.length > MAX_LOG_ENTRIES) st.logBuffer.shift();

    const tsShort = new Date().toLocaleTimeString('en-US', { hour12: false });
    const tag = `[${tsShort}][${userId.slice(0,8)}]`;
    if (level === 'success')  console.log(chalk.greenBright(tag), message);
    else if (level === 'error')   console.log(chalk.redBright(tag), message);
    else if (level === 'warn')    console.log(chalk.yellowBright(tag), message);
    else if (level === 'blocked') console.log(chalk.hex('#FFA500')(tag), message);
    else if (level === 'ready')   console.log(chalk.cyanBright(tag), message);
    else if (level === 'done')    console.log(chalk.blueBright(tag), message);
    else console.log(chalk.white(tag), message);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function loadFile(userId, filename) {
    return UD.loadUserFile(userId, filename);
}

function saveFile(userId, filename, content) {
    UD.saveUserFile(userId, filename, content);
}

function loadJsonFile(userId, filename) {
    try {
        const lines = UD.loadUserFile(userId, filename);
        const content = lines.join('\n').trim();
        return content ? JSON.parse(content) : {};
    } catch { return {}; }
}

function saveJsonFile(userId, filename, data) {
    try {
        UD.saveUserFile(userId, filename, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`[saveJsonFile] Failed to write ${filename} for user ${userId}:`, err.message);
    }
}

function saveCampaignHistory(userId, status, tokenStatsSnap) {
    const history = UD.loadUserHistory(userId);
    const startMs = status.startTime ? new Date(status.startTime).getTime() : Date.now();
    const endMs   = Date.now();
    const durationMs = endMs - startMs;
    const totalSent  = status.messagesSent || 0;
    const totalErrors = status.errorsTotal || 0;
    const successRate = (totalSent + totalErrors) > 0
        ? Math.round((totalSent / (totalSent + totalErrors)) * 100)
        : 100;

    const entry = {
        id: Date.now(),
        label: (status.label || '').trim(),
        startTime: status.startTime || new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs,
        totalSent,
        totalErrors,
        successRate,
        totalMembers: status.totalMembers || 0,
        totalTokens: status.totalTokens || 0,
        blockedThisRun: status.blockedThisRun || 0,
        timeline: Analytics.getTimeline(userId),
        tokenSummary: Object.entries(tokenStatsSnap).map(([token, s]) => ({
            tag: s.tag || (token.substring(0, 20) + '...'),
            sent: s.sent,
            errors: s.errors,
            status: s.status
        }))
    };
    history.unshift(entry);
    if (history.length > 50) history.splice(50);
    UD.saveUserHistory(userId, history);
}

function checkCampaignComplete(userId, sharedPool) {
    const st = getState(userId);
    setTimeout(() => {
        // Smart token rotation: launch next reserve token if members remain and no active clients
        if (st.tokenReserveQueue && st.tokenReserveQueue.length > 0 && sharedPool.length > 0 && Object.keys(st.activeClients).length === 0) {
            const nextToken = st.tokenReserveQueue.shift();
            const cfg = UD.loadUserConfig(userId);
            pushLog(userId, 'info', `[POOL] Reserve token activated — ${st.tokenReserveQueue.length} remaining in queue`);
            setTimeout(async () => { if (sharedPool.length > 0) await loginAndDM(userId, nextToken, sharedPool); },
                randomInt(cfg.login_delay_min || 2000, cfg.login_delay_max || 5000));
            return;
        }
        if (sharedPool.length === 0 && Object.keys(st.activeClients).length === 0 && st.currentStatus.running) {
            st.currentStatus.running = false;
            st.currentStatus.completedAt = new Date().toISOString();
            st.sharedPool = null;
            st.rateLimitEvents = {};
            Analytics.stopTracking(userId);
            const sent    = st.currentStatus.messagesSent || 0;
            const blocked = st.currentStatus.blockedThisRun || 0;
            pushLog(userId, 'done', `[COMPLETE] Campaign finished! Total DMs sent: ${sent}`);
            saveCampaignHistory(userId, st.currentStatus, st.tokenStats);
            const _compMs = Date.now() - new Date(st.currentStatus.startTime || Date.now()).getTime();
            const _compM  = Math.floor(_compMs / 60000);
            const _compDur = _compM > 0 ? `${_compM}m ${Math.floor((_compMs % 60000) / 1000)}s` : `${Math.floor(_compMs / 1000)}s`;
            const _totalErrors = st.currentStatus.errorsTotal || 0;
            const _successRate = (sent + _totalErrors) > 0 ? `${Math.round((sent / (sent + _totalErrors)) * 100)}%` : '100%';
            fireCampaignWebhook(userId, 'campaign_completed', {
                'Label':        st.currentStatus.label || '',
                'DMs Sent':     sent,
                'Success Rate': _successRate,
                'Members':      st.currentStatus.totalMembers || 0,
                'Tokens Used':  st.currentStatus.totalTokens || 0,
                'Blocked':      blocked,
                'Duration':     _compDur,
                'Start Time':   new Date(st.currentStatus.startTime || Date.now()).toUTCString(),
            });
        }
    }, 2000);
}

// ─── API: Logs ──────────────────────────────────────────────────────────────
app.get('/api/logs', requireAuth, (req, res) => res.json(getState(req.session.userId).logBuffer));
app.delete('/api/logs', requireAuth, (req, res) => { getState(req.session.userId).logBuffer = []; res.json({ success: true }); });

// ─── API: Blocked ────────────────────────────────────────────────────────────
app.get('/api/blocked', requireAuth, (req, res) => {
    const blocked = loadFile(req.session.userId, 'blocked_members.txt');
    res.json({ count: blocked.length, members: blocked });
});
app.delete('/api/blocked', requireAuth, (req, res) => {
    saveFile(req.session.userId, 'blocked_members.txt', '');
    res.json({ success: true, message: 'Blocked members list cleared' });
});

// ─── API: History ────────────────────────────────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => res.json(UD.loadUserHistory(req.session.userId)));
app.delete('/api/history', requireAuth, (req, res) => {
    UD.saveUserHistory(req.session.userId, []);
    res.json({ success: true, message: 'Campaign history cleared' });
});

// ─── API: DM Status Log ──────────────────────────────────────────────────────
app.get('/api/dm-status', requireAuth, (req, res) => {
    const log = getState(req.session.userId).dmStatusLog || [];
    const sent    = log.filter(e => e.status === 'sent').length;
    const replied = log.filter(e => e.status === 'replied').length;
    const blocked = log.filter(e => e.status === 'blocked').length;
    const errors  = log.filter(e => e.status === 'error').length;
    res.json({ log, total: log.length, sent, replied, blocked, errors });
});
app.delete('/api/dm-status', requireAuth, (req, res) => {
    getState(req.session.userId).dmStatusLog = [];
    res.json({ success: true });
});
app.get('/api/dm-status/export', requireAuth, (req, res) => {
    const log = getState(req.session.userId).dmStatusLog || [];
    const rows = ['Member ID,Username,Status,Reason,Token,Timestamp,Reply Count,Last Reply At,Last Reply Text'];
    for (const e of log) {
        const safeReason = `"${(e.reason || '').replace(/"/g, '""')}"`;
        const safeReplyText = `"${(e.lastReplyText || '').replace(/"/g, '""')}"`;
        rows.push([e.memberId, e.username || '', e.status, safeReason, e.tokenTag || '', e.timestamp, e.replyCount || 0, e.lastReplyAt || '', safeReplyText].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dm_status_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(rows.join('\n'));
});

// ─── API: Config ─────────────────────────────────────────────────────────────
app.get('/api/config', requireAuth, (req, res) => res.json(UD.loadUserConfig(req.session.userId)));

// ─── API: Data ───────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    const tokens  = loadFile(uid, 'tokens.txt');
    const members = loadFile(uid, 'members.txt');
    const blocked = loadFile(uid, 'blocked_members.txt');
    const serverId = loadFile(uid, 'serverId.txt')[0] || '';

    res.json({
        tokens,
        members,
        blocked: blocked.length,
        serverId,
        activeClients: Object.keys(st.activeClients).length,
        messagesSent: st.currentStatus.messagesSent ?? 0,
        tokenStats: st.tokenStats,
        paused: st.campaignPaused,
        pausedTokens: [...st.pausedTokens],
        scrapingActive: st.scrapingActive,
        scrapingType: st.scrapingType,
        scraperProgress: st.currentStatus.scraperProgress || null,
        scheduled: st.campaignScheduleTimer !== null,
        scheduledAt: st.campaignScheduledAt,
        status: st.currentStatus,
        isAdmin: req.session.isAdmin || false,
        checkpoint: (() => {
            try {
                const cp = loadJsonFile(uid, 'campaign_checkpoint.json');
                if (cp && cp.remainingMembers && cp.remainingMembers.length > 0) {
                    return { savedAt: cp.savedAt, remaining: cp.remainingMembers.length, sent: cp.messagesSent || 0, total: cp.totalMembers || 0 };
                }
            } catch (_) {}
            return null;
        })()
    });
});

// ─── API: Pause / Resume ─────────────────────────────────────────────────────
app.post('/api/pause', requireAuth, (req, res) => {
    const st = getState(req.session.userId);
    st.campaignPaused = true;
    st.currentStatus.paused = true;
    pushLog(req.session.userId, 'info', '[PAUSED] Campaign paused — all tokens are holding');
    res.json({ success: true, message: 'Campaign paused' });
});

app.post('/api/resume', requireAuth, (req, res) => {
    const st = getState(req.session.userId);
    st.campaignPaused = false;
    st.currentStatus.paused = false;
    pushLog(req.session.userId, 'info', '[RESUMED] Campaign resumed');
    res.json({ success: true, message: 'Campaign resumed' });
});

app.post('/api/pause-token', express.json(), requireAuth, (req, res) => {
    const st = getState(req.session.userId);
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });
    st.pausedTokens.add(token);
    const tag = st.tokenStats[token]?.tag || token.substring(0, 20) + '...';
    pushLog(req.session.userId, 'info', `[PAUSED] @${tag} individually paused`);
    res.json({ success: true });
});

app.post('/api/resume-token', express.json(), requireAuth, (req, res) => {
    const st = getState(req.session.userId);
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });
    st.pausedTokens.delete(token);
    const tag = st.tokenStats[token]?.tag || token.substring(0, 20) + '...';
    pushLog(req.session.userId, 'info', `[RESUMED] @${tag} individually resumed`);
    res.json({ success: true });
});

// ─── API: Schedule ───────────────────────────────────────────────────────────
app.post('/api/schedule', express.json(), requireAuth, (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    const { delayMs } = req.body;
    if (st.campaignScheduleTimer) {
        clearTimeout(st.campaignScheduleTimer);
        st.campaignScheduleTimer = null;
        st.campaignScheduledAt = null;
    }
    if (!delayMs || delayMs <= 0) return res.json({ success: false, message: 'Invalid delay' });
    st.campaignScheduledAt = new Date(Date.now() + delayMs).toISOString();
    pushLog(uid, 'info', `[SCHEDULED] Campaign scheduled to start at ${new Date(st.campaignScheduledAt).toLocaleTimeString()}`);
    st.campaignScheduleTimer = setTimeout(() => {
        st.campaignScheduleTimer = null;
        st.campaignScheduledAt = null;
        triggerCampaignStart(uid);
    }, delayMs);
    res.json({ success: true, message: 'Campaign scheduled', scheduledAt: st.campaignScheduledAt });
});

app.post('/api/cancel-schedule', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    if (st.campaignScheduleTimer) {
        clearTimeout(st.campaignScheduleTimer);
        st.campaignScheduleTimer = null;
        st.campaignScheduledAt = null;
        pushLog(uid, 'info', '[SCHEDULE CANCELLED] Scheduled campaign was cancelled');
        res.json({ success: true, message: 'Schedule cancelled' });
    } else {
        res.json({ success: false, message: 'No campaign scheduled' });
    }
});

// ─── API: Update Config ───────────────────────────────────────────────────────
app.post('/api/update-config', express.json(), requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        const existing = UD.loadUserConfig(uid);
        const newConfig = { ...existing, ...req.body };
        UD.saveUserConfig(uid, newConfig);
        pushLog(uid, 'info', '[CONFIG] Settings saved successfully');
        res.json({ success: true, message: 'Config updated' });
    } catch (error) {
        pushLog(req.session.userId, 'error', `[CONFIG] Failed to save settings: ${error.message}`);
        res.json({ success: false, message: error.message });
    }
});

// ─── API: Tokens / Members / Server ID ───────────────────────────────────────
app.post('/api/update-tokens', express.json(), requireAuth, (req, res) => {
    try {
        saveFile(req.session.userId, 'tokens.txt', req.body.tokens.filter(t => t.trim()).join('\n'));
        res.json({ success: true, message: 'Tokens updated' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/validate-tokens', express.json(), requireAuth, async (req, res) => {
    try {
        const { tokens } = req.body;
        if (!tokens || tokens.length === 0) return res.json({ success: true, tokens: [] });

        const CONCURRENCY = 5;
        const BATCH_DELAY_MS = 1200;
        const NITRO_TYPES = { 0: null, 1: 'Classic', 2: 'Nitro', 3: 'Basic' };
        const results = [];

        const batches = [];
        const filtered = tokens.filter(t => t && t.trim());
        for (let i = 0; i < filtered.length; i += CONCURRENCY) {
            batches.push(filtered.slice(i, i + CONCURRENCY));
        }

        for (let bi = 0; bi < batches.length; bi++) {
            const batch = batches[bi];
            const batchResults = await Promise.all(batch.map(async (rawToken) => {
                const token = extractToken(rawToken);
                try {
                    const resp = await axios.get('https://discord.com/api/v9/users/@me', {
                        headers: {
                            Authorization: token,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'X-Discord-Locale': 'en-US',
                        },
                        timeout: 8000,
                        validateStatus: () => true,
                    });
                    if (resp.status === 200) {
                        const u = resp.data;
                        return {
                            token: rawToken,
                            valid: true,
                            username: u.username,
                            discriminator: u.discriminator || '0',
                            userId: u.id,
                            email: u.email || null,
                            phone: u.phone ? true : false,
                            verified: u.verified || false,
                            nitro: NITRO_TYPES[u.premium_type] || null,
                            mfaEnabled: u.mfa_enabled || false,
                        };
                    }
                    const reasons = { 401: 'invalid', 403: 'locked', 429: 'ratelimited' };
                    return { token: rawToken, valid: false, reason: reasons[resp.status] || `http_${resp.status}` };
                } catch {
                    return { token: rawToken, valid: false, reason: 'timeout' };
                }
            }));
            results.push(...batchResults);
            if (bi < batches.length - 1) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }

        res.json({ success: true, tokens: results });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/join-server', express.json(), requireAuth, async (req, res) => {
    try {
        const { tokens, inviteCode, delay = 2000 } = req.body;
        if (!tokens || tokens.length === 0) return res.json({ success: false, message: 'No tokens provided' });
        if (!inviteCode) return res.json({ success: false, message: 'No invite code provided' });

        const code = inviteCode.trim().replace(/^https?:\/\/(www\.)?discord\.(gg|com\/invite)\//, '').replace(/\/$/, '');

        const userId = req.session?.userId;
        const config = userId ? UD.loadUserConfig(userId) : {};

        let captchaSolver = null;
        if (config.captcha?.enabled && config.captcha?.apiKey) {
            captchaSolver = new CaptchaSolver(config.captcha.apiKey, config.captcha.service || 'anticaptcha');
        }

        // Feature 1: Dynamic Super-Properties — generate per-request using current build number
        const _joinFp = Fingerprint.generateFingerprint();
        const DISCORD_HEADERS = {
            'Content-Type': 'application/json',
            'User-Agent': _joinFp.userAgent,
            'X-Super-Properties': Fingerprint.buildSuperPropertiesXHeader(_joinFp),
            'X-Discord-Locale': _joinFp.languages[0] || 'en-US',
            'Referer': 'https://discord.com/',
            'Origin': 'https://discord.com'
        };

        const results = [];
        for (const rawToken of tokens) {
            const token = extractToken(rawToken.trim());
            if (!token) continue;
            const tokenPrefix = rawToken.split('.')[0] || token.split('.')[0];
            try {
                const authHeaders = { ...DISCORD_HEADERS, 'Authorization': token };

                let body = { session_id: null };
                let response = await axios.post(
                    `https://discord.com/api/v9/invites/${code}`,
                    body,
                    { headers: authHeaders, timeout: 10000, validateStatus: () => true }
                );

                if (response.status === 400 && response.data?.captcha_key) {
                    if (!captchaSolver) {
                        results.push({ token: tokenPrefix, status: 'failed', message: 'Captcha required — enable captcha solver in settings' });
                        if (delay > 0) await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    const sitekey = response.data.captcha_sitekey;
                    const rqtoken = response.data.captcha_rqtoken;
                    const rqdata = response.data.captcha_rqdata || null;
                    let captchaToken;
                    try {
                        captchaToken = await captchaSolver.solveDiscordCaptcha(sitekey, `https://discord.com/invite/${code}`, rqdata);
                    } catch (capErr) {
                        results.push({ token: tokenPrefix, status: 'failed', message: `Captcha solve failed: ${capErr.message}` });
                        if (delay > 0) await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    body = { session_id: null, captcha_key: captchaToken };
                    if (rqtoken) body.captcha_rqtoken = rqtoken;
                    if (rqdata) body.captcha_rqdata = rqdata;
                    response = await axios.post(
                        `https://discord.com/api/v9/invites/${code}`,
                        body,
                        { headers: authHeaders, timeout: 10000, validateStatus: () => true }
                    );
                }

                if (response.status === 200 || response.status === 204) {
                    const guildName = response.data?.guild?.name || 'Unknown Server';
                    const guildId = response.data?.guild?.id;

                    if (guildId) {
                        try {
                            const screeningRes = await axios.get(
                                `https://discord.com/api/v9/guilds/${guildId}/member-verification?with_guild=false&invite_code=${code}`,
                                { headers: authHeaders, timeout: 8000, validateStatus: () => true }
                            );
                            if (screeningRes.status === 200 && screeningRes.data?.form_fields) {
                                const fields = screeningRes.data.form_fields.map(f => ({ ...f, response: true }));
                                await axios.put(
                                    `https://discord.com/api/v9/guilds/${guildId}/requests/@me`,
                                    { version: screeningRes.data.version, form_fields: fields },
                                    { headers: authHeaders, timeout: 8000, validateStatus: () => true }
                                );
                            }
                        } catch (_) {}
                    }

                    results.push({ token: tokenPrefix, status: 'joined', message: `Joined ${guildName}` });
                } else if (response.status === 401) {
                    results.push({ token: tokenPrefix, status: 'failed', message: 'Invalid token' });
                } else if (response.status === 403) {
                    const msg = response.data?.message || 'Forbidden';
                    results.push({ token: tokenPrefix, status: 'failed', message: msg });
                } else if (response.status === 404) {
                    results.push({ token: tokenPrefix, status: 'failed', message: 'Invalid or expired invite code' });
                } else if (response.status === 400) {
                    const msg = response.data?.message || 'Bad request';
                    results.push({ token: tokenPrefix, status: 'failed', message: msg });
                } else if (response.status === 429) {
                    const retryAfter = response.data?.retry_after || 5;
                    results.push({ token: tokenPrefix, status: 'ratelimit', message: `Rate limited (retry after ${retryAfter}s)` });
                } else {
                    results.push({ token: tokenPrefix, status: 'failed', message: `HTTP ${response.status}` });
                }
            } catch (err) {
                results.push({ token: tokenPrefix, status: 'failed', message: err.message });
            }
            if (delay > 0) await new Promise(r => setTimeout(r, delay));
        }

        res.json({ success: true, results });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/update-members', express.json(), requireAuth, (req, res) => {
    try {
        saveFile(req.session.userId, 'members.txt', req.body.members.filter(m => m.trim()).join('\n'));
        res.json({ success: true, message: 'Members updated' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/update-server-id', express.json(), requireAuth, (req, res) => {
    try {
        saveFile(req.session.userId, 'serverId.txt', req.body.serverId);
        res.json({ success: true, message: 'Server ID updated' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ─── API: Start Campaign ──────────────────────────────────────────────────────
async function triggerCampaignStart(userId) {
    const st = getState(userId);
    // Capture and immediately clean up pending label so early-returns don't leave it dangling
    const pendingLabel = st._pendingLabel || '';
    delete st._pendingLabel;

    const config = UD.loadUserConfig(userId);
    const tokens  = loadFile(userId, 'tokens.txt');
    const members = loadFile(userId, 'members.txt');

    if (!tokens.length || !members.length || !config.dm_messages || !config.dm_messages.length) return;

    // Feature 2: Sort tokens by tier priority (T1 → T2 → T3) when tier system is enabled
    if (config.token_tier_enabled) {
        const _tierPri = { T1: 3, T2: 2, T3: 1 };
        tokens.sort((a, b) => (_tierPri[TokenTiers.getTier(userId, b)] || 1) - (_tierPri[TokenTiers.getTier(userId, a)] || 1));
        const t1c = tokens.filter(t => TokenTiers.getTier(userId, t) === 'T1').length;
        const t2c = tokens.filter(t => TokenTiers.getTier(userId, t) === 'T2').length;
        const t3c = tokens.filter(t => TokenTiers.getTier(userId, t) === 'T3').length;
        pushLog(userId, 'info', `[TIERS] Campaign tokens sorted by tier — T1 Elite: ${t1c} | T2 Active: ${t2c} | T3 Fresh: ${t3c}`);
    }

    st.campaignPaused = false;
    st.pausedTokens   = new Set();
    st.tokenStats     = {};
    st.logBuffer      = [];
    st.abTestStats    = {};
    st.recentOutcomes = [];
    st.tokenReserveQueue = [];
    // Feature 6/7: Reset response rate tracking on each campaign start
    st.sentVariantMap = {};
    st.variantReplies = {};
    st.friendPending  = {};
    st.autoReplied    = new Set();
    st.dmStatusLog    = [];
    st.rateLimitEvents = {};
    // Feature 6: Clear the LLM paraphrase cache for fresh variants this run
    Paraphrase.clearCache();
    if (st.logClearTimer) clearTimeout(st.logClearTimer);
    st.logClearTimer = setTimeout(() => { st.logBuffer = []; }, 3 * 60 * 60 * 1000);

    const blocked = new Set(loadFile(userId, 'blocked_members.txt'));
    let filteredMembers = members.filter(m => !blocked.has(m));
    const blockedCount = members.length - filteredMembers.length;
    if (blockedCount > 0) pushLog(userId, 'info', `Skipped ${blockedCount} blocked member(s) — ${filteredMembers.length} remaining`);

    // Cross-campaign deduplication
    if (config.global_dedup) {
        const dmedAll = new Set(loadFile(userId, 'dmed_all_time.txt'));
        const before = filteredMembers.length;
        filteredMembers = filteredMembers.filter(m => !dmedAll.has(m));
        const dedupSkipped = before - filteredMembers.length;
        if (dedupSkipped > 0) pushLog(userId, 'info', `[DEDUP] Skipped ${dedupSkipped} already-DM'd member(s) via global registry`);
    }

    if (!filteredMembers.length) {
        pushLog(userId, 'error', 'All members are blocked/already DM\'d — scrape fresh members or clear the blocked list');
        return;
    }

    // Auto-score filter before campaign
    if (config.campaign_min_score > 0) {
        const before = filteredMembers.length;
        filteredMembers = filteredMembers.filter(id => scoreByAge(snowflakeToAgeDays(id)) >= config.campaign_min_score);
        const removed = before - filteredMembers.length;
        if (removed > 0) pushLog(userId, 'info', `[SCORE FILTER] Removed ${removed} low-quality member(s) (min score: ${config.campaign_min_score}) — ${filteredMembers.length} remaining`);
        if (!filteredMembers.length) {
            pushLog(userId, 'error', '[SCORE FILTER] All members filtered out — lower the min score or disable the filter');
            return;
        }
    }

    // Proxy auto-test: filter dead proxies before campaign starts
    if (config.proxy?.enabled && config.proxy?.proxies?.length > 0) {
        pushLog(userId, 'info', `[PROXY] Auto-testing ${config.proxy.proxies.length} proxies before campaign start...`);
        try {
            const pm = new ProxyManager();
            pm.addProxies(config.proxy.proxies);
            const testResults = await pm.bulkTest(8);
            const workingProxies = testResults.filter(r => r.ok).map(r => r.proxy);
            const deadCount = testResults.filter(r => !r.ok).length;
            if (deadCount > 0) {
                pushLog(userId, 'warn', `[PROXY] Removed ${deadCount} dead proxies — ${workingProxies.length} healthy remaining`);
                const freshCfg = UD.loadUserConfig(userId);
                freshCfg.proxy.proxies = workingProxies;
                UD.saveUserConfig(userId, freshCfg);
            } else {
                pushLog(userId, 'info', `[PROXY] All ${workingProxies.length} proxies healthy`);
            }
        } catch (err) {
            pushLog(userId, 'warn', `[PROXY] Auto-test error: ${err.message} — continuing with configured proxies`);
        }
    }

    const sharedPool = [...filteredMembers];

    // Expose sharedPool on state so distributed nodes can claim members from it
    st.sharedPool = sharedPool;

    // Reset per-run tracking
    st.rateLimitEvents = {};

    st.currentStatus = {
        running: true,
        paused: false,
        label: pendingLabel,
        totalTokens: tokens.length,
        totalMembers: filteredMembers.length,
        messagesRemaining: sharedPool.length,
        messagesSent: 0,
        errorsTotal: 0,
        blockedThisRun: 0,
        blockedTotal: blocked.size,
        startTime: new Date().toISOString()
    };

    // Start analytics timeline tracking
    Analytics.reset(userId);
    Analytics.startTracking(userId, () => getState(userId).currentStatus);

    // Clear old sequence watchers for this user
    Sequences.clearWatcher(userId);

    pushLog(userId, 'info', `Campaign started — ${tokens.length} token(s), ${filteredMembers.length} member(s) queued`);

    fireCampaignWebhook(userId, 'campaign_started', {
        'Label':   st.currentStatus.label || '',
        'Members': filteredMembers.length,
        'Tokens':  tokens.length,
    });

    const concurrency = config.token_concurrency || 0;
    if (concurrency > 0 && tokens.length > concurrency) {
        st.tokenReserveQueue = tokens.slice(concurrency);
        pushLog(userId, 'info', `[POOL] Smart token rotation: ${concurrency} token(s) active, ${st.tokenReserveQueue.length} in reserve queue`);
        tokens.slice(0, concurrency).forEach((token, index) => {
            setTimeout(async () => { await loginAndDM(userId, token, sharedPool); },
                randomInt(config.login_delay_min, config.login_delay_max) * (index + 1));
        });
    } else {
        st.tokenReserveQueue = [];
        tokens.forEach((token, index) => {
            setTimeout(async () => { await loginAndDM(userId, token, sharedPool); },
                randomInt(config.login_delay_min, config.login_delay_max) * (index + 1));
        });
    }
}

app.post('/api/start', express.json(), requireAuth, (req, res) => {
    try {
        const uid    = req.session.userId;
        const st     = getState(uid);

        if (st.currentStatus && st.currentStatus.running) {
            return res.json({ success: false, message: 'A campaign is already running — stop it before starting a new one' });
        }

        const config = UD.loadUserConfig(uid);
        const tokens  = loadFile(uid, 'tokens.txt');
        const members = loadFile(uid, 'members.txt');

        if (!tokens.length)  return res.json({ success: false, message: 'No tokens provided' });
        if (!members.length) return res.json({ success: false, message: 'No members to DM — please scrape members first' });
        if (!config.dm_messages || !config.dm_messages.length) return res.json({ success: false, message: 'No DM messages configured — add at least one message in Config' });

        st._pendingLabel = (req.body && typeof req.body.label === 'string') ? req.body.label.trim() : '';
        triggerCampaignStart(uid);
        res.json({ success: true, message: 'DM campaign started' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ─── API: Rename Campaign Label ───────────────────────────────────────────────
app.patch('/api/history/:id/label', express.json(), requireAuth, (req, res) => {
    try {
        const uid   = req.session.userId;
        const entryId = parseInt(req.params.id, 10);
        const label = (req.body && typeof req.body.label === 'string') ? req.body.label.trim() : '';
        const history = UD.loadUserHistory(uid);
        const entry = history.find(e => e.id === entryId);
        if (!entry) return res.json({ success: false, message: 'Campaign not found' });
        entry.label = label;
        UD.saveUserHistory(uid, history);
        res.json({ success: true, label });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ─── API: Stop Campaign ───────────────────────────────────────────────────────
app.post('/api/stop', requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        const st  = getState(uid);
        Object.values(st.activeClients).forEach(client => { try { client.destroy(); } catch (_) {} });
        st.activeClients = {};
        st.campaignPaused = false;

        if (st.currentStatus.running) {
            st.currentStatus.running = false;
            st.currentStatus.stoppedAt = new Date().toISOString();
            st.sharedPool = null;
            st.rateLimitEvents = {};
            st.tokenReserveQueue = [];
            Analytics.stopTracking(uid);
            saveCampaignHistory(uid, st.currentStatus, st.tokenStats);
            const _stopMs  = Date.now() - new Date(st.currentStatus.startTime || Date.now()).getTime();
            const _stopM   = Math.floor(_stopMs / 60000);
            const _stopDur = _stopM > 0 ? `${_stopM}m ${Math.floor((_stopMs % 60000) / 1000)}s` : `${Math.floor(_stopMs / 1000)}s`;
            fireCampaignWebhook(uid, 'campaign_stopped', {
                'Label':       st.currentStatus.label || '',
                'DMs Sent':    st.currentStatus.messagesSent || 0,
                'Tokens Used': st.currentStatus.totalTokens || 0,
                'Blocked':     st.currentStatus.blockedThisRun || 0,
                'Duration':    _stopDur,
            });
        }
        res.json({ success: true, message: 'Campaign stopped' });

    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ─── Token Warm-Up Status API ─────────────────────────────────────────────────
app.get('/api/warming-status', requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        const cfg = UD.loadUserConfig(uid);
        const wr  = loadJsonFile(uid, 'warming_registry.json');
        const today    = new Date().toISOString().split('T')[0];
        const schedule = (cfg.token_warming_schedule && cfg.token_warming_schedule.length > 0)
            ? cfg.token_warming_schedule
            : [5, 10, 20, 35, 50, 75, 100];
        const tokens = Object.entries(wr).map(([tKey, entry]) => {
            const daysSince  = entry.firstSeen
                ? Math.floor((Date.now() - new Date(entry.firstSeen).getTime()) / 86400000)
                : 0;
            const todayCount = (entry.dailyCounts || {})[today] || 0;
            const graduated  = daysSince >= schedule.length;
            const todayLimit = graduated ? null : schedule[Math.min(daysSince, schedule.length - 1)];
            return { token: tKey, firstSeen: entry.firstSeen, daysSince, todayCount, todayLimit, graduated, scheduleLen: schedule.length };
        });
        res.json({ success: true, tokens, schedule });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.delete('/api/warming-registry', requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        saveJsonFile(uid, 'warming_registry.json', {});
        res.json({ success: true, message: 'Warming registry cleared' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── Campaign Checkpoint API ──────────────────────────────────────────────────
app.get('/api/checkpoint', requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        const cp = loadJsonFile(uid, 'campaign_checkpoint.json');
        if (cp && cp.remainingMembers && cp.remainingMembers.length > 0) {
            res.json({ success: true, checkpoint: cp });
        } else {
            res.json({ success: false });
        }
    } catch {
        res.json({ success: false });
    }
});

app.delete('/api/checkpoint', requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        saveJsonFile(uid, 'campaign_checkpoint.json', {});
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
});

app.post('/api/resume-checkpoint', express.json(), requireAuth, async (req, res) => {
    try {
        const uid  = req.session.userId;
        const st   = getState(uid);
        const cp   = loadJsonFile(uid, 'campaign_checkpoint.json');

        if (!cp || !cp.remainingMembers || !cp.remainingMembers.length) {
            return res.json({ success: false, message: 'No checkpoint found' });
        }

        const config  = UD.loadUserConfig(uid);
        const tokens  = loadFile(uid, 'tokens.txt');

        if (!tokens.length)  return res.json({ success: false, message: 'No tokens available' });
        if (!config.dm_messages || !config.dm_messages.length) return res.json({ success: false, message: 'No DM messages configured' });

        st.campaignPaused    = false;
        st.pausedTokens      = new Set();
        st.tokenStats        = {};
        st.logBuffer         = [];
        st.abTestStats       = {};
        st.recentOutcomes    = [];
        st.tokenReserveQueue = [];
        st.sentVariantMap    = {};
        st.variantReplies    = {};
        st.friendPending     = {};
        st.autoReplied       = new Set();
        st.dmStatusLog       = [];
        st.rateLimitEvents   = {};
        if (st.logClearTimer) clearTimeout(st.logClearTimer);
        st.logClearTimer = setTimeout(() => { st.logBuffer = []; }, 3 * 60 * 60 * 1000);

        const sharedPool = [...cp.remainingMembers];
        const resumedAt  = cp.messagesSent || 0;

        st.sharedPool = sharedPool;

        st.currentStatus = {
            running: true,
            paused: false,
            label: cp.label || '',
            totalTokens: tokens.length,
            totalMembers: cp.totalMembers || (sharedPool.length + resumedAt),
            messagesRemaining: sharedPool.length,
            messagesSent: resumedAt,
            errorsTotal: 0,
            blockedThisRun: 0,
            blockedTotal: 0,
            startTime: new Date().toISOString()
        };

        Analytics.reset(uid);
        Analytics.startTracking(uid, () => getState(uid).currentStatus);
        Sequences.clearWatcher(uid);

        saveJsonFile(uid, 'campaign_checkpoint.json', {});
        pushLog(uid, 'info', `[CHECKPOINT] Resuming campaign — ${sharedPool.length} members remaining (${resumedAt} already sent)`);

        const concurrency = config.token_concurrency || 0;
        if (concurrency > 0 && tokens.length > concurrency) {
            st.tokenReserveQueue = tokens.slice(concurrency);
            tokens.slice(0, concurrency).forEach((token, index) => {
                setTimeout(async () => { await loginAndDM(uid, token, sharedPool); },
                    randomInt(config.login_delay_min, config.login_delay_max) * (index + 1));
            });
        } else {
            st.tokenReserveQueue = [];
            tokens.forEach((token, index) => {
                setTimeout(async () => { await loginAndDM(uid, token, sharedPool); },
                    randomInt(config.login_delay_min, config.login_delay_max) * (index + 1));
            });
        }

        res.json({ success: true, message: `Resuming from checkpoint — ${sharedPool.length} members left` });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ─── Scraper helpers ─────────────────────────────────────────────────────────
function dedupeAndSave(userId, scrapedMembers) {
    const blocked = new Set(loadFile(userId, 'blocked_members.txt'));
    const filtered = scrapedMembers.filter(m => !blocked.has(m));
    const existingSet = new Set(loadFile(userId, 'members.txt'));
    const newMembers = filtered.filter(m => !existingSet.has(m));
    const updated = [...existingSet, ...newMembers];
    saveFile(userId, 'members.txt', updated.join('\n'));
    return {
        total: updated.length,
        newCount: newMembers.length,
        skippedBlocked: scrapedMembers.length - filtered.length,
        skippedDupes: filtered.length - newMembers.length,
    };
}

// ─── API: Scrapers ────────────────────────────────────────────────────────────
app.post('/api/scrape-opcode14', express.json(), requireAuth, async (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    st.scrapingActive = true; st.scrapingType = 'opcode14'; st.currentStatus.scraperProgress = { type: 'opcode14', phase: 'starting', found: 0 };
    try {
        const config = UD.loadUserConfig(uid);
        const { token, serverId, timePeriodMinutes } = req.body;
        if (!token || !serverId) return res.json({ success: false, message: 'Token and Server ID required' });

        const scraperOptions = {
            minAccountAge: config.scraper?.minAccountAgeMinutes || 0,
            filterAdmins: config.scraper?.filterAdmins !== false,
            filterBots: config.scraper?.filterBots !== false,
            timePeriodMinutes: timePeriodMinutes || null,
            onProgress: (p) => { st.currentStatus.scraperProgress = { ...p, type: 'opcode14' }; }
        };

        const scrapedMembers = await DiscordScrapers.scraperOpcode14(token, serverId, scraperOptions);
        if (scrapedMembers.length === 0) {
            return res.json({ success: false, message: 'No members were scraped. Ensure the token is valid and has access to the server.', members: [] });
        }

        const { total, newCount, skippedBlocked, skippedDupes } = dedupeAndSave(uid, scrapedMembers);
        const msg = `Opcode 14: ${scrapedMembers.length} scraped — ${newCount} new, ${skippedDupes} duplicates, ${skippedBlocked} blocked skipped — ${total} total in list`;
        res.json({ success: true, message: msg, members: scrapedMembers, scraperType: 'opcode14' });
    } catch (error) {
        res.json({ success: false, message: `Scraping failed: ${error.message}` });
    } finally {
        st.scrapingActive = false; st.scrapingType = null; st.currentStatus.scraperProgress = null;
    }
});

app.post('/api/scrape-reaction', express.json(), requireAuth, async (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    st.scrapingActive = true; st.scrapingType = 'reaction'; st.currentStatus.scraperProgress = { type: 'reaction', phase: 'starting', found: 0 };
    try {
        const { token, serverId, channelId, messageId, reactionEmoji } = req.body;
        if (!token || !serverId || !channelId || !messageId || !reactionEmoji) {
            return res.json({ success: false, message: 'Token, Server ID, Channel ID, Message ID, and Reaction Emoji required' });
        }

        const scrapedMembers = await DiscordScrapers.scraperReaction(
            token, serverId, channelId, messageId, reactionEmoji,
            { onProgress: (p) => { st.currentStatus.scraperProgress = { ...p, type: 'reaction' }; } }
        );

        const { total, newCount, skippedBlocked, skippedDupes } = dedupeAndSave(uid, scrapedMembers);
        const msg = `Reaction Scraper: ${scrapedMembers.length} reactors scraped — ${newCount} new, ${skippedDupes} duplicates, ${skippedBlocked} blocked skipped — ${total} total in list`;
        res.json({ success: true, message: msg, members: scrapedMembers, scraperType: 'reaction' });
    } catch (error) {
        res.json({ success: false, message: `Reaction scraping failed: ${error.message}` });
    } finally {
        st.scrapingActive = false; st.scrapingType = null; st.currentStatus.scraperProgress = null;
    }
});

app.post('/api/scrape-opcode8', express.json(), requireAuth, async (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    st.scrapingActive = true; st.scrapingType = 'opcode8'; st.currentStatus.scraperProgress = { type: 'opcode8', phase: 'starting', found: 0 };
    try {
        const { token, idStart = '100000000000000000', idEnd = '900000000000000000' } = req.body;
        if (!token) return res.json({ success: false, message: 'Token required' });

        const scrapedMembers = await DiscordScrapers.scraperOpcode8(
            token, BigInt(idStart), BigInt(idEnd),
            { onProgress: (p) => { st.currentStatus.scraperProgress = { ...p, type: 'opcode8' }; } }
        );

        const { total, newCount, skippedBlocked, skippedDupes } = dedupeAndSave(uid, scrapedMembers);
        const msg = `Opcode 8: ${scrapedMembers.length} users found — ${newCount} new, ${skippedDupes} duplicates, ${skippedBlocked} blocked skipped — ${total} total in list`;
        res.json({ success: true, message: msg, members: scrapedMembers, scraperType: 'opcode8' });
    } catch (error) {
        res.json({ success: false, message: `Bruteforce scraping failed: ${error.message}` });
    } finally {
        st.scrapingActive = false; st.scrapingType = null; st.currentStatus.scraperProgress = null;
    }
});

app.post('/api/scrape-keywords', express.json(), requireAuth, async (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    st.scrapingActive = true; st.scrapingType = 'keywords'; st.currentStatus.scraperProgress = { type: 'keywords', phase: 'starting', found: 0 };
    try {
        const config = UD.loadUserConfig(uid);
        const { token, serverId, keywords, timePeriodMinutes } = req.body;
        if (!token || !serverId || !keywords || keywords.length === 0) {
            return res.json({ success: false, message: 'Token, Server ID, and Keywords required' });
        }

        const scrapedMembers = await DiscordScrapers.scraperKeywords(token, serverId, keywords, {
            filterAdmins: config.scraper?.filterAdmins !== false,
            filterBots: config.scraper?.filterBots !== false,
            timePeriodMinutes: timePeriodMinutes || null,
            onProgress: (p) => { st.currentStatus.scraperProgress = { ...p, type: 'keywords' }; }
        });

        if (scrapedMembers.length === 0) {
            return res.json({ success: false, message: 'No members found with the specified keywords.', members: [] });
        }

        const { total, newCount, skippedBlocked, skippedDupes } = dedupeAndSave(uid, scrapedMembers);
        const msg = `Keyword Scraper: ${scrapedMembers.length} members found — ${newCount} new, ${skippedDupes} duplicates, ${skippedBlocked} blocked skipped — ${total} total in list`;
        res.json({ success: true, message: msg, members: scrapedMembers, scraperType: 'keywords' });
    } catch (error) {
        res.json({ success: false, message: `Keyword scraping failed: ${error.message}` });
    } finally {
        st.scrapingActive = false; st.scrapingType = null; st.currentStatus.scraperProgress = null;
    }
});

// ─── API: Proxy ───────────────────────────────────────────────────────────────
app.get('/api/proxy-stats', requireAuth, (req, res) => {
    const config = UD.loadUserConfig(req.session.userId);
    if (!config.proxy?.enabled) return res.json({ success: false, message: 'Proxy not enabled' });
    res.json({ success: true, stats: { total: (config.proxy.proxies || []).length } });
});

app.post('/api/test-proxy', express.json(), requireAuth, async (req, res) => {
    try {
        const { proxyString } = req.body;
        if (!proxyString) return res.json({ success: false, message: 'Proxy string required' });
        const proxy = ProxyManager.parseProxy(proxyString);
        if (!proxy) return res.json({ success: false, message: 'Invalid proxy format' });
        const result = await ProxyManager.testProxy(proxy);
        res.json({ success: true, proxy: proxyString, working: result.ok, latencyMs: result.latencyMs });
    } catch (error) {
        res.json({ success: false, message: `Proxy test failed: ${error.message}` });
    }
});

// ─── API: Captcha ─────────────────────────────────────────────────────────────
app.post('/api/captcha-balance', requireAuth, async (req, res) => {
    const config = UD.loadUserConfig(req.session.userId);
    const apiKey = req.body.apiKey || config.captcha?.apiKey;
    if (!apiKey) {
        return res.json({ success: false, message: 'No API key provided — enter your key and try again' });
    }
    try {
        const service = req.body.service || config.captcha?.service || 'anticaptcha';
        const solver = new CaptchaSolver(apiKey, service);
        const balance = await solver.getBalance();
        res.json({ success: true, balance, service });
    } catch (error) {
        res.json({ success: false, message: `${error.message}` });
    }
});

// ─── Message interpolation ────────────────────────────────────────────────────
function interpolateMessage(template, vars = {}) {
    return template
        // {random:A|B|C} — randomly picks one option
        .replace(/\{random:([^}]+)\}/g, (_, opts) => {
            const choices = opts.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        })
        // {username} — target's Discord username
        .replace(/\{username\}/gi, vars.username || '')
        // {index} — overall send count for this campaign
        .replace(/\{index\}/gi, vars.index != null ? String(vars.index) : '');
}

// ─── Core DM Logic ────────────────────────────────────────────────────────────
async function loginAndDM(userId, token, sharedPool) {
    const config = UD.loadUserConfig(userId);
    const st     = getState(userId);

    const clientConfig = { checkUpdate: false };

    // Feature 4: Gateway Identify payload hardening — set accurate, consistent browser identity
    const _gwFp = Fingerprint.generateFingerprint();
    clientConfig.ws = {
        properties: {
            browser: 'Chrome',
            os: _gwFp.platform === 'MacIntel' ? 'Mac OS X' : (_gwFp.platform === 'Linux x86_64' ? 'Linux' : 'Windows'),
            device: '',
        }
    };

    // Feature 2: Token tier — record this token's first-seen date so it ages into higher tiers
    TokenTiers.recordTokenActivity(userId, token);

    if (config.captcha?.enabled && config.captcha?.apiKey) {
        const captchaService = config.captcha.service || 'anticaptcha';
        const solver = new CaptchaSolver(config.captcha.apiKey, captchaService);
        clientConfig.captchaSolver = async (captchaInfo) => {
            const sitekey = captchaInfo.sitekey || captchaInfo.captcha_sitekey;
            const pageUrl = captchaInfo.pageUrl || 'https://discord.com';
            const rqdata  = captchaInfo.captcha_rqdata || null;
            try {
                console.log(chalk.yellow(`[CAPTCHA] Solving via ${captchaService} — sitekey: ${sitekey}`));
                const token = await solver.solveDiscordCaptcha(sitekey, pageUrl, rqdata);
                console.log(chalk.green(`[CAPTCHA] Solved successfully`));
                return token;
            } catch (err) {
                console.error(chalk.red(`[CAPTCHA] Failed: ${err.message}`));
                return null;
            }
        };
    }

    const client = new Client(clientConfig);
    let messageCount = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    let currentDelayMin = config.dm_delay_min;
    let currentDelayMax = config.dm_delay_max;

    const perTokenLimit      = config.per_token_limit      || 0;
    const tokenCooldownMs    = config.token_cooldown_ms    || 0;
    const perTokenRateLimit  = config.per_token_rate_limit || 0; // DMs per minute, 0 = disabled

    let rateBucketSent  = 0;
    let rateBucketStart = Date.now();

    st.tokenStats[token] = { sent: 0, errors: 0, status: 'connecting', tag: null, consecutiveErrors: 0, maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS, connectedAt: null, rateSamples: [], windowStart: null, windowSent: 0 };

    client.on('ready', async () => {
        st.activeClients[token] = client;
        st.tokenStats[token].tag         = client.user.tag;
        st.tokenStats[token].status      = 'active';
        st.tokenStats[token].connectedAt = Date.now();
        pushLog(userId, 'ready', `[READY] @${client.user.tag} (${client.user.id}) connected and ready to send`);

        async function sendNext() {
            if (!st.activeClients[token]) return;

            if (st.campaignPaused) { setTimeout(sendNext, 1500); return; }

            if (st.pausedTokens.has(token)) {
                st.tokenStats[token].status = 'paused';
                setTimeout(sendNext, 1500);
                return;
            }
            // Restore active status when no longer individually paused
            if (st.tokenStats[token] && st.tokenStats[token].status === 'paused') {
                st.tokenStats[token].status = 'active';
            }

            if (perTokenLimit > 0 && messageCount >= perTokenLimit) {
                pushLog(userId, 'info', `[LIMIT] @${client.user.tag}: Hit per-token limit of ${perTokenLimit} DMs — disconnecting`);
                st.tokenStats[token].status = 'limit';
                fireCampaignWebhook(userId, 'token_retired', {
                    'Token':  client.user?.tag || token.substring(0, 20) + '...',
                    'Reason': `Per-Token Limit (${perTokenLimit} DMs)`,
                    'Status': 'limit',
                    'Sent':   messageCount,
                    'Errors': st.tokenStats[token]?.errors || 0,
                });
                client.destroy();
                delete st.activeClients[token];

                if (tokenCooldownMs > 0 && sharedPool.length > 0) {
                    const mins = Math.round(tokenCooldownMs / 60000);
                    pushLog(userId, 'info', `[COOLDOWN] @${client.user.tag}: Cooling down for ${mins} min(s) before re-joining the pool`);
                    setTimeout(async () => {
                        if (sharedPool.length > 0) await loginAndDM(userId, token, sharedPool);
                    }, tokenCooldownMs);
                } else {
                    checkCampaignComplete(userId, sharedPool);
                }
                return;
            }

            // Per-token rate limiter: cap DMs per minute per token
            if (perTokenRateLimit > 0) {
                const elapsed = Date.now() - rateBucketStart;
                if (elapsed >= 60000) {
                    rateBucketSent  = 0;
                    rateBucketStart = Date.now();
                }
                if (rateBucketSent >= perTokenRateLimit) {
                    const waitMs = Math.max(1000, 60000 - (Date.now() - rateBucketStart));
                    pushLog(userId, 'warn', `[RATE CAP] @${client.user.tag}: ${perTokenRateLimit} DMs/min cap reached — waiting ${Math.round(waitMs / 1000)}s for next window`);
                    setTimeout(sendNext, waitMs + 200);
                    return;
                }
            }

            if (!sharedPool.length) {
                pushLog(userId, 'done', `[DONE] @${client.user.tag}: Pool empty — disconnecting (sent ${messageCount} DM(s) this session)`);
                st.tokenStats[token].status = 'done';
                fireCampaignWebhook(userId, 'token_retired', {
                    'Token':  client.user?.tag || token.substring(0, 20) + '...',
                    'Reason': 'Pool Empty — All Members Processed',
                    'Status': 'done',
                    'Sent':   messageCount,
                    'Errors': st.tokenStats[token]?.errors || 0,
                });
                client.destroy();
                delete st.activeClients[token];
                checkCampaignComplete(userId, sharedPool);
                return;
            }

            const randomIndex = Math.floor(Math.random() * sharedPool.length);
            const memberId = sharedPool.splice(randomIndex, 1)[0];
            saveFile(userId, 'members.txt', sharedPool.join('\n'));
            st.currentStatus.messagesRemaining = sharedPool.length;

            // Reload config in case it changed during a campaign
            const cfg = UD.loadUserConfig(userId);

            // Token warming: progressive daily limit check
            if (cfg.token_warming_enabled) {
                const wr = loadJsonFile(userId, 'warming_registry.json');
                const today = new Date().toISOString().split('T')[0];
                const tKey = token.substring(0, 30);
                const wEntry = wr[tKey] || {};
                const daysSince = wEntry.firstSeen
                    ? Math.floor((Date.now() - new Date(wEntry.firstSeen).getTime()) / 86400000)
                    : 0;
                const schedule = (cfg.token_warming_schedule && cfg.token_warming_schedule.length > 0)
                    ? cfg.token_warming_schedule
                    : [5, 10, 20, 35, 50, 75, 100];
                if (daysSince < schedule.length) {
                    const todayLimit = schedule[daysSince];
                    const todayCount = (wEntry.dailyCounts || {})[today] || 0;
                    if (todayCount >= todayLimit) {
                        pushLog(userId, 'info', `[WARM] @${client.user.tag}: Day ${daysSince + 1} limit (${todayLimit} DMs) reached — token resting until tomorrow`);
                        st.tokenStats[token].status = 'warming';
                        fireCampaignWebhook(userId, 'token_retired', {
                            'Token':  client.user?.tag || token.substring(0, 20) + '...',
                            'Reason': `Warming Daily Limit (Day ${daysSince + 1} — ${todayLimit} DMs)`,
                            'Status': 'warming',
                            'Sent':   messageCount,
                            'Errors': st.tokenStats[token]?.errors || 0,
                        });
                        sharedPool.push(memberId);
                        saveFile(userId, 'members.txt', sharedPool.join('\n'));
                        client.destroy();
                        delete st.activeClients[token];
                        checkCampaignComplete(userId, sharedPool);
                        return;
                    }
                }
            }

                try {
                // Human behavior: occasional thinking pause before sending
                await humanThink(0.25, 800, 3500);

                const user = await client.users.fetch(memberId);
                const abVariantIdx = Math.floor(Math.random() * cfg.dm_messages.length);
                const rawMessage = cfg.dm_messages[abVariantIdx];
                if (cfg.dm_messages.length > 1) {
                    st.abTestStats[abVariantIdx] = (st.abTestStats[abVariantIdx] || 0) + 1;
                }
                const finalMessage = interpolateMessage(rawMessage, {
                    username: user.username,
                    index: (st.currentStatus.messagesSent || 0) + 1,
                });

                // Feature 6: Semantic variation via LLM paraphrasing (silent fallback if disabled or API unavailable)
                const sendMessage = cfg.paraphrase_enabled
                    ? await Paraphrase.paraphrase(finalMessage, cfg)
                    : finalMessage;

                // Feature 3: Friend Request → DM flow (optional — send FR first, DM after acceptance delay)
                if (cfg.friend_request_mode) {
                    const _frRawTok = extractToken(token);
                    const _frFp    = Fingerprint.generateFingerprint();
                    const _frResp  = await axios.put(
                        `https://discord.com/api/v9/users/@me/relationships/${memberId}`,
                        {},
                        {
                            headers: {
                                'Authorization': _frRawTok,
                                'Content-Type': 'application/json',
                                'User-Agent': _frFp.userAgent,
                                'X-Super-Properties': Fingerprint.buildSuperPropertiesXHeader(_frFp),
                                'X-Discord-Locale': _frFp.languages[0] || 'en-US',
                            },
                            timeout: 10000,
                            validateStatus: () => true,
                        }
                    );
                    if (_frResp.status === 204 || _frResp.status === 200) {
                        const frDelay = cfg.friend_request_dm_delay_ms || 90000;
                        st.friendPending[memberId] = { variantIdx: abVariantIdx, scheduledAt: Date.now() + frDelay };
                        pushLog(userId, 'info', `[FR] @${client.user.tag} → Friend request sent to ${memberId} (DM queued in ${Math.round(frDelay / 1000)}s) | Pool: ${sharedPool.length}`);
                        setTimeout(async () => {
                            try {
                                if (!st.activeClients[token]) return;
                                const _frUser = await client.users.fetch(memberId).catch(() => null);
                                if (_frUser) {
                                    await _frUser.send(sendMessage);
                                    pushLog(userId, 'success', `[FR-DM] @${client.user.tag} → DM delivered to ${memberId} after friend request`);
                                }
                                delete st.friendPending[memberId];
                            } catch {}
                        }, frDelay);
                    } else {
                        // Friend request blocked/failed — fall back to direct DM
                        await user.send(sendMessage);
                    }
                } else {
                    // Standard direct DM with configurable retry
                    const retryMax = cfg.dm_retry_count || 0;
                    let lastSendErr = null;
                    for (let attempt = 0; attempt <= retryMax; attempt++) {
                        try {
                            await user.send(sendMessage);
                            lastSendErr = null;
                            break;
                        } catch (sendErr) {
                            lastSendErr = sendErr;
                            const ec = sendErr.code;
                            const em = (sendErr.message || '').toLowerCase();
                            if (ec === 50007 || ec === 10013 || ec === 429 ||
                                em.includes('cannot send') || em.includes('unknown user') ||
                                em.includes('unauthorized') || em.includes('rate limit') ||
                                em.includes('captcha')) break;
                            if (attempt < retryMax) {
                                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                            }
                        }
                    }
                    if (lastSendErr) throw lastSendErr;
                }

                messageCount++;
                consecutiveErrors = 0;
                if (st.tokenStats[token]) st.tokenStats[token].consecutiveErrors = 0;

                if (st.currentStatus.messagesSent !== undefined) st.currentStatus.messagesSent++;
                st.tokenStats[token].sent++;
                rateBucketSent++;

                // ── Sparkline: sample rate into 30-second buckets (10 samples = 5 min history) ──
                {
                    const ts = st.tokenStats[token];
                    if (!ts.windowStart) ts.windowStart = Date.now();
                    ts.windowSent = (ts.windowSent || 0) + 1;
                    if (Date.now() - ts.windowStart >= 30000) {
                        const windowSecs = (Date.now() - ts.windowStart) / 1000;
                        const bucketRate = Math.round((ts.windowSent / windowSecs) * 60 * 10) / 10;
                        ts.rateSamples.push(bucketRate);
                        if (ts.rateSamples.length > 10) ts.rateSamples.shift();
                        ts.windowStart = Date.now();
                        ts.windowSent  = 0;
                    }
                }
                // Feature 7: Record which A/B variant this member received (enables response rate tracking)
                st.sentVariantMap[memberId] = abVariantIdx;

                // Campaign checkpoint: save every 10 sends so the campaign can be resumed
                const sent = st.currentStatus.messagesSent || 0;
                if (sent % 10 === 0 && sharedPool.length > 0) {
                    saveJsonFile(userId, 'campaign_checkpoint.json', {
                        savedAt: new Date().toISOString(),
                        remainingMembers: [...sharedPool],
                        messagesSent: sent,
                        totalMembers: st.currentStatus.totalMembers || 0,
                        label: st.currentStatus.label || ''
                    });
                }

                // Track success for error spike detection
                { const rO = st.recentOutcomes; rO.push('s'); if (rO.length > 50) rO.shift(); }

                // Token warming: track daily sent count
                if (cfg.token_warming_enabled) {
                    const wr = loadJsonFile(userId, 'warming_registry.json');
                    const today = new Date().toISOString().split('T')[0];
                    const tKey = token.substring(0, 30);
                    wr[tKey] = wr[tKey] || { firstSeen: today, dailyCounts: {} };
                    wr[tKey].dailyCounts[today] = (wr[tKey].dailyCounts[today] || 0) + 1;
                    saveJsonFile(userId, 'warming_registry.json', wr);
                }

                currentDelayMin = Math.max(cfg.dm_delay_min, Math.round(currentDelayMin * 0.95));
                currentDelayMax = Math.max(cfg.dm_delay_max, Math.round(currentDelayMax * 0.95));

                // Cross-campaign global dedup registry
                if (cfg.global_dedup) {
                    const dmedAll = new Set(loadFile(userId, 'dmed_all_time.txt'));
                    if (!dmedAll.has(memberId)) {
                        dmedAll.add(memberId);
                        saveFile(userId, 'dmed_all_time.txt', [...dmedAll].join('\n'));
                    }
                }

                // Register member for drip sequence reply-watching
                const activeSeqId = cfg.active_sequence_id || null;
                if (activeSeqId) {
                    Sequences.watchForReply(userId, memberId, activeSeqId);
                }

                pushLog(userId, 'success', `[SUCCESS] @${client.user.tag} → DM delivered to @${user.tag} (${user.id}) | Sent: ${messageCount} | Pool: ${sharedPool.length}`);
                st.dmStatusLog.push({ memberId: user.id, username: user.tag, status: 'sent', reason: '', tokenTag: client.user.tag, timestamp: new Date().toISOString() });
                if (st.dmStatusLog.length > 5000) st.dmStatusLog.shift();

            } catch (error) {
                consecutiveErrors++;
                if (st.tokenStats[token]) st.tokenStats[token].consecutiveErrors = consecutiveErrors;

                const errMsg = (error.message || '').toLowerCase();
                const isCaptcha = errMsg.includes('captcha') || !!error.captcha;

                if (isCaptcha && !cfg.captcha?.enabled) {
                    // Captcha counts as a token error (not a rate limit)
                    st.tokenStats[token].errors++;
                    if (st.currentStatus.errorsTotal !== undefined) st.currentStatus.errorsTotal++;
                    sharedPool.push(memberId);
                    saveFile(userId, 'members.txt', sharedPool.join('\n'));
                    st.currentStatus.messagesRemaining = sharedPool.length;
                    pushLog(userId, 'warn', `[CAPTCHA] @${client.user.tag}: Captcha triggered — token suspended, member re-queued | Pool: ${sharedPool.length}`);
                    st.tokenStats[token].status = 'captcha';
                    fireCampaignWebhook(userId, 'token_retired', {
                        'Token':  client.user?.tag || token.substring(0, 20) + '...',
                        'Reason': 'Captcha Triggered (No Solver Configured)',
                        'Status': 'captcha',
                        'Sent':   messageCount,
                        'Errors': st.tokenStats[token]?.errors || 0,
                    });
                    client.destroy();
                    delete st.activeClients[token];
                    checkCampaignComplete(userId, sharedPool);
                    return;
                }

                let reason = error.message || 'Unknown error';
                let addToBlocked = false;
                let isRateLimit  = false;

                if (error.code === 50007 || errMsg.includes('cannot send messages to this user')) {
                    reason = 'DMs disabled — blocked permanently'; addToBlocked = true; consecutiveErrors = 0;
                } else if (error.code === 10013 || errMsg.includes('unknown user')) {
                    reason = 'Deleted or invalid account — blocked permanently'; addToBlocked = true; consecutiveErrors = 0;
                } else if (errMsg.includes('unauthorized')) {
                    reason = 'Unauthorized — DMs disabled or restricted — blocked permanently'; addToBlocked = true; consecutiveErrors = 0;
                } else if (errMsg.includes('rate limit') || errMsg.includes('429') || error.code === 429) {
                    isRateLimit = true;
                    sharedPool.push(memberId);
                    saveFile(userId, 'members.txt', sharedPool.join('\n'));
                    st.currentStatus.messagesRemaining = sharedPool.length;
                    currentDelayMin = Math.min(Math.round(currentDelayMin * 1.5), 120000);
                    currentDelayMax = Math.min(Math.round(currentDelayMax * 1.5), 240000);
                    consecutiveErrors = 0;
                    if (st.tokenStats[token]) st.tokenStats[token].consecutiveErrors = 0;
                    pushLog(userId, 'warn', `[RATE LIMIT] @${client.user.tag}: Rate limited — delay scaled to ${Math.round(currentDelayMin / 1000)}s–${Math.round(currentDelayMax / 1000)}s | Member re-queued`);

                    // ── Rate-limit spike detection ─────────────────────────────
                    const rlThreshold = cfg.rate_limit_alert_threshold || 5;
                    const rlWindow    = cfg.rate_limit_alert_window_ms || 60000;
                    const tokenKey    = token.substring(0, 30);
                    if (!st.rateLimitEvents[tokenKey]) st.rateLimitEvents[tokenKey] = [];
                    st.rateLimitEvents[tokenKey].push(Date.now());
                    // Prune events outside the window
                    const cutoff = Date.now() - rlWindow;
                    st.rateLimitEvents[tokenKey] = st.rateLimitEvents[tokenKey].filter(ts => ts >= cutoff);
                    const rlCount = st.rateLimitEvents[tokenKey].length;
                    if (rlCount >= rlThreshold) {
                        pushLog(userId, 'warn', `[RATE LIMIT SPIKE] @${client.user.tag}: ${rlCount} rate limits in last ${Math.round(rlWindow / 1000)}s — firing webhook alert`);
                        const suspendMs = cfg.rl_spike_suspend_ms || 300000;
                        fireCampaignWebhook(userId, 'token_rate_limit_spike', {
                            'Token':         client.user?.tag || token.substring(0, 20) + '...',
                            'Rate Limits':   `${rlCount} in ${Math.round(rlWindow / 1000)}s`,
                            'Current Delay': `${Math.round(currentDelayMin / 1000)}s – ${Math.round(currentDelayMax / 1000)}s`,
                            'Sent':          messageCount,
                            'Auto-Suspend':  cfg.rl_spike_auto_suspend ? `${Math.round(suspendMs / 1000)}s cooldown` : 'disabled',
                        });
                        // Reset tracking after firing so it won't re-trigger until next threshold breach
                        st.rateLimitEvents[tokenKey] = [];

                        // ── Auto-suspend ────────────────────────────────────────
                        if (cfg.rl_spike_auto_suspend) {
                            pushLog(userId, 'warn', `[SUSPEND] @${client.user.tag}: Auto-suspended for ${Math.round(suspendMs / 1000)}s after rate-limit spike`);
                            if (st.tokenStats[token]) {
                                st.tokenStats[token].status = 'suspended';
                                st.tokenStats[token].suspendedUntil  = Date.now() + suspendMs;
                                st.tokenStats[token].suspendedFor    = suspendMs;
                                st.tokenStats[token].suspendedAt     = Date.now();
                                st.tokenStats[token].suspendReason   = 'Rate-limit spike';
                            }
                            client.destroy();
                            delete st.activeClients[token];
                            setTimeout(async () => {
                                if (st.tokenStats[token]) {
                                    st.tokenStats[token].suspendedUntil = null;
                                    st.tokenStats[token].suspendedFor   = null;
                                    st.tokenStats[token].suspendedAt    = null;
                                    st.tokenStats[token].suspendReason  = null;
                                }
                                if (st.currentStatus.running && st.sharedPool && st.sharedPool.length > 0) {
                                    pushLog(userId, 'info', `[RESUME] Token cooldown complete — re-logging after ${Math.round(suspendMs / 1000)}s spike suspension`);
                                    if (st.tokenStats[token]) st.tokenStats[token].status = 'active';
                                    await loginAndDM(userId, token, st.sharedPool);
                                }
                            }, suspendMs);
                            return;
                        }
                    }
                }

                // Only count true errors (not rate limits) toward the error totals
                if (!isRateLimit) {
                    st.tokenStats[token].errors++;
                    if (st.currentStatus.errorsTotal !== undefined) st.currentStatus.errorsTotal++;
                }

                if (addToBlocked) {
                    const alreadyBlocked = loadFile(userId, 'blocked_members.txt');
                    if (!alreadyBlocked.includes(memberId)) {
                        saveFile(userId, 'blocked_members.txt', [...alreadyBlocked, memberId].join('\n'));
                        if (st.currentStatus.blockedThisRun !== undefined) st.currentStatus.blockedThisRun++;
                    }
                    pushLog(userId, 'blocked', `[BLOCKED] @${client.user.tag} → ${memberId} — ${reason}`);
                    st.dmStatusLog.push({ memberId, username: (typeof user !== 'undefined' && user?.tag) || null, status: 'blocked', reason, tokenTag: client.user.tag, timestamp: new Date().toISOString() });
                    if (st.dmStatusLog.length > 5000) st.dmStatusLog.shift();
                } else if (!isRateLimit) {
                    pushLog(userId, 'error', `[ERROR] @${client.user.tag} → Failed to DM ${memberId} — ${reason}`);
                    st.dmStatusLog.push({ memberId, username: (typeof user !== 'undefined' && user?.tag) || null, status: 'error', reason, tokenTag: client.user.tag, timestamp: new Date().toISOString() });
                    if (st.dmStatusLog.length > 5000) st.dmStatusLog.shift();
                    // Failed DM re-queue: put member back after a cooldown delay
                    if (cfg.failed_requeue_enabled && cfg.failed_requeue_delay_ms > 0) {
                        const reqMs = cfg.failed_requeue_delay_ms;
                        setTimeout(() => {
                            if (st.currentStatus.running) {
                                sharedPool.push(memberId);
                                saveFile(userId, 'members.txt', sharedPool.join('\n'));
                                st.currentStatus.messagesRemaining = sharedPool.length;
                                pushLog(userId, 'info', `[REQUEUE] ${memberId} re-queued after ${Math.round(reqMs / 1000)}s cooldown`);
                            }
                        }, reqMs);
                    }
                }

                // Track errors for auto-pause on error spike
                if (!addToBlocked && !isRateLimit) {
                    const rO = st.recentOutcomes;
                    rO.push('e');
                    if (rO.length > 50) rO.shift();
                    if (cfg.error_spike_enabled && cfg.error_spike_window > 0 && cfg.error_spike_threshold > 0 && rO.length >= (cfg.error_spike_window || 10)) {
                        const errRate = Math.round((rO.filter(o => o === 'e').length / rO.length) * 100);
                        if (errRate >= cfg.error_spike_threshold && !st.campaignPaused) {
                            st.campaignPaused = true;
                            pushLog(userId, 'warn', `[AUTO-PAUSE] Error rate ${errRate}% ≥ threshold ${cfg.error_spike_threshold}% over last ${rO.length} events — campaign auto-paused`);
                        }
                    }
                }

                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    pushLog(userId, 'error', `[HEALTH] @${client.user.tag}: ${consecutiveErrors} consecutive errors — token retired for health reasons`);
                    st.tokenStats[token].status = 'unhealthy';
                    // Update token health registry
                    const health = loadJsonFile(userId, 'token_health.json');
                    health[token.substring(0, 30)] = { lastError: new Date().toISOString(), consecutiveErrors, status: 'unhealthy', totalSent: messageCount };
                    saveJsonFile(userId, 'token_health.json', health);
                    fireCampaignWebhook(userId, 'token_unhealthy', {
                        'Token':  client.user?.tag || 'unknown',
                        'Errors': consecutiveErrors,
                    });
                    client.destroy();
                    delete st.activeClients[token];
                    checkCampaignComplete(userId, sharedPool);
                    return;
                }
            }

            const delay = randomInt(currentDelayMin, currentDelayMax);
            setTimeout(sendNext, delay);
        }

        sendNext();

        // Drip sequence: listen for DM replies from members we've messaged
        client.on('messageCreate', async (message) => {
            try {
                if (message.channel?.type !== 'DM') return;
                if (!message.author || message.author.bot) return;
                if (message.author.id === client.user?.id) return;

                // Auto-reply: single-template response (fires once per member per campaign)
                const arCfg = UD.loadUserConfig(userId);
                if (arCfg.auto_reply_enabled && arCfg.auto_reply_message) {
                    if (!st.autoReplied) st.autoReplied = new Set();
                    if (!st.autoReplied.has(message.author.id)) {
                        st.autoReplied.add(message.author.id);
                        const arDelay  = arCfg.auto_reply_delay_ms || 3000;
                        const arMsg    = interpolateMessage(arCfg.auto_reply_message, { username: message.author.username || message.author.tag });
                        pushLog(userId, 'info', `[AUTO-REPLY] Reply from @${message.author.tag} — sending response in ${Math.round(arDelay / 1000)}s`);
                        setTimeout(async () => {
                            try {
                                await message.author.send(arMsg);
                                pushLog(userId, 'success', `[AUTO-REPLY] Response delivered to @${message.author.tag}`);
                            } catch (err) {
                                pushLog(userId, 'error', `[AUTO-REPLY] Response failed for @${message.author.tag}: ${err.message}`);
                            }
                        }, arDelay);
                    }
                }

                // Feature 7: Response rate analytics — record reply per A/B variant
                const senderId = message.author.id;
                if (st.sentVariantMap[senderId] !== undefined) {
                    const replyIdx = st.sentVariantMap[senderId];
                    st.variantReplies[replyIdx] = (st.variantReplies[replyIdx] || 0) + 1;
                    pushLog(userId, 'info', `[A/B] Reply from @${message.author.tag} — variant #${replyIdx} gets +1 response (total: ${st.variantReplies[replyIdx]})`);
                }

                // DM Status Tracker: mark sender as replied (upgrade sent→replied, or increment count)
                const _dmEntry = (st.dmStatusLog || []).find(e => e.memberId === senderId && (e.status === 'sent' || e.status === 'replied'));
                if (_dmEntry) {
                    _dmEntry.status        = 'replied';
                    _dmEntry.replyCount    = (_dmEntry.replyCount || 0) + 1;
                    _dmEntry.lastReplyAt   = new Date().toISOString();
                    _dmEntry.lastReplyText = message.content ? message.content.slice(0, 120) : null;
                    pushLog(userId, 'info', `[REPLY] @${message.author.tag} replied (×${_dmEntry.replyCount}) — status tracker updated`);
                }

                const action = Sequences.onReplyReceived(userId, message.author.id);
                if (!action) return;

                pushLog(userId, 'info', `[SEQUENCE] Reply from @${message.author.tag} — follow-up in ${Math.round(action.delayMs / 1000)}s (${action.stepsRemaining} step(s) left)`);
                setTimeout(async () => {
                    try {
                        await message.author.send(action.message);
                        pushLog(userId, 'success', `[SEQUENCE] Follow-up delivered to @${message.author.tag}`);
                    } catch (err) {
                        pushLog(userId, 'error', `[SEQUENCE] Follow-up failed for @${message.author.tag}: ${err.message}`);
                    }
                }, action.delayMs);
            } catch (_) {}
        });
    });

    client.on('error', (error) => {
        pushLog(userId, 'error', `[CLIENT ERROR] Token ${token.substring(0, 20)}... — ${error.message || error}`);
    });

    client.login(extractToken(token)).catch((error) => {
        const msg = error.toString();
        if (msg.includes('INVALID') && msg.includes('TOKEN')) {
            pushLog(userId, 'error', `[INVALID TOKEN] Token ${token.substring(0, 20)}... is invalid and has been removed`);
            saveFile(userId, 'tokens.txt', loadFile(userId, 'tokens.txt').filter(t => t !== token).join('\n'));
            if (st.tokenStats[token]) st.tokenStats[token].status = 'invalid';
            fireCampaignWebhook(userId, 'token_retired', {
                'Token':  token.substring(0, 20) + '...',
                'Reason': 'Invalid Token — Removed From List',
                'Status': 'invalid',
                'Sent':   st.tokenStats[token]?.sent || 0,
                'Errors': st.tokenStats[token]?.errors || 0,
            });
        } else {
            pushLog(userId, 'error', `[LOGIN FAILED] Token ${token.substring(0, 20)}... — ${msg}`);
            if (st.tokenStats[token]) st.tokenStats[token].status = 'failed';
            fireCampaignWebhook(userId, 'token_retired', {
                'Token':  token.substring(0, 20) + '...',
                'Reason': `Login Failed — ${msg.substring(0, 80)}`,
                'Status': 'failed',
                'Sent':   st.tokenStats[token]?.sent || 0,
                'Errors': st.tokenStats[token]?.errors || 0,
            });
        }
        delete st.activeClients[token];
        checkCampaignComplete(userId, sharedPool);
    });
}

// ─── API: Captcha balance (2Captcha + Anti-Captcha) ──────────────────────────
app.post('/api/captcha-balance-v2', express.json(), requireAuth, async (req, res) => {
    const config  = UD.loadUserConfig(req.session.userId);
    const apiKey  = req.body.apiKey  || config.captcha?.apiKey;
    const service = req.body.service || config.captcha?.service || 'anticaptcha';
    if (!apiKey) return res.json({ success: false, message: 'No API key provided' });
    try {
        const solver  = new CaptchaSolver(apiKey, service);
        const balance = await solver.getBalance();
        res.json({ success: true, balance, service });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Proxy bulk-test ─────────────────────────────────────────────────────
app.post('/api/proxy-bulk-test', express.json(), requireAuth, async (req, res) => {
    try {
        const { proxies, strategy } = req.body;
        if (!proxies || !proxies.length) return res.json({ success: false, message: 'No proxies provided' });
        const pm = new ProxyManager();
        pm.addProxies(proxies);
        if (strategy) pm.setStrategy(strategy);
        const results = await pm.bulkTest(8);
        const working = results.filter(r => r.ok).length;
        res.json({ success: true, results, working, total: results.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/proxy-stats-v2', requireAuth, (req, res) => {
    const config = UD.loadUserConfig(req.session.userId);
    const proxies = config.proxy?.proxies || [];
    const pm = new ProxyManager();
    pm.addProxies(proxies);
    res.json({ success: true, stats: pm.getStats(), scored: pm.getScoredList().slice(0, 50) });
});

// ─── API: Playwright — join server via Chromium ────────────────────────────
app.post('/api/playwright/join-server', express.json(), requireAuth, async (req, res) => {
    try {
        const uid = req.session.userId;
        const { tokens, inviteCode } = req.body;
        if (!tokens || !tokens.length) return res.json({ success: false, message: 'No tokens provided' });
        if (!inviteCode) return res.json({ success: false, message: 'No invite code provided' });

        const config = UD.loadUserConfig(uid);
        const pm = new ProxyManager();
        if (config.proxy?.enabled && config.proxy?.proxies?.length) {
            pm.addProxies(config.proxy.proxies);
            pm.setStrategy(config.proxy.strategy || 'random');
        }

        const captchaApiKey  = config.captcha?.apiKey || null;
        const captchaService = config.captcha?.service || 'anticaptcha';

        const results = [];
        for (const rawToken of tokens) {
            const token = extractToken(rawToken.trim());
            if (!token) continue;
            const proxy = config.proxy?.enabled ? pm.getProxy() : null;
            const pw = new PlaywrightBrowser({
                captchaApiKey,
                captchaService,
                proxy,
                logFn: (msg) => pushLog(uid, 'info', msg),
            });
            const r = await pw.joinServerViaChrome(token, inviteCode, pm);
            if (r.success) pm.recordSuccess(proxy);
            else pm.recordFailure(proxy);
            results.push({ token: rawToken.split('.')[0] + '...', ...r });
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
        }

        const joined = results.filter(r => r.success).length;
        res.json({ success: true, results, joined, total: results.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Playwright — validate tokens via Chromium ───────────────────────
app.post('/api/playwright/validate-tokens', express.json(), requireAuth, async (req, res) => {
    try {
        const uid = req.session.userId;
        const { tokens } = req.body;
        if (!tokens || !tokens.length) return res.json({ success: false, message: 'No tokens provided' });

        const config = UD.loadUserConfig(uid);
        const captchaApiKey  = config.captcha?.apiKey || null;
        const captchaService = config.captcha?.service || 'anticaptcha';

        const results = await batchValidateTokens(
            tokens.map(t => extractToken(t.trim())),
            { captchaApiKey, captchaService, concurrency: 3,
              onProgress: (p) => { getState(uid).currentStatus.validateProgress = p; } }
        );

        const valid = results.filter(r => r.valid).length;
        res.json({ success: true, results, valid, total: results.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Fingerprint — generate sample ───────────────────────────────────
app.get('/api/fingerprint/sample', requireAuth, (req, res) => {
    const fp = Fingerprint.generateFingerprint();
    res.json({
        success: true,
        userAgent: fp.userAgent,
        platform: fp.platform,
        screen: fp.screen,
        viewport: fp.viewport,
        webglVendor: fp.webgl.vendor,
        webglRenderer: fp.webgl.renderer,
        languages: fp.languages,
        timezone: fp.timezone,
        hardwareConcurrency: fp.hardwareConcurrency,
        deviceMemory: fp.deviceMemory,
        noiseLevel: fp.noiseLevel,
    });
});

// ─── API: Playwright — generate Discord token (single) ───────────────────
app.post('/api/playwright/generate-token', express.json(), requireAuth, async (req, res) => {
    try {
        const uid    = req.session.userId;
        const config = UD.loadUserConfig(uid);
        const { email, username, password } = req.body;

        const pm = new ProxyManager();
        if (config.proxy?.enabled && config.proxy?.proxies?.length) {
            pm.addProxies(config.proxy.proxies);
            pm.setStrategy(config.proxy.strategy || 'random');
        }

        const proxy          = config.proxy?.enabled ? pm.getProxy() : null;
        const captchaApiKey  = config.captcha?.apiKey  || null;
        const captchaService = config.captcha?.service || 'anticaptcha';

        pushLog(uid, 'info', `[GenToken] Starting account registration${proxy ? ' via proxy' : ''}...`);

        const pw = new PlaywrightBrowser({
            captchaApiKey, captchaService, proxy,
            logFn: (msg) => pushLog(uid, 'info', msg),
        });

        const result = await pw.generateToken({ email, username, password });

        if (result.success) {
            const tokens = loadFile(uid, 'tokens.txt');
            tokens.push(result.token);
            saveFile(uid, 'tokens.txt', tokens.join('\n'));
            pushLog(uid, 'success', `[GenToken] Token generated for @${result.username} — saved to token list`);
        } else {
            pushLog(uid, 'error', `[GenToken] Failed: ${result.message}`);
        }

        res.json({ success: result.success, ...result });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Playwright — batch generate tokens ─────────────────────────────
const genTokenState = {};

app.post('/api/playwright/batch-generate', express.json(), requireAuth, async (req, res) => {
    try {
        const uid = req.session.userId;
        if (genTokenState[uid]?.running) {
            return res.json({ success: false, message: 'Generation already running — stop it first' });
        }

        const config = UD.loadUserConfig(uid);
        const { count = 1, delayMin = 6000, delayMax = 14000 } = req.body;

        const pm = new ProxyManager();
        if (config.proxy?.enabled && config.proxy?.proxies?.length) {
            pm.addProxies(config.proxy.proxies);
            pm.setStrategy(config.proxy.strategy || 'scored');
        }

        const captchaApiKey  = config.captcha?.apiKey  || null;
        const captchaService = config.captcha?.service || 'anticaptcha';

        genTokenState[uid] = { running: true, done: 0, total: count, results: [], stopped: false };
        pushLog(uid, 'info', `[BatchGen] Starting generation of ${count} token(s)...`);

        res.json({ success: true, message: `Batch generation started — ${count} account(s)` });

        (async () => {
            const st = genTokenState[uid];
            for (let i = 0; i < count && !st.stopped; i++) {
                const proxy = config.proxy?.enabled ? pm.getProxy() : null;
                const pw = new PlaywrightBrowser({
                    captchaApiKey, captchaService, proxy,
                    logFn: (msg) => pushLog(uid, 'info', msg),
                });

                const r = await pw.generateToken({});
                st.done++;
                st.results.push(r);

                if (r.success) {
                    const existing = loadFile(uid, 'tokens.txt');
                    existing.push(r.token);
                    saveFile(uid, 'tokens.txt', existing.join('\n'));
                    pm.recordSuccess(proxy);
                    pushLog(uid, 'success', `[BatchGen] ✓ Token ${st.done}/${count} — @${r.username}`);
                } else {
                    pm.recordFailure(proxy);
                    pushLog(uid, 'error', `[BatchGen] ✗ Account ${st.done}/${count} failed — ${r.message}`);
                }

                if (i < count - 1 && !st.stopped) {
                    await new Promise(r => setTimeout(r, delayMin + Math.random() * (delayMax - delayMin)));
                }
            }
            st.running = false;
            pushLog(uid, 'done', `[BatchGen] Complete — ${st.results.filter(r => r.success).length}/${count} tokens generated`);
        })().catch(err => {
            genTokenState[uid] = { running: false };
            pushLog(uid, 'error', `[BatchGen] Crashed: ${err.message}`);
        });

    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/playwright/stop-generate', requireAuth, (req, res) => {
    const uid = req.session.userId;
    if (genTokenState[uid]) genTokenState[uid].stopped = true;
    pushLog(uid, 'info', '[BatchGen] Stop requested — finishing current account then halting');
    res.json({ success: true, message: 'Stop signal sent' });
});

app.get('/api/playwright/generate-status', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const st  = genTokenState[uid] || { running: false, done: 0, total: 0, results: [] };
    const succeeded = (st.results || []).filter(r => r.success).length;
    res.json({ ...st, succeeded });
});

// ─── API: Playwright — mass join with proxy rotation ─────────────────────
app.post('/api/playwright/mass-join', express.json(), requireAuth, async (req, res) => {
    try {
        const uid = req.session.userId;
        const { inviteCode, delay = 2000 } = req.body;
        if (!inviteCode) return res.json({ success: false, message: 'No invite code provided' });

        const tokens  = loadFile(uid, 'tokens.txt');
        const config  = UD.loadUserConfig(uid);
        if (!tokens.length) return res.json({ success: false, message: 'No tokens loaded' });

        const pm = new ProxyManager();
        if (config.proxy?.enabled && config.proxy?.proxies?.length) {
            pm.addProxies(config.proxy.proxies);
            pm.setStrategy(config.proxy.strategy || 'scored');
        }

        const captchaApiKey  = config.captcha?.apiKey || null;
        const captchaService = config.captcha?.service || 'anticaptcha';

        pushLog(uid, 'info', `[Playwright] Mass join started — ${tokens.length} token(s) → ${inviteCode}`);

        const results = [];
        for (const rawToken of tokens) {
            const token = extractToken(rawToken.trim());
            if (!token) continue;
            const proxy = config.proxy?.enabled ? pm.getProxy() : null;
            const pw = new PlaywrightBrowser({
                captchaApiKey, captchaService, proxy,
                logFn: (msg) => pushLog(uid, 'info', msg),
            });
            const r = await pw.joinServerViaChrome(token, inviteCode);
            if (r.success) {
                pm.recordSuccess(proxy);
                pushLog(uid, 'success', `[Playwright] Joined: ${rawToken.substring(0,20)}...`);
            } else {
                pm.recordFailure(proxy);
                pushLog(uid, 'error', `[Playwright] Failed: ${r.message}`);
            }
            results.push({ token: rawToken.split('.')[0] + '...', ...r });
            if (delay > 0) await new Promise(r => setTimeout(r, delay + Math.random() * 1000));
        }

        const joined = results.filter(r => r.success).length;
        pushLog(uid, 'done', `[Playwright] Mass join complete — ${joined}/${results.length} joined`);
        res.json({ success: true, results, joined, total: results.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── Helper: Snowflake → account age/score ────────────────────────────────────
const DISCORD_EPOCH = 1420070400000n;
function snowflakeToAgeDays(id) {
    try {
        const ms = Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
        return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
    } catch { return -1; }
}
function scoreByAge(ageDays) {
    if (ageDays < 0)   return 0;
    if (ageDays < 7)   return 10;
    if (ageDays < 30)  return 35;
    if (ageDays < 90)  return 60;
    if (ageDays < 365) return 80;
    return 100;
}
function tierByScore(s) { return s >= 80 ? 'top' : s >= 50 ? 'ok' : 'new'; }

// ─── API: Analytics ───────────────────────────────────────────────────────────
app.get('/api/analytics', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    res.json({
        timeline: Analytics.getTimeline(uid),
        totals: {
            sent:    st.currentStatus.messagesSent   || 0,
            errors:  st.currentStatus.errorsTotal    || 0,
            blocked: st.currentStatus.blockedThisRun || 0,
        },
        running: st.currentStatus.running || false,
    });
});

// ─── API: Global dedup registry ───────────────────────────────────────────────
app.get('/api/dedup-stats', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const list = loadFile(uid, 'dmed_all_time.txt');
    res.json({ count: list.length });
});

app.delete('/api/dedup-registry', requireAuth, (req, res) => {
    saveFile(req.session.userId, 'dmed_all_time.txt', '');
    res.json({ success: true, message: 'Global DM registry cleared' });
});

// ─── API: Token profile ───────────────────────────────────────────────────────
const DISCORD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

app.post('/api/token-profile/fetch', express.json(), requireAuth, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.json({ success: false, message: 'Token required' });
        const resp = await axios.get('https://discord.com/api/v9/users/@me', {
            headers: { Authorization: extractToken(token.trim()), 'User-Agent': DISCORD_UA },
            timeout: 8000, validateStatus: () => true,
        });
        if (resp.status !== 200) return res.json({ success: false, message: `Discord returned ${resp.status}` });
        const u = resp.data;
        const avatarUrl = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
            : null;
        res.json({ success: true, id: u.id, username: u.username, globalName: u.global_name, avatarUrl, bio: u.bio || '', nitro: u.premium_type > 0 });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/token-profile/update', express.json(), requireAuth, async (req, res) => {
    try {
        const { token, displayName, avatarUrl, bio } = req.body;
        if (!token) return res.json({ success: false, message: 'Token required' });

        const authToken = extractToken(token.trim());
        const headers   = { Authorization: authToken, 'User-Agent': DISCORD_UA, 'Content-Type': 'application/json' };
        const body      = {};

        if (displayName && displayName.trim()) body.global_name = displayName.trim().slice(0, 32);
        if (bio !== undefined)                  body.bio         = bio;

        if (avatarUrl && avatarUrl.trim()) {
            try {
                const imgResp = await axios.get(avatarUrl.trim(), { responseType: 'arraybuffer', timeout: 10000 });
                const mime    = imgResp.headers['content-type'] || 'image/png';
                const b64     = Buffer.from(imgResp.data).toString('base64');
                body.avatar   = `data:${mime};base64,${b64}`;
            } catch (e) {
                return res.json({ success: false, message: `Failed to fetch avatar image: ${e.message}` });
            }
        }

        if (!Object.keys(body).length) return res.json({ success: false, message: 'Nothing to update — provide at least one field' });

        const resp = await axios.patch('https://discord.com/api/v9/users/@me', body, {
            headers, timeout: 10000, validateStatus: () => true,
        });
        if (resp.status === 200) {
            const u = resp.data;
            res.json({ success: true, message: 'Profile updated', username: u.username, globalName: u.global_name });
        } else {
            const msg = resp.data?.message || `HTTP ${resp.status}`;
            res.json({ success: false, message: msg });
        }
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Member scoring ──────────────────────────────────────────────────────
app.post('/api/score-members', express.json(), requireAuth, (req, res) => {
    try {
        const { memberIds, threshold = 0 } = req.body;
        if (!memberIds || !memberIds.length) return res.json({ success: false, message: 'No member IDs provided' });

        const scored = memberIds.map(id => {
            const ageDays = snowflakeToAgeDays(id);
            const score   = scoreByAge(ageDays);
            return { id, ageDays, score, tier: tierByScore(score) };
        });

        const filtered = threshold > 0 ? scored.filter(m => m.score >= threshold) : scored;
        const distribution = { top: 0, ok: 0, new: 0 };
        scored.forEach(m => { distribution[m.tier] = (distribution[m.tier] || 0) + 1; });

        res.json({ success: true, scored: filtered, total: memberIds.length, kept: filtered.length, distribution });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Member intelligence ─────────────────────────────────────────────────
app.post('/api/members/analyze', express.json(), requireAuth, (req, res) => {
    try {
        const { memberIds } = req.body;
        if (!memberIds || !memberIds.length) return res.json({ success: false, message: 'No member IDs provided' });

        const ages = memberIds.map(id => snowflakeToAgeDays(id)).filter(a => a >= 0);
        if (!ages.length) return res.json({ success: false, message: 'Could not parse any Snowflake IDs' });

        const avg = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
        const dist = { under30: 0, d30to90: 0, d90to365: 0, y1to3: 0, over3y: 0 };
        ages.forEach(d => {
            if (d < 30) dist.under30++;
            else if (d < 90)  dist.d30to90++;
            else if (d < 365) dist.d90to365++;
            else if (d < 1095) dist.y1to3++;
            else dist.over3y++;
        });

        const sorted = [...ages].sort((a, b) => a - b);
        const scores = ages.map(d => scoreByAge(d));
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

        res.json({
            success: true,
            total: ages.length,
            avgAgeDays: avg,
            avgScore,
            minAgeDays: sorted[0],
            maxAgeDays: sorted[sorted.length - 1],
            distribution: dist,
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Multi-token distributed scraping ────────────────────────────────────
app.post('/api/scrape-distributed', express.json(), requireAuth, async (req, res) => {
    try {
        const uid = req.session.userId;
        const { tokens, serverId } = req.body;
        if (!tokens || tokens.length < 2) return res.json({ success: false, message: 'Provide at least 2 tokens for distributed scraping' });
        const sid = serverId || (loadFile(uid, 'serverId.txt')[0] || '');
        if (!sid) return res.json({ success: false, message: 'Server ID required' });

        const config = UD.loadUserConfig(uid);
        pushLog(uid, 'info', `[DISTRIBUTED] Starting parallel scrape with ${tokens.length} tokens on server ${sid}`);

        const results = await Promise.allSettled(
            tokens.map(async (rawToken) => {
                const tok = extractToken(rawToken.trim());
                if (!tok) return [];
                try {
                    return await DiscordScrapers.scraperOpcode14(tok, sid, {
                        minAccountAgeMinutes: config.scraper?.minAccountAgeMinutes || 0,
                        filterAdmins: config.scraper?.filterAdmins !== false,
                        filterBots:   config.scraper?.filterBots   !== false,
                    });
                } catch { return []; }
            })
        );

        const allMembers = [...new Set(results.flatMap(r => r.status === 'fulfilled' ? r.value : []))];
        const saveResult = dedupeAndSave(uid, allMembers);
        pushLog(uid, 'success', `[DISTRIBUTED] Complete — ${allMembers.length} unique members collected across ${tokens.length} tokens`);

        res.json({
            success: true,
            message: `Collected ${allMembers.length} unique members using ${tokens.length} tokens`,
            total: saveResult.total,
            newCount: saveResult.newCount,
            members: allMembers,
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Drip Sequences ──────────────────────────────────────────────────────
app.get('/api/sequences', requireAuth, (req, res) => {
    const uid = req.session.userId;
    res.json({ sequences: Sequences.loadSequences(uid), stats: Sequences.getWatcherStats(uid) });
});

app.post('/api/sequences', express.json(), requireAuth, (req, res) => {
    try {
        const uid = req.session.userId;
        const sequences = Sequences.loadSequences(uid);
        const { id, name, steps, enabled } = req.body;
        if (!name || !steps || !steps.length) return res.json({ success: false, message: 'Name and steps required' });
        const seq = {
            id: id || ('seq_' + Date.now()),
            name: name.trim(),
            enabled: enabled !== false,
            steps: steps.map(s => ({ message: String(s.message || ''), delayMs: Number(s.delayMs) || 3000 })),
            createdAt: id ? undefined : new Date().toISOString(),
        };
        if (!seq.createdAt) delete seq.createdAt;
        const idx = sequences.findIndex(s => s.id === seq.id);
        if (idx >= 0) { seq.createdAt = sequences[idx].createdAt; sequences[idx] = seq; }
        else { seq.createdAt = new Date().toISOString(); sequences.push(seq); }
        Sequences.saveSequences(uid, sequences);
        res.json({ success: true, sequence: seq });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.delete('/api/sequences/:id', requireAuth, (req, res) => {
    const uid  = req.session.userId;
    const seqs = Sequences.loadSequences(uid).filter(s => s.id !== req.params.id);
    Sequences.saveSequences(uid, seqs);
    res.json({ success: true });
});

app.get('/api/sequences/status', requireAuth, (req, res) => {
    res.json(Sequences.getWatcherStats(req.session.userId));
});

// ─── API: Export Blocked List ─────────────────────────────────────────────────
app.get('/api/export-blocked', requireAuth, (req, res) => {
    const blocked = loadFile(req.session.userId, 'blocked_members.txt');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="blocked_members_${new Date().toISOString().split('T')[0]}.txt"`);
    res.send(blocked.join('\n'));
});

// ─── API: Theme Preference ────────────────────────────────────────────────────
app.get('/api/theme', requireAuth, (req, res) => {
    const config = UD.loadUserConfig(req.session.userId);
    res.json({ theme: config.ui_theme || 'dark' });
});

app.post('/api/theme', express.json(), requireAuth, (req, res) => {
    const uid = req.session.userId;
    const existing = UD.loadUserConfig(uid);
    existing.ui_theme = req.body.theme === 'light' ? 'light' : 'dark';
    UD.saveUserConfig(uid, existing);
    res.json({ success: true });
});

// ─── API: Scraper Presets ─────────────────────────────────────────────────────
app.get('/api/scraper-presets', requireAuth, (req, res) => {
    const config = UD.loadUserConfig(req.session.userId);
    res.json({ presets: config.scraper_presets || [] });
});

app.post('/api/scraper-presets', express.json(), requireAuth, (req, res) => {
    const uid = req.session.userId;
    const { name, type, data } = req.body;
    if (!name || !type) return res.json({ success: false, message: 'Name and type required' });
    const cfg = UD.loadUserConfig(uid);
    cfg.scraper_presets = cfg.scraper_presets || [];
    const preset = { id: 'preset_' + Date.now(), name: name.trim(), type, data: data || {}, createdAt: new Date().toISOString() };
    cfg.scraper_presets.push(preset);
    UD.saveUserConfig(uid, cfg);
    res.json({ success: true, preset });
});

app.delete('/api/scraper-presets/:id', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const cfg = UD.loadUserConfig(uid);
    cfg.scraper_presets = (cfg.scraper_presets || []).filter(p => p.id !== req.params.id);
    UD.saveUserConfig(uid, cfg);
    res.json({ success: true });
});

// ─── API: A/B Test Stats ──────────────────────────────────────────────────────
app.get('/api/ab-stats', requireAuth, (req, res) => {
    const st  = getState(req.session.userId);
    const cfg = UD.loadUserConfig(req.session.userId);
    const messages = cfg.dm_messages || [];
    const stats = Object.entries(st.abTestStats || {}).map(([idx, count]) => {
        const idxN    = parseInt(idx);
        const replies = (st.variantReplies || {})[idxN] || 0;
        return {
            index: idxN,
            count,
            replies,
            responseRate: count > 0 ? Math.round((replies / count) * 1000) / 10 : 0,
            preview: (messages[idxN] || '').slice(0, 80),
        };
    });
    const total        = stats.reduce((s, x) => s + x.count, 0);
    const totalReplies = stats.reduce((s, x) => s + x.replies, 0);
    stats.forEach(s => { s.pct = total > 0 ? Math.round((s.count / total) * 100) : 0; });
    const paraphraseStats = Paraphrase.getCacheStats();
    res.json({ success: true, stats, total, totalReplies, paraphraseCache: paraphraseStats });
});

app.delete('/api/ab-stats', requireAuth, (req, res) => {
    const st = getState(req.session.userId);
    st.abTestStats   = {};
    st.variantReplies = {};
    st.sentVariantMap = {};
    res.json({ success: true });
});

// ─── API: Token Health Registry ───────────────────────────────────────────────
app.get('/api/token-health', requireAuth, (req, res) => {
    const health = loadJsonFile(req.session.userId, 'token_health.json');
    const entries = Object.entries(health).map(([key, v]) => ({ key, ...v }));
    res.json({ success: true, entries });
});

app.delete('/api/token-health', requireAuth, (req, res) => {
    saveJsonFile(req.session.userId, 'token_health.json', {});
    res.json({ success: true, message: 'Token health registry cleared' });
});

// ─── API: Campaign Templates ──────────────────────────────────────────────────
app.get('/api/campaign-templates', requireAuth, (req, res) => {
    const cfg = UD.loadUserConfig(req.session.userId);
    res.json({ success: true, templates: cfg.campaign_templates || [] });
});

app.post('/api/campaign-templates', express.json(), requireAuth, (req, res) => {
    const uid = req.session.userId;
    const { name } = req.body;
    if (!name || !name.trim()) return res.json({ success: false, message: 'Template name required' });
    const cfg = UD.loadUserConfig(uid);
    cfg.campaign_templates = cfg.campaign_templates || [];
    const template = {
        id: 'tpl_' + Date.now(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        config: {
            dm_messages: cfg.dm_messages || [],
            dm_delay_min: cfg.dm_delay_min,
            dm_delay_max: cfg.dm_delay_max,
            login_delay_min: cfg.login_delay_min,
            login_delay_max: cfg.login_delay_max,
            per_token_limit: cfg.per_token_limit,
            token_cooldown_ms: cfg.token_cooldown_ms,
            dm_retry_count: cfg.dm_retry_count,
            token_concurrency: cfg.token_concurrency,
            campaign_min_score: cfg.campaign_min_score,
            error_spike_enabled: cfg.error_spike_enabled,
            error_spike_threshold: cfg.error_spike_threshold,
            error_spike_window: cfg.error_spike_window,
            failed_requeue_enabled: cfg.failed_requeue_enabled,
            failed_requeue_delay_ms: cfg.failed_requeue_delay_ms,
        }
    };
    cfg.campaign_templates.push(template);
    UD.saveUserConfig(uid, cfg);
    res.json({ success: true, template });
});

app.post('/api/campaign-templates/:id/load', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const cfg = UD.loadUserConfig(uid);
    const tpl = (cfg.campaign_templates || []).find(t => t.id === req.params.id);
    if (!tpl) return res.json({ success: false, message: 'Template not found' });
    Object.assign(cfg, tpl.config);
    UD.saveUserConfig(uid, cfg);
    res.json({ success: true, message: `Template "${tpl.name}" loaded`, config: tpl.config });
});

app.delete('/api/campaign-templates/:id', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const cfg = UD.loadUserConfig(uid);
    cfg.campaign_templates = (cfg.campaign_templates || []).filter(t => t.id !== req.params.id);
    UD.saveUserConfig(uid, cfg);
    res.json({ success: true });
});

// ─── API: Anti-Detection Timing Profiles ──────────────────────────────────────
const TIMING_PROFILES = {
    stealth:     { login_delay_min: 8000, login_delay_max: 18000, dm_delay_min: 12000, dm_delay_max: 25000 },
    balanced:    { login_delay_min: 4000, login_delay_max: 9000,  dm_delay_min: 6000,  dm_delay_max: 12000 },
    fast:        { login_delay_min: 2000, login_delay_max: 5000,  dm_delay_min: 3000,  dm_delay_max: 7000  },
    aggressive:  { login_delay_min: 1000, login_delay_max: 2500,  dm_delay_min: 1500,  dm_delay_max: 4000  },
};

app.get('/api/timing-profiles', requireAuth, (req, res) => {
    res.json({ success: true, profiles: Object.keys(TIMING_PROFILES), definitions: TIMING_PROFILES });
});

app.post('/api/timing-profile/apply', express.json(), requireAuth, (req, res) => {
    const { profile } = req.body;
    if (!TIMING_PROFILES[profile]) return res.json({ success: false, message: 'Unknown profile: ' + profile });
    const uid = req.session.userId;
    const cfg = UD.loadUserConfig(uid);
    Object.assign(cfg, TIMING_PROFILES[profile]);
    UD.saveUserConfig(uid, cfg);
    pushLog(uid, 'info', `[TIMING] Applied anti-detection profile: ${profile}`);
    res.json({ success: true, message: `Profile "${profile}" applied`, timing: TIMING_PROFILES[profile] });
});

// ─── API: Discord Status Check ────────────────────────────────────────────────
app.get('/api/discord-status', requireAuth, async (req, res) => {
    try {
        const resp = await axios.get('https://discordstatus.com/api/v2/summary.json', { timeout: 6000 });
        const d = resp.data;
        const overall = d.status?.indicator || 'unknown';
        const description = d.status?.description || 'Unknown';
        const components = (d.components || []).slice(0, 8).map(c => ({ name: c.name, status: c.status }));
        const incidents = (d.incidents || []).slice(0, 3).map(i => ({ name: i.name, status: i.status, impact: i.impact, url: i.shortlink }));
        res.json({ success: true, overall, description, components, incidents });
    } catch (err) {
        res.json({ success: false, message: 'Failed to reach Discord status API: ' + err.message });
    }
});

// ─── API: Session Manager (Admin) ─────────────────────────────────────────────
app.get('/api/admin/sessions', requireAuth, requireAdmin, (req, res) => {
    const sessions = [];
    activeSessions.forEach((data, sessionId) => {
        sessions.push({ sessionId: sessionId.slice(0, 12) + '...', ...data, isCurrent: sessionId === req.sessionID });
    });
    res.json({ success: true, sessions, total: sessions.length });
});

app.delete('/api/admin/sessions/:sessionId', requireAuth, requireAdmin, (req, res) => {
    const partialId = req.params.sessionId;
    let killed = 0;
    activeSessions.forEach((data, sessionId) => {
        if (sessionId.startsWith(partialId.replace('...', ''))) {
            activeSessions.delete(sessionId);
            killed++;
        }
    });
    res.json({ success: true, killed });
});

app.delete('/api/admin/sessions', requireAuth, requireAdmin, (req, res) => {
    const kept = req.sessionID;
    let killed = 0;
    activeSessions.forEach((data, sessionId) => {
        if (sessionId !== kept) { activeSessions.delete(sessionId); killed++; }
    });
    res.json({ success: true, killed });
});

// ─── API: Change Password ─────────────────────────────────────────────────────
app.post('/api/change-password', express.json(), requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.json({ success: false, message: 'Both current and new password are required' });
        if (newPassword.length < 8) return res.json({ success: false, message: 'New password must be at least 8 characters' });
        const user = await Auth.getUserByMutex(req.session.mutex);
        if (!user) return res.json({ success: false, message: 'User not found' });
        const ok = await Auth.verifyPassword(user.password_hash, currentPassword);
        if (!ok) return res.json({ success: false, message: 'Current password is incorrect' });
        await Auth.setPassword(req.session.mutex, newPassword);
        pushLog(req.session.userId, 'info', '[SECURITY] Password changed successfully');
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Bulk File Import ────────────────────────────────────────────────────
app.post('/api/import-tokens', express.json(), requireAuth, (req, res) => {
    try {
        const { content, mode } = req.body;
        if (!content) return res.json({ success: false, message: 'No content provided' });
        const incoming = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 20);
        if (!incoming.length) return res.json({ success: false, message: 'No valid tokens found in import' });
        const uid = req.session.userId;
        let existing = loadFile(uid, 'tokens.txt');
        if (mode === 'replace') existing = [];
        const merged = [...new Set([...existing, ...incoming])];
        saveFile(uid, 'tokens.txt', merged.join('\n'));
        res.json({ success: true, message: `Imported ${incoming.length} token(s) — total: ${merged.length}`, added: incoming.length, total: merged.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/import-members', express.json(), requireAuth, (req, res) => {
    try {
        const { content, mode } = req.body;
        if (!content) return res.json({ success: false, message: 'No content provided' });
        const incoming = content.split(/\r?\n/).map(l => l.trim()).filter(l => /^\d{15,21}$/.test(l));
        if (!incoming.length) return res.json({ success: false, message: 'No valid Discord IDs found in import' });
        const uid = req.session.userId;
        let existing = loadFile(uid, 'members.txt');
        if (mode === 'replace') existing = [];
        const merged = [...new Set([...existing, ...incoming])];
        saveFile(uid, 'members.txt', merged.join('\n'));
        res.json({ success: true, message: `Imported ${incoming.length} member ID(s) — total: ${merged.length}`, added: incoming.length, total: merged.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Token Tier Management ───────────────────────────────────────────────
app.get('/api/token-tiers', requireAuth, (req, res) => {
    const uid    = req.session.userId;
    const tokens = loadFile(uid, 'tokens.txt');
    const all    = TokenTiers.getAllTiers(uid);
    const summary = tokens.map(t => {
        const key  = TokenTiers.tokenKey(t);
        const data = all[key] || {};
        return {
            tokenKey: key,
            tier: data.tier || 'T3',
            label: TokenTiers.getTierLabel(data.tier || 'T3'),
            firstSeen: data.firstSeen || null,
            manualOverride: !!data.manualOverride,
            updatedAt: data.updatedAt || null,
        };
    });
    const counts = { T1: 0, T2: 0, T3: 0 };
    summary.forEach(s => { counts[s.tier] = (counts[s.tier] || 0) + 1; });
    res.json({ success: true, tokens: summary, counts, tierDefs: TokenTiers.TIERS });
});

app.post('/api/token-tiers/assign', express.json(), requireAuth, (req, res) => {
    const uid   = req.session.userId;
    const { token, tier } = req.body;
    if (!token || !tier) return res.json({ success: false, message: 'token and tier required' });
    if (!['T1', 'T2', 'T3'].includes(tier)) return res.json({ success: false, message: 'tier must be T1, T2, or T3' });
    TokenTiers.assignTier(uid, token, tier);
    res.json({ success: true, message: `Token manually assigned to ${tier}` });
});

app.post('/api/token-tiers/auto-assign', requireAuth, (req, res) => {
    const uid    = req.session.userId;
    const tokens = loadFile(uid, 'tokens.txt');
    if (!tokens.length) return res.json({ success: false, message: 'No tokens loaded' });
    const results = TokenTiers.autoAssignAll(uid, tokens);
    const counts  = { T1: 0, T2: 0, T3: 0 };
    Object.values(results).forEach(tier => { counts[tier] = (counts[tier] || 0) + 1; });
    pushLog(uid, 'info', `[TIERS] Auto-assigned: T1 Elite: ${counts.T1} | T2 Active: ${counts.T2} | T3 Fresh: ${counts.T3}`);
    res.json({ success: true, message: `Auto-assigned ${tokens.length} tokens`, counts });
});

// ─── API: IP Reputation ───────────────────────────────────────────────────────
app.get('/api/ip-reputation', requireAuth, (req, res) => {
    const entries = IpRep.getAll(req.session.userId);
    res.json({ success: true, entries, total: entries.length });
});

app.delete('/api/ip-reputation', requireAuth, (req, res) => {
    IpRep.clear(req.session.userId);
    res.json({ success: true, message: 'IP reputation registry cleared' });
});

// ─── API: Mutual Server Injection ─────────────────────────────────────────────
// Brings throwaway tokens into target servers to establish mutual server overlap
// before the main campaign begins. This can unlock DM access on some accounts.
app.post('/api/mutual-inject', express.json(), requireAuth, async (req, res) => {
    const uid = req.session.userId;
    try {
        const { tokens: rawTokens, inviteCode, delay = 3000 } = req.body;
        if (!rawTokens || !Array.isArray(rawTokens) || !rawTokens.length) {
            return res.json({ success: false, message: 'tokens array required' });
        }
        if (!inviteCode) return res.json({ success: false, message: 'inviteCode required' });
        const code = inviteCode.trim().replace(/^https?:\/\/(www\.)?discord\.(gg|com\/invite)\//, '').replace(/\/$/, '');
        pushLog(uid, 'info', `[MUTUAL] Starting mutual server injection — ${rawTokens.length} token(s) → discord.gg/${code}`);
        const results = [];
        for (const rawToken of rawTokens) {
            const tok   = extractToken(rawToken.trim());
            if (!tok) { results.push({ token: rawToken.slice(0, 20), status: 'skipped', message: 'Invalid format' }); continue; }
            const _mFp  = Fingerprint.generateFingerprint();
            try {
                const resp = await axios.post(
                    `https://discord.com/api/v9/invites/${code}`,
                    { session_id: null },
                    {
                        headers: {
                            'Authorization': tok,
                            'Content-Type': 'application/json',
                            'User-Agent': _mFp.userAgent,
                            'X-Super-Properties': Fingerprint.buildSuperPropertiesXHeader(_mFp),
                            'X-Discord-Locale': _mFp.languages[0] || 'en-US',
                        },
                        timeout: 12000,
                        validateStatus: () => true,
                    }
                );
                if (resp.status === 200 || resp.status === 204) {
                    const gName = resp.data?.guild?.name || 'unknown';
                    results.push({ token: tok.split('.')[0], status: 'joined', message: `Joined ${gName}` });
                    pushLog(uid, 'success', `[MUTUAL] Joined ${gName} with token ${tok.slice(0, 20)}...`);
                    // No proxy used for mutual-inject — skip IP reputation recording
                } else if (resp.data?.captcha_key) {
                    results.push({ token: tok.split('.')[0], status: 'captcha', message: 'Captcha required' });
                } else {
                    results.push({ token: tok.split('.')[0], status: 'failed', message: `HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 80)}` });
                }
            } catch (err) {
                results.push({ token: tok.split('.')[0], status: 'error', message: err.message });
            }
            if (delay > 0 && rawTokens.indexOf(rawToken) < rawTokens.length - 1) {
                await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 1500)));
            }
        }
        const joined = results.filter(r => r.status === 'joined').length;
        pushLog(uid, joined > 0 ? 'success' : 'warn', `[MUTUAL] Injection complete — ${joined}/${rawTokens.length} joined`);
        res.json({ success: true, results, joined, total: rawTokens.length });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ─── API: Distributed Node Orchestration ──────────────────────────────────────
// Coordinator mode: exposes endpoints worker nodes can call to claim members,
// report stats, and fetch campaign config. Protected by a shared node_secret.
// Set config.distributed_mode = 'coordinator' and config.node_secret = '<key>'.
// Worker nodes set config.distributed_mode = 'worker' and configure coordinator_url.

function requireNodeAuth(req, res, next) {
    const uid = req.session?.userId;
    if (uid) {
        const cfg = UD.loadUserConfig(uid);
        if (cfg.distributed_mode !== 'coordinator') {
            return res.status(403).json({ success: false, message: 'Node API requires coordinator mode' });
        }
        return next();
    }
    const authHeader = req.headers['x-node-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!authHeader) return res.status(401).json({ success: false, message: 'x-node-secret required' });
    const matched = Object.keys(userState).find(uid => {
        const cfg = UD.loadUserConfig(uid);
        return cfg.node_secret && cfg.node_secret === authHeader && cfg.distributed_mode === 'coordinator';
    });
    if (!matched) return res.status(403).json({ success: false, message: 'Invalid node secret or coordinator not configured' });
    req._nodeUserId = matched;
    next();
}

app.post('/api/node/register', express.json(), requireNodeAuth, (req, res) => {
    const uid     = req._nodeUserId || req.session?.userId;
    const st      = getState(uid);
    const { workerId, nodeInfo = {} } = req.body;
    if (!workerId) return res.json({ success: false, message: 'workerId required' });
    st.nodeWorkers = st.nodeWorkers || {};
    st.nodeWorkers[workerId] = { ...nodeInfo, registeredAt: new Date().toISOString(), lastSeen: new Date().toISOString(), stats: { sent: 0, errors: 0 } };
    pushLog(uid, 'info', `[NODE] Worker registered: ${workerId} | ${JSON.stringify(nodeInfo).slice(0, 80)}`);
    res.json({ success: true, workerId, message: 'Registered with coordinator' });
});

app.get('/api/node/claim-members', requireNodeAuth, (req, res) => {
    const uid    = req._nodeUserId || req.session?.userId;
    const st     = getState(uid);
    const cfg    = UD.loadUserConfig(uid);
    const batch  = Math.min(parseInt(req.query.batch) || 50, 500);
    const workerId = req.query.workerId || 'unknown';
    if (!st.currentStatus?.running) {
        return res.json({ success: false, message: 'No active campaign on coordinator' });
    }
    const pool = st.sharedPool || loadFile(uid, 'members.txt');
    const claimed = pool.splice(0, batch);
    if (st.sharedPool) saveFile(uid, 'members.txt', pool.join('\n'));
    if (st.nodeWorkers && st.nodeWorkers[workerId]) {
        st.nodeWorkers[workerId].lastSeen = new Date().toISOString();
    }
    pushLog(uid, 'info', `[NODE] Worker ${workerId} claimed ${claimed.length} members — pool remaining: ${pool.length}`);
    res.json({ success: true, members: claimed, remaining: pool.length, workerId });
});

app.post('/api/node/report-stats', express.json(), requireNodeAuth, (req, res) => {
    const uid      = req._nodeUserId || req.session?.userId;
    const st       = getState(uid);
    const { workerId, sent = 0, errors = 0, logs = [] } = req.body;
    if (workerId && st.nodeWorkers && st.nodeWorkers[workerId]) {
        st.nodeWorkers[workerId].lastSeen = new Date().toISOString();
        st.nodeWorkers[workerId].stats.sent   += sent;
        st.nodeWorkers[workerId].stats.errors += errors;
    }
    if (sent > 0 && st.currentStatus) st.currentStatus.messagesSent = (st.currentStatus.messagesSent || 0) + sent;
    if (errors > 0 && st.currentStatus) st.currentStatus.errorsTotal = (st.currentStatus.errorsTotal || 0) + errors;
    for (const log of (logs || []).slice(0, 20)) {
        pushLog(uid, log.level || 'info', `[NODE:${workerId || '?'}] ${log.msg || ''}`);
    }
    res.json({ success: true });
});

app.get('/api/node/config', requireNodeAuth, (req, res) => {
    const uid = req._nodeUserId || req.session?.userId;
    const cfg = UD.loadUserConfig(uid);
    const safeCfg = { ...cfg };
    delete safeCfg.node_secret;
    delete safeCfg.paraphrase_api_key;
    delete safeCfg.captcha;
    res.json({ success: true, config: safeCfg });
});

app.get('/api/node/workers', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const st  = getState(uid);
    const workers = Object.entries(st.nodeWorkers || {}).map(([id, data]) => ({
        workerId: id,
        ...data,
        staleSec: Math.floor((Date.now() - new Date(data.lastSeen).getTime()) / 1000),
    }));
    res.json({ success: true, workers, total: workers.length });
});

// ─── API: Per-Token Fingerprint Registry ──────────────────────────────────────
app.get('/api/token-fingerprints', requireAuth, (req, res) => {
    try {
        const filePath = UD.userFile(req.session.userId, 'token_fingerprints.json');
        const raw = require('fs').existsSync(filePath)
            ? JSON.parse(require('fs').readFileSync(filePath, 'utf8'))
            : {};
        const tokens = Object.keys(raw);
        res.json({ success: true, stored: tokens.length, sample: tokens.slice(0, 5) });
    } catch { res.json({ success: true, stored: 0 }); }
});

app.delete('/api/token-fingerprints', requireAuth, (req, res) => {
    Fingerprint.clearTokenFingerprints(req.session.userId);
    res.json({ success: true, message: 'Token fingerprint registry cleared' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`${chalk.greenBright('Server running on')} http://localhost:${PORT}`);
    try {
        const { data, error } = await Auth.supabase.from('nubycord_users').select('id').limit(1);
        if (error) {
            console.error(chalk.redBright('[Supabase] Connection test FAILED:'), error.code, error.message);
        } else {
            console.log(chalk.greenBright('[Supabase] Connection test OK —'), (data?.length ?? 0), 'row(s) visible');
        }
    } catch (e) {
        console.error(chalk.redBright('[Supabase] Connection test exception:'), e.message);
    }
});
