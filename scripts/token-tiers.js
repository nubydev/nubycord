const fs = require('fs');
const UD = require('./userdata');

const TIERS = {
    T1: { label: 'Tier 1 — Elite',  priority: 3, description: 'Aged 30+ days, warmed, high trust' },
    T2: { label: 'Tier 2 — Active', priority: 2, description: 'Aged 7-30 days, warming in progress' },
    T3: { label: 'Tier 3 — Fresh',  priority: 1, description: 'New / unverified / burner' },
};

function tokenKey(token) {
    const raw = token.trim();
    const parts = raw.split('.');
    if (parts.length >= 2) return parts[0] + '.' + parts[1];
    return raw.substring(0, 30);
}

function loadRegistry(userId) {
    const fp = UD.userFile(userId, 'token_tiers.json');
    if (!fs.existsSync(fp)) return {};
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return {}; }
}

function saveRegistry(userId, registry) {
    fs.writeFileSync(UD.userFile(userId, 'token_tiers.json'), JSON.stringify(registry, null, 2));
}

function autoAssignTier(userId, token) {
    const registry = loadRegistry(userId);
    const key = tokenKey(token);
    const existing = registry[key] || {};

    if (existing.manualOverride) return existing.tier || 'T3';

    const healthFp = UD.userFile(userId, 'token_health.json');
    try {
        const th = JSON.parse(fs.readFileSync(healthFp, 'utf8'));
        const hEntry = th[token.substring(0, 30)];
        if (hEntry && hEntry.status === 'unhealthy') {
            registry[key] = { ...existing, tier: 'T3', autoReason: 'unhealthy', updatedAt: new Date().toISOString() };
            saveRegistry(userId, registry);
            return 'T3';
        }
    } catch {}

    const warmFp = UD.userFile(userId, 'warming_registry.json');
    let tier = 'T3';
    try {
        const wr = JSON.parse(fs.readFileSync(warmFp, 'utf8'));
        const wEntry = wr[token.substring(0, 30)];
        if (wEntry && wEntry.firstSeen) {
            const daysSince = Math.floor((Date.now() - new Date(wEntry.firstSeen).getTime()) / 86400000);
            const totalSent = Object.values(wEntry.dailyCounts || {}).reduce((s, v) => s + v, 0);
            if (daysSince >= 30 && totalSent >= 30) tier = 'T1';
            else if (daysSince >= 7 && totalSent >= 5) tier = 'T2';
        }
    } catch {}

    if (!existing.firstSeen) {
        registry[key] = { tier, firstSeen: new Date().toISOString(), autoReason: 'auto', updatedAt: new Date().toISOString() };
    } else {
        registry[key] = { ...existing, tier, autoReason: 'auto', updatedAt: new Date().toISOString() };
    }
    saveRegistry(userId, registry);
    return tier;
}

function assignTier(userId, token, tier) {
    if (!TIERS[tier]) return;
    const registry = loadRegistry(userId);
    const key = tokenKey(token);
    registry[key] = {
        ...(registry[key] || {}),
        tier,
        manualOverride: true,
        updatedAt: new Date().toISOString(),
    };
    saveRegistry(userId, registry);
}

function getTier(userId, token) {
    const registry = loadRegistry(userId);
    return registry[tokenKey(token)]?.tier || 'T3';
}

function recordTokenActivity(userId, token) {
    const registry = loadRegistry(userId);
    const key = tokenKey(token);
    if (!registry[key]) {
        registry[key] = { tier: 'T3', firstSeen: new Date().toISOString(), updatedAt: new Date().toISOString() };
        saveRegistry(userId, registry);
    }
}

function sortByTier(userId, tokens) {
    const tierPriority = { T1: 3, T2: 2, T3: 1 };
    return [...tokens].sort((a, b) => {
        const ta = getTier(userId, a);
        const tb = getTier(userId, b);
        return (tierPriority[tb] || 1) - (tierPriority[ta] || 1);
    });
}

function autoAssignAll(userId, tokens) {
    const results = {};
    for (const token of tokens) {
        const tier = autoAssignTier(userId, token);
        results[tokenKey(token)] = tier;
    }
    return results;
}

function getAllTiers(userId) {
    return loadRegistry(userId);
}

module.exports = { TIERS, getTier, getTierLabel: (t) => TIERS[t]?.label || t, sortByTier, assignTier, autoAssignTier, autoAssignAll, getAllTiers, recordTokenActivity, tokenKey };
