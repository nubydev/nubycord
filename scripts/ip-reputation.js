const fs = require('fs');
const UD = require('./userdata');

// Per-user IP reputation registry stored in ip_reputation.json
// Structure: { "1.2.3.4": { successes, failures, bannedSignals, score, lastUpdated } }

const BAN_SIGNALS = ['locked', 'banned', 'disabled', 'flagged', 'suspended', 'compromised', 'quarantine'];

function extractIp(proxy) {
    if (!proxy) return null;
    try {
        const raw = (typeof proxy === 'string') ? proxy : (proxy.raw || '');
        const stripped = raw
            .replace(/^(https?|socks[45]):\/\//, '')
            .replace(/^[^@]+@/, '');
        const hostPort = stripped.split(':')[0];
        return hostPort || null;
    } catch { return null; }
}

function load(userId) {
    const fp = UD.userFile(userId, 'ip_reputation.json');
    if (!fs.existsSync(fp)) return {};
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return {}; }
}

function save(userId, db) {
    fs.writeFileSync(UD.userFile(userId, 'ip_reputation.json'), JSON.stringify(db, null, 2));
}

function ensureEntry(db, ip) {
    if (!db[ip]) {
        db[ip] = { successes: 0, failures: 0, bannedSignals: 0, score: 50, lastUpdated: null };
    }
}

function recordSuccess(userId, proxy) {
    const ip = extractIp(proxy);
    if (!ip) return;
    const db = load(userId);
    ensureEntry(db, ip);
    db[ip].successes++;
    db[ip].score = Math.min(100, db[ip].score + 3);
    db[ip].lastUpdated = new Date().toISOString();
    save(userId, db);
}

function recordFailure(userId, proxy, reason) {
    const ip = extractIp(proxy);
    if (!ip) return;
    const db = load(userId);
    ensureEntry(db, ip);
    db[ip].failures++;

    const isBanSignal = reason && BAN_SIGNALS.some(s => reason.toLowerCase().includes(s));
    if (isBanSignal) {
        db[ip].bannedSignals++;
        db[ip].score = Math.max(0, db[ip].score - 30);
    } else {
        db[ip].score = Math.max(0, db[ip].score - 8);
    }
    db[ip].lastUpdated = new Date().toISOString();
    save(userId, db);
}

function getScore(userId, proxy) {
    const ip = extractIp(proxy);
    if (!ip) return 50;
    return load(userId)[ip]?.score ?? 50;
}

function isDirty(userId, proxy, threshold = 20) {
    return getScore(userId, proxy) < threshold;
}

function getAll(userId) {
    const db = load(userId);
    return Object.entries(db).map(([ip, entry]) => ({ ip, ...entry }))
        .sort((a, b) => b.score - a.score);
}

function clear(userId) {
    save(userId, {});
}

module.exports = { extractIp, recordSuccess, recordFailure, getScore, isDirty, getAll, clear };
