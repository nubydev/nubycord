const crypto = require('crypto');
const fs = require('fs');
const UD = require('./userdata');

// Discord client build number — updated periodically to stay current
// Real Discord web client as of mid-2026 is in the ~350000-356000 range
const DISCORD_BUILD_BASE = 353000;
const DISCORD_BUILD_VARIANCE = 2000;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
];

const WEBGL_VENDORS = [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' },
];

const SCREEN_RESOLUTIONS = [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1680, height: 1050 },
    { width: 2560, height: 1600 },
    { width: 3840, height: 2160 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1200 },
];

const LANGUAGES = [
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['en-US', 'en', 'fr'],
    ['en-US', 'en', 'de'],
    ['en-US', 'en', 'es'],
    ['en-US', 'en', 'pt'],
];

const PLATFORMS = ['Win32', 'Win32', 'Win32', 'MacIntel', 'MacIntel', 'Linux x86_64'];

const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Stockholm',
    'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Australia/Sydney',
];

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateFingerprint() {
    const ua = randomPick(USER_AGENTS);
    const chromeVersionMatch = ua.match(/Chrome\/([\d.]+)/);
    const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : '124.0.0.0';
    const chromeMajor = parseInt(chromeVersion.split('.')[0]);
    const screen = randomPick(SCREEN_RESOLUTIONS);
    const webgl = randomPick(WEBGL_VENDORS);
    const languages = randomPick(LANGUAGES);
    const platform = ua.includes('Mac') ? 'MacIntel' : (ua.includes('Linux') ? 'Linux x86_64' : 'Win32');
    const timezone = randomPick(TIMEZONES);
    const seed = crypto.randomBytes(8).readBigUInt64BE().toString(16);

    return {
        userAgent: ua,
        chromeVersion,
        chromeMajor,
        screen,
        viewport: {
            width: screen.width - randomInt(0, 200),
            height: screen.height - randomInt(80, 180),
        },
        webgl,
        languages,
        platform,
        timezone,
        hardwareConcurrency: randomPick([2, 4, 4, 6, 8, 8, 12, 16]),
        deviceMemory: randomPick([2, 4, 4, 8, 8, 16]),
        maxTouchPoints: platform === 'Win32' ? randomPick([0, 0, 0, 10]) : 0,
        seed,
        noiseLevel: randomFloat(0.00001, 0.00005, 6),
    };
}

