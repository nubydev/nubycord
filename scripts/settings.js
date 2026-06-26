const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'server_settings.json');

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        const defaults = { webhookUrl: '', loginCounts: {} };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2));
        return defaults;
    }
    try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
    catch { return { webhookUrl: '', loginCounts: {} }; }
}

function saveSettings(data) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function getWebhookUrl() {
    return loadSettings().webhookUrl || '';
}

function setWebhookUrl(url) {
    const s = loadSettings();
    s.webhookUrl = url;
    saveSettings(s);
}

function incrementLoginCount(mutex) {
    const s = loadSettings();
    if (!s.loginCounts) s.loginCounts = {};
    s.loginCounts[mutex] = (s.loginCounts[mutex] || 0) + 1;
    saveSettings(s);
    return s.loginCounts[mutex];
}

function getLoginCount(mutex) {
    return loadSettings().loginCounts?.[mutex] || 0;
}

function getAppVersion() {
    return loadSettings().appVersion || 'v2.2.1';
}

function setAppVersion(version) {
    const s = loadSettings();
    s.appVersion = version;
    saveSettings(s);
}

module.exports = { getWebhookUrl, setWebhookUrl, incrementLoginCount, getLoginCount, getAppVersion, setAppVersion };
