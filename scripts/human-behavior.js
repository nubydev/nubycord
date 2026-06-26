/**
 * Human Behavior Engine
 * Makes Playwright actions indistinguishable from real user input.
 * Every method simulates realistic human imperfection:
 *   — variable timing, curved mouse paths, typo injection,
 *     hesitation bursts, natural scroll patterns, and per-session profiles.
 */

// ─── Per-session personality profile ──────────────────────────────────────────
function generateProfile() {
    const typingBase = 60 + Math.random() * 140;
    return {
        typingMinMs:       Math.round(typingBase),
        typingMaxMs:       Math.round(typingBase + 40 + Math.random() * 100),
        thinkingChance:    0.15 + Math.random() * 0.25,
        thinkingMinMs:     800  + Math.random() * 1200,
        thinkingMaxMs:     3000 + Math.random() * 3000,
        typoChance:        0.04 + Math.random() * 0.08,
        mouseCurveNoise:   2    + Math.random() * 6,
        mouseSteps:        10   + Math.floor(Math.random() * 15),
        mouseStepDelayMin: 8,
        mouseStepDelayMax: 35,
        clickOffsetPct:    0.1  + Math.random() * 0.3,
        postClickMin:      180,
        postClickMax:      700,
        scrollAmount:      () => 200 + Math.random() * 500,
        warmupMin:         3000,
        warmupMax:         8000,
    };
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function rand(min, max) {
    return Math.random() * (max - min) + min;
}

async function sleep(min, max) {
    const ms = max !== undefined ? rand(min, max) : min;
    return new Promise(r => setTimeout(r, Math.round(ms)));
}

// Bezier curve between two points — produces a natural arc
function bezierPoint(t, p0, p1, p2) {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

// ─── Core class ───────────────────────────────────────────────────────────────
class HumanBehavior {
    /**
     * @param {import('playwright').Page} page
     * @param {object} [profile]  — override profile fields
     */
    constructor(page, profile = null) {
        this.page    = page;
        this.profile = { ...generateProfile(), ...(profile || {}) };
    }

    /** Randomised pause — general purpose */
    async delay(min = 400, max = 1200) {
        await sleep(min, max);
    }

    /** Hesitation burst — random chance of a long pause (thinking) */
    async think() {
        const p = this.profile;
        if (Math.random() < p.thinkingChance) {
            await sleep(p.thinkingMinMs, p.thinkingMaxMs);
        }
    }

    /**
     * Page warm-up — arrives like a real user browsing in.
     * Navigates, waits, scrolls, idles.
     */
    async warmUp(url) {
        const p = this.profile;
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(p.warmupMin, p.warmupMax);

        // Random light scroll
        const scrolls = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < scrolls; i++) {
            await this.page.mouse.wheel(0, p.scrollAmount());
            await sleep(600, 2000);
        }
        // Scroll back up (humans do this)
        if (Math.random() < 0.4) {
            await this.page.mouse.wheel(0, -p.scrollAmount() * 0.5);
            await sleep(400, 1000);
        }

        await this.think();
    }

    /**
     * Human-like mouse movement along a bezier curve.
     * Adds per-step jitter for realistic sub-pixel wander.
     */
    async moveMouse(x, y) {
        const p = this.profile;
        const vp = this.page.viewportSize() || { width: 1280, height: 800 };

        const startX = rand(0, vp.width  * 0.6);
        const startY = rand(0, vp.height * 0.6);

        // Control point — determines the curve of the path
        const cpX = rand(Math.min(startX, x), Math.max(startX, x));
        const cpY = rand(Math.min(startY, y), Math.max(startY, y));

        const steps = p.mouseSteps;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const mx = bezierPoint(t, startX, cpX, x) + rand(-p.mouseCurveNoise, p.mouseCurveNoise);
            const my = bezierPoint(t, startY, cpY, y) + rand(-p.mouseCurveNoise, p.mouseCurveNoise);
            await this.page.mouse.move(mx, my);
            await sleep(p.mouseStepDelayMin, p.mouseStepDelayMax);
        }
    }

    /**
     * Human-like click — moves to element with offset, small pause, clicks.
     * @param {string|import('playwright').Locator} selector
     */
    async click(selector) {
        const p = this.profile;
        const el  = typeof selector === 'string'
            ? this.page.locator(selector).first()
            : selector;

        const box = await el.boundingBox();
        if (!box) throw new Error(`Element not visible: ${selector}`);

        // Land somewhere inside the element (not always dead centre)
        const x = box.x + box.width  * rand(p.clickOffsetPct, 1 - p.clickOffsetPct);
        const y = box.y + box.height * rand(p.clickOffsetPct, 1 - p.clickOffsetPct);

        await this.moveMouse(x, y);
        await sleep(p.postClickMin * 0.3, p.postClickMax * 0.3);
        await this.page.mouse.click(x, y);
        await sleep(p.postClickMin, p.postClickMax);
    }

    /**
     * Human-like typing with per-character delays, random thinking pauses,
     * and occasional typo → backspace correction.
     * @param {string|import('playwright').Locator} selector
     * @param {string} text
     */
    async type(selector, text) {
        const p = this.profile;

        await this.click(selector);
        await sleep(200, 600);

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            // Occasional typo injection
            if (Math.random() < p.typoChance && /[a-z]/i.test(ch)) {
                const neighbours = { a:'sqzw', b:'vghn', c:'xdfv', d:'serfcx', e:'wsdr',
                    f:'rtgdcv', g:'yfhfvb', h:'yjugbn', i:'uojk', j:'hukni',
                    k:'jilom', l:'kop', m:'njk', n:'bhjm', o:'ipkl', p:'ol',
                    q:'wa', r:'etdf', s:'awedxz', t:'ryfe', u:'yhji', v:'cfgb',
                    w:'qase', x:'zsdc', y:'tghu', z:'asx' };
                const pool = neighbours[ch.toLowerCase()] || 'qwerty';
                const typo = pool[Math.floor(Math.random() * pool.length)];
                await this.page.keyboard.type(typo);
                await sleep(80, 250);
                await this.page.keyboard.press('Backspace');
                await sleep(60, 180);
            }

            await this.page.keyboard.type(ch);
            await sleep(p.typingMinMs, p.typingMaxMs);

            // Occasional mid-word pause (thinking about next word)
            if (Math.random() < 0.08 && ch === ' ') {
                await sleep(300, 1200);
            }
        }
        await this.think();
    }

    /**
     * Type in a field that already has content — clears it first naturally.
     */
    async clearAndType(selector, text) {
        await this.click(selector);
        await sleep(150, 400);
        await this.page.keyboard.press('Control+a');
        await sleep(100, 300);
        await this.page.keyboard.press('Backspace');
        await sleep(200, 500);
        await this.type(selector, text);
    }

    /**
     * Human scroll — variable speed, direction, sometimes bounces.
     * @param {'down'|'up'} direction
     * @param {number} [amount]
     */
    async scroll(direction = 'down', amount = null) {
        const p = this.profile;
        const delta = (amount || p.scrollAmount()) * (direction === 'up' ? -1 : 1);
        const steps = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < steps; i++) {
            await this.page.mouse.wheel(0, delta / steps + rand(-20, 20));
            await sleep(80, 300);
        }
        await sleep(300, 900);
    }

    /**
     * Move mouse to a random non-interactive area — idle wandering.
     */
    async idleWander() {
        const vp = this.page.viewportSize() || { width: 1280, height: 800 };
        const times = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < times; i++) {
            const x = rand(50, vp.width  - 50);
            const y = rand(50, vp.height - 50);
            await this.moveMouse(x, y);
            await sleep(200, 800);
        }
    }

    /**
     * Select an option from a <select> element like a human —
     * opens, pauses, picks.
     */
    async selectOption(selector, value) {
        await this.click(selector);
        await sleep(400, 1000);
        await this.page.selectOption(selector, value);
        await sleep(300, 700);
    }

    /**
     * Press a key with human-timing pre/post delay.
     */
    async pressKey(key) {
        await sleep(100, 400);
        await this.page.keyboard.press(key);
        await sleep(150, 500);
    }

    /**
     * Full realistic form-fill: click → think → type each field → think → submit.
     * @param {Array<{selector: string, value: string, clear?: boolean}>} fields
     * @param {string} [submitSelector]
     */
    async fillForm(fields, submitSelector = null) {
        await this.idleWander();
        await this.think();

        for (const field of fields) {
            await this.think();
            if (field.clear) {
                await this.clearAndType(field.selector, field.value);
            } else {
                await this.type(field.selector, field.value);
            }
            await sleep(300, 900);
        }

        await this.think();
        await sleep(600, 2000);

        if (submitSelector) {
            await this.click(submitSelector);
        }
    }

    /**
     * Read visible text from a selector — used for CAPTCHA prompts, errors, etc.
     */
    async readText(selector) {
        try {
            return await this.page.locator(selector).first().innerText({ timeout: 5000 });
        } catch {
            return null;
        }
    }

    /**
     * Wait for navigation/network idle, then add a human-realistic pause on top.
     */
    async waitForLoad(minExtra = 500, maxExtra = 2000) {
        try {
            await this.page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch {
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        }
        await sleep(minExtra, maxExtra);
    }
}

// ─── Standalone helpers (usable without a class instance) ─────────────────────

async function humanDelay(min = 800, max = 4000) {
    await sleep(min, max);
}

async function humanThink(chance = 0.3, minMs = 1000, maxMs = 5000) {
    if (Math.random() < chance) await sleep(minMs, maxMs);
}

async function warmUpPage(page, url, profile = null) {
    const h = new HumanBehavior(page, profile);
    await h.warmUp(url);
    return h;
}

module.exports = { HumanBehavior, generateProfile, humanDelay, humanThink, warmUpPage, sleep };
