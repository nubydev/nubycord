const axios = require('axios');

const ANTICAP_BASE   = 'https://api.anti-captcha.com';
const TWOCAP_BASE    = 'https://2captcha.com';
const POLL_INTERVAL  = 4000;
const MAX_POLLS      = 45;
const MAX_RETRIES    = 2;
const RETRY_BASE_MS  = 3000;

class CaptchaSolver {
    constructor(apiKey, service = 'anticaptcha') {
        this.apiKey  = apiKey;
        this.service = service === '2captcha' || service === 'twocaptcha' ? '2captcha' : 'anticaptcha';
    }

    async getBalance() {
        if (this.service === '2captcha') return this._2capBalance();
        return this._anticapBalance();
    }

    async _anticapBalance() {
        const res = await axios.post(`${ANTICAP_BASE}/getBalance`,
            { clientKey: this.apiKey },
            { timeout: 10000 }
        );
        if (res.data.errorId !== 0) throw new Error(`Anti-Captcha: ${res.data.errorDescription}`);
        return parseFloat(res.data.balance);
    }

    async _2capBalance() {
        const res = await axios.get(`${TWOCAP_BASE}/res.php`, {
            params: { key: this.apiKey, action: 'getbalance', json: 1 },
            timeout: 10000,
        });
        if (res.data.status === 0) throw new Error(`2Captcha: ${res.data.request}`);
        return parseFloat(res.data.request);
    }

    async solveDiscordCaptcha(sitekey, pageUrl, rqdata = null) {
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        if (this.service === '2captcha') {
            return this._2capSolveHCaptcha(sitekey, pageUrl, rqdata, UA);
        }
        const task = {
            type: 'HCaptchaTaskProxyless',
            websiteURL: pageUrl,
            websiteKey: sitekey,
            isEnterprise: true,
            userAgent: UA,
        };
        if (rqdata) task.enterprisePayload = { rqdata };
        return this._anticapSolve(task, 'gRecaptchaResponse');
    }

    async solveHCaptcha(sitekey, pageUrl) {
        if (this.service === '2captcha') return this._2capSolveHCaptcha(sitekey, pageUrl);
        return this._anticapSolve({
            type: 'HCaptchaTaskProxyless',
            websiteURL: pageUrl,
            websiteKey: sitekey,
        }, 'gRecaptchaResponse');
    }

    async solveRecaptchaV2(sitekey, pageUrl) {
        if (this.service === '2captcha') return this._2capSolveRecaptchaV2(sitekey, pageUrl);
        return this._anticapSolve({
            type: 'RecaptchaV2TaskProxyless',
            websiteURL: pageUrl,
            websiteKey: sitekey,
        }, 'gRecaptchaResponse');
    }

    async solveRecaptchaV3(sitekey, pageUrl, action = 'verify', minScore = 0.7) {
        if (this.service === '2captcha') return this._2capSolveRecaptchaV3(sitekey, pageUrl, action, minScore);
        return this._anticapSolve({
            type: 'RecaptchaV3TaskProxyless',
            websiteURL: pageUrl,
            websiteKey: sitekey,
            pageAction: action,
            minScore,
        }, 'gRecaptchaResponse');
    }

    async solveImageCaptcha(base64Image) {
        if (this.service === '2captcha') return this._2capSolveImage(base64Image);
        return this._anticapSolve({ type: 'ImageToTextTask', body: base64Image }, 'text');
    }

