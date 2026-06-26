const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..', 'userdata');

function userDir(userId) {
    const dir = path.join(BASE_DIR, userId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function userFile(userId, filename) {
    return path.join(userDir(userId), filename);
}

function loadUserFile(userId, filename) {
    try {
        const fp = userFile(userId, filename);
        if (!fs.existsSync(fp)) { fs.writeFileSync(fp, ''); return []; }
        return fs.readFileSync(fp, 'utf8').replace(/\r/g, '').split('\n').filter(x => x);
    } catch { return []; }
}

function saveUserFile(userId, filename, content) {
    try {
        fs.writeFileSync(userFile(userId, filename), content);
    } catch (e) {
        console.error(`Error saving ${filename} for user ${userId}:`, e);
    }
}

function loadUserConfig(userId) {
    const fp = userFile(userId, 'config.json');
    if (!fs.existsSync(fp)) {
        const defaults = {
            login_delay_min: 2000,
            login_delay_max: 4000,
            dm_delay_min: 6000,
            dm_delay_max: 8000,
            per_token_limit: 0,
            per_token_rate_limit: 0,
            token_cooldown_ms: 30000,
            dm_messages: [],
            proxy: { enabled: false, proxies: [], strategy: 'random' },
            captcha: { enabled: false, apiKey: '', service: 'anticaptcha' },
            scraper: { type: 'opcode14', minAccountAgeMinutes: 0, filterAdmins: true, filterBots: true },
            rate_limit_alert_threshold: 5,
            rate_limit_alert_window_ms: 60000,
            rl_spike_auto_suspend: false,
            rl_spike_suspend_ms: 300000,
        };
        fs.writeFileSync(fp, JSON.stringify(defaults, null, 2));
        return defaults;
    }
    try {
        const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (cfg.captcha && cfg.captcha.services !== undefined) {
            const oldKey = cfg.captcha.services?.anticaptcha?.apiKey
                || cfg.captcha.apiKey
                || '';
            const wasEnabled = cfg.captcha.services?.anticaptcha?.enabled
                || cfg.captcha.enabled
                || false;
            cfg.captcha = { enabled: wasEnabled, apiKey: oldKey, service: cfg.captcha?.service || 'anticaptcha' };
            fs.writeFileSync(fp, JSON.stringify(cfg, null, 2));
        }
        return cfg;
    }
    catch { return {}; }
}

function saveUserConfig(userId, cfg) {
    fs.writeFileSync(userFile(userId, 'config.json'), JSON.stringify(cfg, null, 2));
}

function loadUserHistory(userId) {
    const fp = userFile(userId, 'campaign_history.json');
    if (!fs.existsSync(fp)) return [];
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return []; }
}

function saveUserHistory(userId, history) {
    fs.writeFileSync(userFile(userId, 'campaign_history.json'), JSON.stringify(history, null, 2));
}

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

module.exports = { userDir, userFile, loadUserFile, saveUserFile, loadUserConfig, saveUserConfig, loadUserHistory, saveUserHistory };
