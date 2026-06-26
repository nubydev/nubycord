const { chromium } = require('playwright');
const { generateFingerprint, buildEvasionScript, buildSuperPropertiesXHeader } = require('./fingerprint');
const { HumanBehavior, generateProfile, sleep } = require('./human-behavior');
const CaptchaSolver = require('./captcha');

const HEADLESS_BYPASS_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-site-isolation-trials',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-infobars',
    '--disable-breakpad',
    '--disable-canvas-aa',
    '--disable-2d-canvas-clip-aa',
    '--disable-gl-drawing-for-tests',
    '--disable-extensions',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--allow-running-insecure-content',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--no-default-browser-check',
    '--safebrowsing-disable-auto-update',
    '--password-store=basic',
    '--use-mock-keychain',
    '--hide-scrollbars',
    '--mute-audio',
];

const DISCORD_REGISTER_URL = 'https://discord.com/register';
const DISCORD_API_BASE     = 'https://discord.com/api/v9';

// ─── Name / Email generators ──────────────────────────────────────────────────
const FIRST_NAMES = [
    'alex', 'sam', 'jordan', 'casey', 'riley', 'drew', 'morgan', 'quinn', 'blake', 'taylor',
    'avery', 'peyton', 'skyler', 'reese', 'finley', 'sage', 'river', 'rowan', 'eden', 'dallas',
    'carter', 'logan', 'hunter', 'parker', 'hayden', 'emery', 'indigo', 'storm', 'phoenix', 'lane',
    'emerson', 'kieran', 'remi', 'shiloh', 'sloane', 'teagan', 'vale', 'winter', 'raven', 'ash',
];

const DOMAINS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'protonmail.com',
    'icloud.com', 'live.com', 'mail.com', 'zoho.com', 'aol.com',
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName() {
    const base = FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)];
    const suffix = randomInt(10, 9999).toString();
    return base + suffix;
}

function randomEmail(username = null) {
    const user   = username || randomName();
    const sep    = Math.random() < 0.4 ? (Math.random() < 0.5 ? '.' : '_') : '';
    const extra  = Math.random() < 0.3 ? randomInt(1, 999).toString() : '';
    const domain = DOMAINS[randomInt(0, DOMAINS.length - 1)];
    return `${user}${sep}${extra}@${domain}`.replace(/\.$/, '@').replace('@@', '@');
}

function randomPassword(length = randomInt(12, 20)) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    return Array.from({ length }, () => chars[randomInt(0, chars.length - 1)]).join('');
}

function randomBirthdate() {
    const year  = randomInt(1985, 2002);
    const month = randomInt(1, 12);
    const day   = randomInt(1, 28);
    return {
        year:  year.toString(),
        month: month.toString(),
        day:   day.toString(),
    };
}

// ─── Proxy config builder ─────────────────────────────────────────────────────
function buildProxyConfig(proxy) {
    if (!proxy) return undefined;
    if (proxy.type === 'socks5' || proxy.type === 'socks4') return { server: proxy.raw };
    if (proxy.auth) {
        const [username, password] = proxy.auth.split(':');
        return { server: `http://${proxy.host}:${proxy.port}`, username, password };
    }
    return { server: proxy.raw || `http://${proxy.host}:${proxy.port}` };
}

// ─── Main class ───────────────────────────────────────────────────────────────
class PlaywrightBrowser {
    constructor(options = {}) {
        this.captchaApiKey  = options.captchaApiKey  || null;
        this.captchaService = options.captchaService || 'anticaptcha';
        this.proxy          = options.proxy          || null;
        this.headless       = options.headless       !== false;
        this._browser       = null;
        this._fp            = null;
        this._logFn         = options.logFn          || console.log;
    }

    _log(msg) { this._logFn(`[Playwright] ${msg}`); }

    async _launchBrowser(fp, proxy) {
        const proxyConfig = buildProxyConfig(proxy);
        return chromium.launch({
            headless: this.headless,
            args: [
                ...HEADLESS_BYPASS_ARGS,
                `--window-size=${fp.viewport.width},${fp.viewport.height}`,
            ],
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
        });
    }