function buildEvasionScript(fp) {
    return `
(function() {
    'use strict';

    // ─── Webdriver removal ───────────────────────────────────────────────────
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
    });

    // ─── Chrome runtime injection ────────────────────────────────────────────
    if (!window.chrome) {
        window.chrome = {};
    }
    if (!window.chrome.runtime) {
        window.chrome.runtime = {
            PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
            PlatformArch: { ARM: 'arm', ARM64: 'arm64', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
            PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
            RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
            OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
            OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
            connect: function() {},
            sendMessage: function() {},
            id: undefined,
        };
    }
    if (!window.chrome.app) {
        window.chrome.app = {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
            getDetails: function() { return null; },
            getIsInstalled: function() { return false; },
            installState: function() { return 'not_installed'; },
        };
    }
    if (!window.chrome.csi) {
        window.chrome.csi = function() {
            return { onloadT: Date.now(), pageT: Date.now() - performance.now(), startE: Date.now() - 500, tran: 15 };
        };
    }
    if (!window.chrome.loadTimes) {
        window.chrome.loadTimes = function() {
            return {
                commitLoadTime: Date.now() / 1000 - Math.random(),
                connectionInfo: 'h2', finishDocumentLoadTime: Date.now() / 1000,
                finishLoadTime: Date.now() / 1000, firstPaintAfterLoadTime: 0,
                firstPaintTime: Date.now() / 1000 - 0.5, navigationType: 'Other',
                npnNegotiatedProtocol: 'h2', requestTime: Date.now() / 1000 - 1,
                startLoadTime: Date.now() / 1000 - 0.8, wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: true, wasNpnNegotiated: true,
            };
        };
    }

    // ─── Navigator overrides ─────────────────────────────────────────────────
    const navigatorOverrides = {
        platform:            { get: () => '${fp.platform}' },
        hardwareConcurrency: { get: () => ${fp.hardwareConcurrency} },
        deviceMemory:        { get: () => ${fp.deviceMemory} },
        maxTouchPoints:      { get: () => ${fp.maxTouchPoints} },
        languages:           { get: () => ${JSON.stringify(fp.languages)} },
        language:            { get: () => '${fp.languages[0]}' },
    };
    for (const [key, descriptor] of Object.entries(navigatorOverrides)) {
        try {
            Object.defineProperty(Navigator.prototype, key, { ...descriptor, configurable: true });
        } catch (_) {}
    }

    // ─── Plugins ─────────────────────────────────────────────────────────────
    const pluginData = [
        { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer',   description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client',      filename: 'internal-nacl-plugin',   description: '' },
    ];
    const PluginProto = Object.getPrototypeOf(navigator.plugins);
    Object.defineProperty(PluginProto, 'length', { get: () => pluginData.length, configurable: true });
    for (let i = 0; i < pluginData.length; i++) {
        try {
            const p = pluginData[i];
            const plugin = Object.create({ name: p.name, filename: p.filename, description: p.description, length: 1 });
            Object.defineProperty(navigator.plugins, i, { value: plugin, configurable: true });
        } catch (_) {}
    }

    // ─── Canvas fingerprint noise ────────────────────────────────────────────
    const NOISE = ${fp.noiseLevel};
    const SEED  = '${fp.seed}';

    function hashSeed(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(31, h) + str.charCodeAt(i) | 0;
        }
        return h;
    }

    const _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        const ctx = _origGetContext.apply(this, [type, ...args]);
        if (!ctx || (type !== '2d' && type !== 'webgl' && type !== 'webgl2')) return ctx;
        if (type === '2d') {
            const origGetImageData = ctx.getImageData.bind(ctx);
            ctx.getImageData = function(x, y, w, h) {
                const data = origGetImageData(x, y, w, h);
                const seedNum = hashSeed(SEED + x + y + w + h);
                for (let i = 0; i < data.data.length; i += 4) {
                    const jitter = ((seedNum ^ i) & 0x3) === 0 ? Math.round(NOISE * 100) : 0;
                    data.data[i]   = Math.min(255, Math.max(0, data.data[i]   + jitter));
                    data.data[i+1] = Math.min(255, Math.max(0, data.data[i+1] + jitter));
                    data.data[i+2] = Math.min(255, Math.max(0, data.data[i+2] + jitter));
                }
                return data;
            };
            const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(...args) {
                const ctx2 = this.getContext('2d');
                if (ctx2) {
                    const shift = hashSeed(SEED) & 0x1;
                    ctx2.globalAlpha = 1 - shift * 0.000001;
                }
                return origToDataURL.apply(this, args);
            };
        }
        return ctx;
    };

    // ─── WebGL fingerprint spoofing ───────────────────────────────────────────
    const WEBGL_VENDOR   = '${fp.webgl.vendor}';
    const WEBGL_RENDERER = '${fp.webgl.renderer}';

    function patchWebGL(proto) {
        const origGetParam = proto.getParameter;
        proto.getParameter = function(param) {
            if (param === 37445) return WEBGL_VENDOR;
            if (param === 37446) return WEBGL_RENDERER;
            if (param === 7936)  return 'WebKit';
            if (param === 7937)  return 'WebKit WebGL';
            if (param === 7938)  return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
            return origGetParam.call(this, param);
        };
        const origGetExt = proto.getExtension;
        proto.getExtension = function(name) {
            const ext = origGetExt.call(this, name);
            if (name === 'WEBGL_debug_renderer_info') {
                return {
                    UNMASKED_VENDOR_WEBGL: 37445,
                    UNMASKED_RENDERER_WEBGL: 37446,
                };
            }
            return ext;
        };
    }

    try { patchWebGL(WebGLRenderingContext.prototype); } catch (_) {}
    try { patchWebGL(WebGL2RenderingContext.prototype); } catch (_) {}

    // ─── AudioContext fingerprint noise ───────────────────────────────────────
    try {
        const origCreateAnalyser = AudioContext.prototype.createAnalyser;
        AudioContext.prototype.createAnalyser = function() {
            const analyser = origCreateAnalyser.call(this);
            const origGetFloat = analyser.getFloatFrequencyData.bind(analyser);
            analyser.getFloatFrequencyData = function(arr) {
                origGetFloat(arr);
                for (let i = 0; i < arr.length; i++) {
                    arr[i] += (Math.random() - 0.5) * 0.0001;
                }
            };
            return analyser;
        };
    } catch (_) {}

    // ─── Screen overrides ─────────────────────────────────────────────────────
    try {
        Object.defineProperty(screen, 'width',       { get: () => ${fp.screen.width},  configurable: true });
        Object.defineProperty(screen, 'height',      { get: () => ${fp.screen.height}, configurable: true });
        Object.defineProperty(screen, 'availWidth',  { get: () => ${fp.screen.width},  configurable: true });
        Object.defineProperty(screen, 'availHeight', { get: () => ${fp.screen.height} - 40, configurable: true });
        Object.defineProperty(screen, 'colorDepth',  { get: () => 24, configurable: true });
        Object.defineProperty(screen, 'pixelDepth',  { get: () => 24, configurable: true });
    } catch (_) {}

    // ─── Permission API ───────────────────────────────────────────────────────
    try {
        const origQuery = navigator.permissions.query;
        navigator.permissions.query = function(params) {
            if (params.name === 'notifications') {
                return Promise.resolve({ state: Notification.permission });
            }
            return origQuery.call(this, params);
        };
    } catch (_) {}

    // ─── WebRTC IP leak prevention ────────────────────────────────────────────
    try {
        const origRTCPeerConnection = window.RTCPeerConnection;
        window.RTCPeerConnection = function(config, ...args) {
            if (config && config.iceServers) config.iceServers = [];
            return new origRTCPeerConnection(config, ...args);
        };
        window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;
    } catch (_) {}

    // ─── Battery API spoofing ─────────────────────────────────────────────────
    try {
        navigator.getBattery = async function() {
            return {
                charging: true, chargingTime: 0, dischargingTime: Infinity,
                level: 0.85 + Math.random() * 0.15,
                addEventListener: () => {}, removeEventListener: () => {},
            };
        };
    } catch (_) {}

    // ─── Iframe contentWindow protection ─────────────────────────────────────
    try {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
            get: function() {
                const win = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get.call(this);
                if (win) {
                    try {
                        Object.defineProperty(win.navigator, 'webdriver', { get: () => undefined, configurable: true });
                    } catch (_) {}
                }
                return win;
            },
            configurable: true
        });
    } catch (_) {}

    // ─── toString/Function.prototype stealth ─────────────────────────────────
    const nativeToString = Function.prototype.toString;
    const proxied = new WeakSet();
    const proxyHandler = {
        apply(target, thisArg, args) {
            if (proxied.has(thisArg)) return 'function () { [native code] }';
            return nativeToString.apply(thisArg, args);
        }
    };
    Function.prototype.toString = new Proxy(nativeToString, proxyHandler);

})();
`;
}

