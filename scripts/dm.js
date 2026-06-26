if (require.main === module) {
    console.error('\x1b[31m[ERROR]\x1b[0m dm.js is a legacy CLI script and should not be run directly.');
    console.error('\x1b[33m[INFO]\x1b[0m  Use the web dashboard (node app.js) to run campaigns.');
    process.exit(1);
}

const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = require('../config');
const ProxyManager = require('./proxy');
const CaptchaSolver = require('./captcha');

function extractToken(raw) {
    const trimmed = raw.trim();
    const parts = trimmed.split(':');
    if (parts.length >= 3) return parts.slice(2).join(':');
    return trimmed;
}

let dm_delay_min = config.dm_delay_min;
let dm_delay_max = config.dm_delay_max;
let dm_message = config.dm_messages;
let login_delay_min = config.login_delay_min;
let login_delay_max = config.login_delay_max;

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

console.log(chalk.cyanBright('='.repeat(60)));
console.log(chalk.greenBright('Nubycord v3.3'));
console.log(chalk.cyanBright('Features: Opcode 14 Scraper, Captcha Solving, Proxy Support'));
console.log(chalk.cyanBright('='.repeat(60)));

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function dataFile(filename) {
    return path.join(DATA_DIR, filename);
}

function loadFile(filename) {
    const fp = dataFile(filename);
    try {
        if (!fs.existsSync(fp)) {
            fs.writeFileSync(fp, '');
            return [];
        }
        return fs.readFileSync(fp, 'utf8').replace(/\r/g, '').split('\n').filter(x => x);
    } catch (e) {
        return [];
    }
}

function saveFile(filename, content) {
    try {
        fs.writeFileSync(dataFile(filename), content);
    } catch (e) {
        console.error(`Error saving ${filename}:`, e);
    }
}

// Initialize variables
let tokens = loadFile('tokens.txt');
let serverId = loadFile('serverId.txt')[0] || '';

// Filter out already-blocked members before starting
const blockedSet = new Set(loadFile('blocked_members.txt'));
let sharedPool = loadFile('members.txt').filter(m => !blockedSet.has(m));

const skippedCount = loadFile('members.txt').length - sharedPool.length;
if (skippedCount > 0) {
    console.log(chalk.yellowBright(`[INFO] Skipped ${skippedCount} blocked member(s) from previous campaigns — ${sharedPool.length} remaining`));
}

// Initialize proxy manager if enabled
let proxyManager = null;
if (config.proxy.enabled && config.proxy.proxies.length > 0) {
    proxyManager = new ProxyManager();
    proxyManager.addProxies(config.proxy.proxies);
    console.log(chalk.yellowBright(`[INFO] Proxy mode enabled with ${config.proxy.proxies.length} proxies`));
}

// Initialize captcha solver if enabled
let captchaSolver = null;
if (config.captcha.enabled && config.captcha.apiKey) {
    captchaSolver = new CaptchaSolver(config.captcha.apiKey, config.captcha.service);
    console.log(chalk.yellowBright(`[INFO] Captcha solving enabled (${config.captcha.service})`));
}

console.log(chalk.whiteBright(`Loaded ${tokens.length} tokens and ${sharedPool.length} target members\n`));

let i = 0;
tokens.forEach(token => {
    setTimeout(async () => {
        await login(token, serverId);
    }, randomInt(login_delay_min, login_delay_max) * (++i));
});