    async _newContext(browser, fp, proxy) {
        const proxyConfig = buildProxyConfig(proxy);
        const ctx = await browser.newContext({
            userAgent: fp.userAgent,
            viewport: fp.viewport,
            locale: fp.languages[0],
            timezoneId: fp.timezone,
            extraHTTPHeaders: {
                'Accept-Language': fp.languages.join(',') + ';q=0.9',
            },
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
        });
        await ctx.addInitScript(buildEvasionScript(fp));
        return ctx;
    }

    // ─── Token validation via real browser ──────────────────────────────────
    async validateTokenViaChrome(discordToken) {
        let browser = null;
        try {
            const fp = generateFingerprint();
            browser  = await this._launchBrowser(fp, this.proxy);
            const ctx = await this._newContext(browser, fp, this.proxy);
            const superProps = buildSuperPropertiesXHeader(fp);

            const response = await ctx.request.get(`${DISCORD_API_BASE}/users/@me`, {
                headers: {
                    'Authorization': discordToken,
                    'User-Agent': fp.userAgent,
                    'X-Super-Properties': superProps,
                    'X-Discord-Locale': fp.languages[0],
                    'Referer': 'https://discord.com/',
                    'Origin': 'https://discord.com',
                },
            });

            if (response.status() === 200) {
                const data = await response.json();
                return {
                    valid: true,
                    username: data.username,
                    discriminator: data.discriminator,
                    id: data.id,
                    email: data.email || null,
                    phone: data.phone || null,
                    mfaEnabled: data.mfa_enabled || false,
                };
            }
            return { valid: false, reason: `HTTP ${response.status()}` };
        } catch (err) {
            return { valid: false, reason: err.message };
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    // ─── Join server via real browser ────────────────────────────────────────
    async joinServerViaChrome(discordToken, inviteCode) {
        let browser = null;
        try {
            const fp = generateFingerprint();
            browser  = await this._launchBrowser(fp, this.proxy);
            const ctx = await this._newContext(browser, fp, this.proxy);
            const superProps = buildSuperPropertiesXHeader(fp);

            const cleanCode = inviteCode.trim()
                .replace(/^https?:\/\/(www\.)?discord\.(gg|com\/invite)\//, '')
                .replace(/\/$/, '');

            let response = await ctx.request.post(`${DISCORD_API_BASE}/invites/${cleanCode}`, {
                headers: {
                    'Authorization': discordToken,
                    'Content-Type': 'application/json',
                    'User-Agent': fp.userAgent,
                    'X-Super-Properties': superProps,
                    'X-Discord-Locale': fp.languages[0],
                    'Referer': 'https://discord.com/',
                    'Origin': 'https://discord.com',
                },
                data: JSON.stringify({ session_id: null }),
            });

            let data = await response.json();

            if (response.status() === 400 && data.captcha_key) {
                if (!this.captchaApiKey) {
                    return { success: false, message: 'Captcha required — no solver configured', captcha: true };
                }
                this._log(`Solving captcha for invite ${cleanCode}...`);
                const solver = new CaptchaSolver(this.captchaApiKey, this.captchaService);
                const captchaToken = await solver.solveDiscordCaptcha(
                    data.captcha_sitekey,
                    `https://discord.com/invite/${cleanCode}`,
                    data.captcha_rqdata || null
                );
                response = await ctx.request.post(`${DISCORD_API_BASE}/invites/${cleanCode}`, {
                    headers: {
                        'Authorization': discordToken,
                        'Content-Type': 'application/json',
                        'User-Agent': fp.userAgent,
                        'X-Super-Properties': superProps,
                        'X-Discord-Locale': fp.languages[0],
                        'Referer': 'https://discord.com/',
                        'Origin': 'https://discord.com',
                    },
                    data: JSON.stringify({
                        session_id: null,
                        captcha_key: captchaToken,
                        captcha_rqtoken: data.captcha_rqtoken || undefined,
                    }),
                });
                data = await response.json();
            }

            if (response.status() === 200 || response.status() === 204) {
                const guildId = data.guild?.id;
                if (guildId) {
                    await ctx.request.get(
                        `${DISCORD_API_BASE}/guilds/${guildId}/member-verification?with_guild=false&invite_code=${cleanCode}`,
                        { headers: { 'Authorization': discordToken, 'User-Agent': fp.userAgent } }
                    ).catch(() => {});
                }
                return { success: true, message: `Joined ${data.guild?.name || 'server'}`, guildId };
            }
            return { success: false, message: data.message || `HTTP ${response.status()}` };

        } catch (err) {
            return { success: false, message: err.message };
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    // ─── Token generation — registers a new Discord account ─────────────────
    /**
     * Creates a Discord account via the registration page with full human behavior.
     * Returns { success, token, email, username, password } on success.
     *
     * @param {object} [overrides]  — optional { email, username, password, birthdate }
     */
    async generateToken(overrides = {}) {
        let browser = null;
        try {
            const fp      = generateFingerprint();
            const profile = generateProfile();
            browser       = await this._launchBrowser(fp, this.proxy);
            const ctx     = await this._newContext(browser, fp, this.proxy);

            // Intercept the login/register API call to steal the token
            let capturedToken = null;
            await ctx.route(`**/${DISCORD_API_BASE.replace('https://', '')}/**`, async (route, request) => {
                const resp = await route.fetch();
                try {
                    const json = await resp.json();
                    if (json.token) capturedToken = json.token;
                } catch (_) {}
                await route.fulfill({ response: resp });
            });

            const page   = await ctx.newPage();
            const human  = new HumanBehavior(page, profile);

            const email    = overrides.email    || randomEmail();
            const username = overrides.username || randomName();
            const password = overrides.password || randomPassword();
            const bd       = overrides.birthdate || randomBirthdate();

            this._log(`Registering account — ${email} / @${username}`);

            // Warm up — arrive on discord.com first, then navigate
            await human.warmUp('https://discord.com');
            await human.think();

            await page.goto(DISCORD_REGISTER_URL, { waitUntil: 'domcontentloaded' });
            await human.waitForLoad(2000, 5000);
            await human.idleWander();
            await human.think();

            // Email field
            await human.type('input[name="email"]', email);
            await sleep(400, 900);

            // Username field
            await human.type('input[name="username"]', username);
            await sleep(300, 800);

            // Password field
            await human.type('input[name="password"]', password);
            await sleep(500, 1200);

            // Date of birth — day / month / year selects
            this._log('Setting date of birth...');
            try {
                const monthSel = page.locator('select').nth(0);
                const daySel   = page.locator('select').nth(1);
                const yearSel  = page.locator('select').nth(2);

                await human.click(monthSel);
                await sleep(300, 700);
                await page.selectOption(monthSel, { index: parseInt(bd.month) });
                await sleep(400, 900);

                await human.click(daySel);
                await sleep(200, 600);
                await page.selectOption(daySel, { label: bd.day });
                await sleep(400, 900);

                await human.click(yearSel);
                await sleep(300, 700);
                await page.selectOption(yearSel, { label: bd.year });
                await sleep(500, 1000);
            } catch (_) {
                this._log('Date selects not found — trying text inputs');
                try {
                    await human.type('[aria-label="Month"]', bd.month);
                    await human.type('[aria-label="Day"]',   bd.day);
                    await human.type('[aria-label="Year"]',  bd.year);
                } catch (_2) {}
            }

            await human.think();

            // CAPTCHA check — look for iframe
            const captchaFrame = page.frameLocator('iframe[src*="hcaptcha"]').first();
            let hasCaptcha = false;
            try {
                await captchaFrame.locator('#checkbox').waitFor({ timeout: 3000 });
                hasCaptcha = true;
            } catch (_) {}

            if (hasCaptcha) {
                if (!this.captchaApiKey) {
                    return { success: false, message: 'Registration captcha required — add captcha API key in settings' };
                }
                this._log('Captcha detected — solving...');
                // Extract sitekey from iframe src
                const frames = page.frames();
                let sitekey  = 'a9b5fb07-92ff-493f-86fe-352a2803b3df';
                for (const f of frames) {
                    const url = f.url();
                    if (url.includes('hcaptcha')) {
                        const m = url.match(/sitekey=([^&]+)/);
                        if (m) sitekey = m[1];
                        break;
                    }
                }
                const solver = new CaptchaSolver(this.captchaApiKey, this.captchaService);
                const captchaToken = await solver.solveDiscordCaptcha(sitekey, DISCORD_REGISTER_URL);
                this._log('Captcha solved — injecting token');
                await page.evaluate((token) => {
                    if (window.hcaptcha) window.hcaptcha.setResponse(token);
                    const el = document.querySelector('[name="h-captcha-response"]');
                    if (el) el.value = token;
                }, captchaToken);
                await sleep(500, 1500);
            }

            // Click continue / submit
            await human.think();
            await sleep(800, 2000);

            const submitBtn = page.locator('button[type="submit"]').first();
            await human.click(submitBtn);
            await human.waitForLoad(3000, 7000);

            // Wait to see if token was captured from network interception
            const deadline = Date.now() + 15000;
            while (!capturedToken && Date.now() < deadline) {
                await sleep(500);
                // Also check localStorage
                try {
                    capturedToken = await page.evaluate(() => {
                        try { return JSON.parse(localStorage.token); } catch (_) { return null; }
                    });
                } catch (_) {}
            }

            if (capturedToken) {
                this._log(`Token captured for @${username}`);
                return { success: true, token: capturedToken, email, username, password, birthdate: bd };
            }

            // Check for errors on page
            const errText = await human.readText('[class*="errorMessage"]') ||
                            await human.readText('[class*="error"]');
            if (errText) {
                return { success: false, message: errText.trim() };
            }

            return { success: false, message: 'Token not captured — email verification may be required' };

        } catch (err) {
            return { success: false, message: err.message };
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    async close() {
        if (this._browser) {
            await this._browser.close().catch(() => {});
            this._browser = null;
        }
    }
}

// ─── Batch helpers ────────────────────────────────────────────────────────────

async function batchValidateTokens(tokens, options = {}) {
    const results     = [];
    const concurrency = options.concurrency || 3;
    const chunks      = [];
    for (let i = 0; i < tokens.length; i += concurrency) {
        chunks.push(tokens.slice(i, i + concurrency));
    }
    for (const chunk of chunks) {
        const batch = await Promise.all(chunk.map(async (token) => {
            const pw = new PlaywrightBrowser(options);
            const r  = await pw.validateTokenViaChrome(token.trim());
            return { token, ...r };
        }));
        results.push(...batch);
        if (options.onProgress) options.onProgress({ done: results.length, total: tokens.length });
    }
    return results;
}

/**
 * Generate multiple tokens in sequence with delays between each.
 * @param {number} count
 * @param {object} options — { captchaApiKey, captchaService, proxy, delayMin, delayMax, onProgress, logFn }
 */
async function batchGenerateTokens(count, options = {}) {
    const results  = [];
    const delayMin = options.delayMin || 5000;
    const delayMax = options.delayMax || 12000;

    for (let i = 0; i < count; i++) {
        const proxy = options.proxyManager ? options.proxyManager.getProxy() : options.proxy || null;
        const pw    = new PlaywrightBrowser({
            captchaApiKey:  options.captchaApiKey  || null,
            captchaService: options.captchaService || 'anticaptcha',
            proxy,
            logFn: options.logFn || console.log,
        });
        const r = await pw.generateToken(options.accountOverrides || {});
        results.push(r);
        if (options.onProgress) options.onProgress({ done: i + 1, total: count, latest: r });
        if (i < count - 1) await sleep(delayMin, delayMax);
    }
    return results;
}

module.exports = { PlaywrightBrowser, batchValidateTokens, batchGenerateTokens };
