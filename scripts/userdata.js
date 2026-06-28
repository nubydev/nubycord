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

const CONFIG_DEFAULTS = {
    login_delay_min: 2000,
    login_delay_max: 4000,
    dm_delay_min: 6000,
    dm_delay_max: 8000,
    per_token_limit: 0,
    per_token_rate_limit: 0,
    token_cooldown_ms: 30000,
    token_concurrency: 0,
    dm_retry_count: 0,
    dm_messages: [],
    proxy: { enabled: false, proxies: [], strategy: 'random' },
    captcha: { enabled: false, apiKey: '', service: 'anticaptcha' },
    scraper: { type: 'opcode14', minAccountAgeMinutes: 0, filterAdmins: true, filterBots: true },
    rate_limit_alert_threshold: 5,
    rate_limit_alert_window_ms: 60000,
    rl_spike_auto_suspend: false,
    rl_spike_suspend_ms: 300000,
    paraphrase_enabled: false,
    paraphrase_api_key: '',
    paraphrase_model: 'gpt-3.5-turbo',
    global_dedup: false,
    auto_reply_enabled: false,
    auto_reply_message: '',
    auto_reply_delay_ms: 3000,
    active_sequence_id: null,
    friend_request_mode: false,
    friend_request_dm_delay_ms: 90000,
    token_warming_enabled: false,
    token_warming_schedule: [5, 10, 20, 35, 50, 75, 100],
    token_tier_enabled: false,
    campaign_min_score: 0,
    error_spike_enabled: false,
    error_spike_threshold: 50,
    error_spike_window: 20,
    failed_requeue_enabled: false,
    failed_requeue_delay_ms: 60000,
    ui_theme: 'dark',
    scraper_presets: [],
    campaign_templates: [],
    distributed_mode: 'none',
    node_secret: '',
};

function loadUserConfig(userId) {
    const fp = userFile(userId, 'config.json');
    if (!fs.existsSync(fp)) {
        const defaults = { ...CONFIG_DEFAULTS };
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
        // Fill in any missing keys added after the config was first created
        let changed = false;
        for (const [key, val] of Object.entries(CONFIG_DEFAULTS)) {
            if (cfg[key] === undefined) {
                cfg[key] = val;
                changed = true;
            }
        }
        if (changed) fs.writeFileSync(fp, JSON.stringify(cfg, null, 2));
        return cfg;
    }
    catch { return { ...CONFIG_DEFAULTS }; }
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