function buildSuperPropertiesXHeader(fp) {
    const isWindows = fp.platform === 'Win32';
    const isMac     = fp.platform === 'MacIntel';
    const os        = isMac ? 'Mac OS X' : (fp.platform === 'Linux x86_64' ? 'Linux' : 'Windows');
    const osVersion = isMac ? '14.4.1' : (fp.platform === 'Linux x86_64' ? '' : '10');
    const obj = {
        os,
        browser: 'Chrome',
        device: '',
        system_locale: fp.languages[0],
        browser_user_agent: fp.userAgent,
        browser_version: fp.chromeVersion,
        os_version: osVersion,
        referrer: '',
        referring_domain: '',
        referring_domain_current: '',
        release_channel: 'stable',
        client_build_number: DISCORD_BUILD_BASE + Math.floor(Math.random() * DISCORD_BUILD_VARIANCE),
        client_event_source: null,
    };
    return Buffer.from(JSON.stringify(obj)).toString('base64');
}

// ─── Per-token fingerprint persistence ───────────────────────────────────────
// Each token gets a stable fingerprint profile stored to disk.
// This prevents detection via fingerprint inconsistency across sessions.

function loadTokenFingerprints(userId) {
    try {
        const fp = UD.userFile(userId, 'token_fingerprints.json');
        if (!fs.existsSync(fp)) return {};
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch { return {}; }
}

function saveTokenFingerprints(userId, data) {
    try {
        fs.writeFileSync(UD.userFile(userId, 'token_fingerprints.json'), JSON.stringify(data, null, 2));
    } catch {}
}

function getOrCreateTokenFingerprint(userId, tokenKey) {
    const store = loadTokenFingerprints(userId);
    if (store[tokenKey]) return store[tokenKey];
    const fp = generateFingerprint();
    store[tokenKey] = fp;
    saveTokenFingerprints(userId, store);
    return fp;
}

function clearTokenFingerprints(userId) {
    try {
        fs.writeFileSync(UD.userFile(userId, 'token_fingerprints.json'), '{}');
    } catch {}
}

module.exports = {
    generateFingerprint,
    buildEvasionScript,
    buildSuperPropertiesXHeader,
    getOrCreateTokenFingerprint,
    clearTokenFingerprints,
    DISCORD_BUILD_BASE,
    randomPick,
    randomInt,
};