async function login(token, serverId) {
    const clientConfig = {
        checkUpdate: false
    };

    if (captchaSolver) {
        clientConfig.captchaSolver = async (captchaInfo) => {
            try {
                const sitekey = captchaInfo.sitekey || captchaInfo.captcha_sitekey;
                const pageUrl = captchaInfo.pageUrl || 'https://discord.com';
                const rqdata  = captchaInfo.captcha_rqdata || null;
                console.log(chalk.yellowBright(`[CAPTCHA] Solving via ${config.captcha.service || 'anticaptcha'} — sitekey: ${sitekey}`));
                const solution = await captchaSolver.solveDiscordCaptcha(sitekey, pageUrl, rqdata);
                console.log(chalk.greenBright(`[CAPTCHA] Solved successfully`));
                return solution;
            } catch (error) {
                console.log(chalk.redBright(`[CAPTCHA ERROR] ${error.message}`));
                return null;
            }
        };
    }

    const client = new Client(clientConfig);
    let messageCount = 0;

    client.on('ready', async () => {
        console.log(`${chalk.magentaBright('[LOGIN]')} ${chalk.cyan(client.user.tag)}: ${chalk.greenBright('Connected')}`);

        const dmInterval = setInterval(async () => {
            // Stop if the shared pool is exhausted
            if (sharedPool.length === 0) {
                clearInterval(dmInterval);
                client.destroy();
                console.log(`${chalk.magentaBright('[INFO]')} ${chalk.cyan(client.user.tag)}: ${chalk.greenBright(`All members messaged, disconnecting... (sent ${messageCount} DM(s))`)}`);
                return;
            }

            // Claim a random member immediately so no other token can pick the same person
            const randomIndex = Math.floor(Math.random() * sharedPool.length);
            const memberId = sharedPool.splice(randomIndex, 1)[0];

            saveFile('members.txt', sharedPool.join('\n'));

            try {
                let user = await client.users.fetch(memberId);
                let randomMessage = dm_message[Math.floor(Math.random() * dm_message.length)];

                console.log(`${chalk.magentaBright('[DM]')} ${chalk.cyan(client.user.tag)}: ${chalk.whiteBright(`Opening DM with ${user.tag}`)}`);

                await user.send(randomMessage);
                messageCount++;

                console.log(`${chalk.greenBright('[SUCCESS]')} ${chalk.cyan(client.user.tag)}: ${chalk.greenBright(`Message sent to ${user.tag} (${messageCount} total | ${sharedPool.length} remaining)`)}`);

            } catch (error) {
                const errMsg = (error.message || '').toLowerCase();
                const isCaptcha = errMsg.includes('captcha') || !!error.captcha;

                if (isCaptcha && !config.captcha.enabled) {
                    // Re-queue the member so another token can handle them
                    sharedPool.push(memberId);
                    saveFile('members.txt', sharedPool.join('\n'));

                    console.log(chalk.yellowBright(`[CAPTCHA] ${client.user.tag}: Captcha triggered — token suspended, member ${memberId} re-queued | Pool: ${sharedPool.length} remaining`));

                    clearInterval(dmInterval);
                    client.destroy();
                } else {
                    let reason = error.message || 'Unknown error';
                    let addToBlocked = false;

                    // Error 50007: Cannot send messages to this user (DMs disabled)
                    if (error.code === 50007 || errMsg.includes('cannot send messages to this user')) {
                        reason = 'DMs disabled — skipped and blocked permanently';
                        addToBlocked = true;
                    // Error 10013: Unknown User (deleted or invalid account)
                    } else if (error.code === 10013 || errMsg.includes('unknown user')) {
                        reason = 'Deleted or invalid account — skipped and blocked permanently';
                        addToBlocked = true;
                    } else if (errMsg.includes('unauthorized')) {
                        reason = 'Unauthorized — DMs disabled or account issue — blocked permanently';
                        addToBlocked = true;
                    } else if (errMsg.includes('rate limit') || errMsg.includes('429') || error.code === 429) {
                        reason = 'Rate limited — consider increasing DM delay in config';
                    }

                    if (addToBlocked) {
                        // Add to persistent blocked list so this member is never retried
                        const alreadyBlocked = loadFile('blocked_members.txt');
                        if (!alreadyBlocked.includes(memberId)) {
                            saveFile('blocked_members.txt', [...alreadyBlocked, memberId].join('\n'));
                        }
                        console.log(chalk.yellowBright(`[BLOCKED] ${client.user.tag} → ${memberId} — ${reason}`));
                    } else {
                        console.log(`${chalk.redBright('[ERROR]')} ${chalk.cyan(client.user.tag)}: ${chalk.whiteBright(`Failed to DM ${memberId} — ${reason}`)}`);
                    }
                }
            }
        }, randomInt(dm_delay_min, dm_delay_max));
    });

    client.on('error', (error) => {
        console.log(`${chalk.redBright('[CLIENT ERROR]')} ${chalk.cyan(token.substring(0, 20))}: ${error.message}`);
    });

    client.login(extractToken(token)).catch((error) => {
        const msg = error.toString();
        if (msg.includes('INVALID') && msg.includes('TOKEN')) {
            console.log(`${chalk.redBright('[ERROR]')} ${chalk.whiteBright(`Invalid Token: ${token.substring(0, 20)}... — removed from list`)}`);
            const allTokens = loadFile('tokens.txt').filter(t => t !== token).join('\n');
            saveFile('tokens.txt', allTokens);
        } else {
            console.log(`${chalk.redBright('[LOGIN ERROR]')} ${error.message}`);
        }
    });
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
