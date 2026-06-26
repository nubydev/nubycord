const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const IpRep = require('./ip-reputation');

class ProxyManager {
    constructor() {
        this.proxies  = [];
        this.failed   = new Set();
        this.scores   = {};
        this._rrIndex = 0;
        this.stats    = { total: 0, working: 0, failed: 0 };
        this.strategy = 'random';
    }

    setStrategy(strategy) {
        if (['random', 'roundrobin', 'scored'].includes(strategy)) {
            this.strategy = strategy;
        }
    }

    addProxies(proxyList) {
        this.proxies = proxyList
            .map(p => ProxyManager.parseProxy(p))
            .filter(Boolean);
        this.failed.clear();
        this.scores  = {};
        this._rrIndex = 0;
        for (const p of this.proxies) {
            this.scores[p.raw] = { success: 0, fail: 0, latency: Infinity, score: 50 };
        }
        this.stats.total = this.proxies.length;
    }

    static parseProxy(proxyString) {
        try {
            const trimmed = proxyString.trim();
            if (!trimmed) return null;

            if (trimmed.startsWith('socks5://') || trimmed.startsWith('socks4://')) {
                const type = trimmed.startsWith('socks5') ? 'socks5' : 'socks4';
                return { raw: trimmed, type, id: trimmed };
            }

            // Strip http:// or https:// prefix before splitting
            const stripped = trimmed.replace(/^https?:\/\//, '');

            const parts = stripped.split(':');
            if (parts.length === 2) {
                const raw = `http://${parts[0]}:${parts[1]}`;
                return { host: parts[0], port: parts[1], raw, type: 'http', id: raw };
            }
            if (parts.length === 4) {
                const raw = `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
                return {
                    host: parts[0], port: parts[1],
                    auth: `${parts[2]}:${parts[3]}`,
                    raw,
                    type: 'http',
                    id: raw
                };
            }
        } catch (_) {}
        return null;
    }

    static buildAgent(proxy) {
        if (proxy.type === 'socks4' || proxy.type === 'socks5') {
            return new SocksProxyAgent(proxy.raw);
        }
        return new HttpsProxyAgent(proxy.raw);
    }

    static async testProxy(proxy, timeoutMs = 8000) {
        const start = Date.now();
        try {
            const agent = ProxyManager.buildAgent(proxy);
            await axios.get('https://discord.com/api/v9/experiments', {
                httpsAgent: agent,
                httpAgent:  agent,
                timeout: timeoutMs,
                validateStatus: s => s < 500,
            });
            return { ok: true, latencyMs: Date.now() - start };
        } catch {
            return { ok: false, latencyMs: null };
        }
    }

    recordSuccess(proxy) {
        if (!proxy) return;
        const s = this.scores[proxy.raw];
        if (!s) return;
        s.success++;
        s.score = Math.min(100, s.score + 5);
    }

    recordFailure(proxy) {
        if (!proxy) return;
        const s = this.scores[proxy.raw];
        if (!s) return;
        s.fail++;
        s.score = Math.max(0, s.score - 15);
        if (s.fail > 3 && s.score < 10) {
            this.failed.add(proxy.raw);
            this.stats.failed++;
        }
    }

    _liveProxies() {
        return this.proxies.filter(p => !this.failed.has(p.raw));
    }

    getProxy() {
        let pool = this._liveProxies();
        if (!pool.length) {
            this.failed.clear();
            pool = this.proxies;
        }
        if (!pool.length) return null;

        if (this.strategy === 'roundrobin') {
            const p = pool[this._rrIndex % pool.length];
            this._rrIndex++;
            return p;
        }

        if (this.strategy === 'scored') {
            const totalScore = pool.reduce((sum, p) => sum + (this.scores[p.raw]?.score || 50), 0);
            let rand = Math.random() * totalScore;
            for (const p of pool) {
                rand -= (this.scores[p.raw]?.score || 50);
                if (rand <= 0) return p;
            }
            return pool[0];
        }

        return pool[Math.floor(Math.random() * pool.length)];
    }

    async bulkTest(concurrency = 10, onProgress = null) {
        this.stats.working = 0;
        this.stats.failed  = 0;
        this.failed.clear();
        for (const p of this.proxies) {
            if (this.scores[p.raw]) {
                this.scores[p.raw] = { success: 0, fail: 0, latency: Infinity, score: 50 };
            }
        }

        const results = [];
        const chunks  = [];
        for (let i = 0; i < this.proxies.length; i += concurrency) {
            chunks.push(this.proxies.slice(i, i + concurrency));
        }
        for (const chunk of chunks) {
            const batch = await Promise.all(chunk.map(async (proxy) => {
                const r = await ProxyManager.testProxy(proxy);
                if (r.ok) {
                    const s = this.scores[proxy.raw];
                    if (s) { s.latency = r.latencyMs; s.score = 75; }
                    this.stats.working++;
                } else {
                    this.recordFailure(proxy);
                }
                return { proxy: proxy.raw, ...r };
            }));
            results.push(...batch);
            if (onProgress) onProgress({ tested: results.length, total: this.proxies.length });
        }
        return results;
    }

    getStats() {
        return {
            total:   this.proxies.length,
            live:    this._liveProxies().length,
            failed:  this.failed.size,
            working: this.stats.working,
            strategy: this.strategy,
        };
    }

    getScoredList() {
        return this.proxies.map(p => ({
            proxy: p.raw,
            ...this.scores[p.raw],
            dead: this.failed.has(p.raw),
        })).sort((a, b) => b.score - a.score);
    }

    // ─── IP reputation pre-screening ──────────────────────────────────────────
    // Returns a proxy that passes IP reputation checks, skipping dirty IPs.
    // Falls back to normal selection if all IPs are dirty.
    getProxyClean(userId, dirtyThreshold = 20) {
        let pool = this._liveProxies();
        if (!pool.length) { this.failed.clear(); pool = this.proxies; }
        if (!pool.length) return null;

        const clean = pool.filter(p => !IpRep.isDirty(userId, p, dirtyThreshold));
        const candidates = clean.length > 0 ? clean : pool;

        if (this.strategy === 'roundrobin') {
            const p = candidates[this._rrIndex % candidates.length];
            this._rrIndex++;
            return p;
        }
        if (this.strategy === 'scored') {
            const totalScore = candidates.reduce((sum, p) => sum + (this.scores[p.raw]?.score || 50), 0);
            let rand = Math.random() * totalScore;
            for (const p of candidates) {
                rand -= (this.scores[p.raw]?.score || 50);
                if (rand <= 0) return p;
            }
            return candidates[0];
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

module.exports = ProxyManager;