    async _anticapSolve(taskObj, solutionKey) {
        let lastErr;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) await sleep(RETRY_BASE_MS * attempt);
            try {
                const createRes = await axios.post(`${ANTICAP_BASE}/createTask`,
                    { clientKey: this.apiKey, task: taskObj },
                    { timeout: 15000 }
                );
                if (createRes.data.errorId !== 0) {
                    throw new Error(`Anti-Captcha: ${createRes.data.errorDescription}`);
                }

                const taskId = createRes.data.taskId;

                for (let i = 0; i < MAX_POLLS; i++) {
                    await sleep(POLL_INTERVAL);
                    const pollRes = await axios.post(`${ANTICAP_BASE}/getTaskResult`,
                        { clientKey: this.apiKey, taskId },
                        { timeout: 10000 }
                    );
                    if (pollRes.data.errorId !== 0) {
                        throw new Error(`Anti-Captcha: ${pollRes.data.errorDescription}`);
                    }
                    if (pollRes.data.status === 'ready') {
                        const s = pollRes.data.solution;
                        if (!s) throw new Error('Anti-Captcha: no solution in response');
                        return s[solutionKey] || s.gRecaptchaResponse || s.text;
                    }
                }
                throw new Error(`Anti-Captcha timed out after ${(MAX_POLLS * POLL_INTERVAL) / 1000}s`);
            } catch (err) {
                lastErr = err;
                if (err.message.includes('ERROR_ZERO_BALANCE') || err.message.includes('ERROR_KEY_DOES_NOT_EXIST')) throw err;
            }
        }
        throw lastErr;
    }

    async _2capSolveHCaptcha(sitekey, pageUrl, rqdata = null, userAgent = null) {
        const params = {
            key:     this.apiKey,
            method:  'hcaptcha',
            sitekey,
            pageurl: pageUrl,
            json:    1,
            enterprise: 1,
        };
        if (rqdata)    params.data       = rqdata;
        if (userAgent) params.userAgent  = userAgent;

        const createRes = await axios.post(`${TWOCAP_BASE}/in.php`, null, { params, timeout: 15000 });
        if (createRes.data.status === 0) throw new Error(`2Captcha: ${createRes.data.request}`);
        const taskId = createRes.data.request;

        return this._2capPoll(taskId);
    }

    async _2capSolveRecaptchaV2(sitekey, pageUrl) {
        const createRes = await axios.post(`${TWOCAP_BASE}/in.php`, null, {
            params: { key: this.apiKey, method: 'userrecaptcha', googlekey: sitekey, pageurl: pageUrl, json: 1 },
            timeout: 15000,
        });
        if (createRes.data.status === 0) throw new Error(`2Captcha: ${createRes.data.request}`);
        return this._2capPoll(createRes.data.request);
    }

    async _2capSolveRecaptchaV3(sitekey, pageUrl, action, minScore) {
        const createRes = await axios.post(`${TWOCAP_BASE}/in.php`, null, {
            params: {
                key: this.apiKey, method: 'userrecaptcha', version: 'v3',
                googlekey: sitekey, pageurl: pageUrl,
                action, min_score: minScore, json: 1,
            },
            timeout: 15000,
        });
        if (createRes.data.status === 0) throw new Error(`2Captcha: ${createRes.data.request}`);
        return this._2capPoll(createRes.data.request);
    }

    async _2capSolveImage(base64Image) {
        const createRes = await axios.post(`${TWOCAP_BASE}/in.php`, null, {
            params: { key: this.apiKey, method: 'base64', body: base64Image, json: 1 },
            timeout: 15000,
        });
        if (createRes.data.status === 0) throw new Error(`2Captcha: ${createRes.data.request}`);
        return this._2capPoll(createRes.data.request);
    }

    async _2capPoll(taskId) {
        await sleep(10000);
        for (let i = 0; i < MAX_POLLS; i++) {
            await sleep(POLL_INTERVAL);
            const pollRes = await axios.get(`${TWOCAP_BASE}/res.php`, {
                params: { key: this.apiKey, action: 'get', id: taskId, json: 1 },
                timeout: 10000,
            });
            if (pollRes.data.status === 0) {
                if (pollRes.data.request === 'CAPCHA_NOT_READY') continue;
                throw new Error(`2Captcha: ${pollRes.data.request}`);
            }
            return pollRes.data.request;
        }
        throw new Error(`2Captcha timed out after ${(MAX_POLLS * POLL_INTERVAL) / 1000}s`);
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = CaptchaSolver;
