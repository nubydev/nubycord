const { Client } = require('discord.js-selfbot-v13');

function extractToken(raw) {
    const trimmed = raw.trim();
    const parts = trimmed.split(':');
    if (parts.length >= 3) return parts.slice(2).join(':');
    return trimmed;
}

module.exports = {
    scraperOpcode14: async (token, serverId, options = {}) => {
        return new Promise((resolve, reject) => {
            const client = new Client({ checkUpdate: false });
            const members = new Set();
            let settled = false;

            function finish(result) {
                if (settled) return;
                settled = true;
                client.destroy();
                resolve(result);
            }

            client.on('ready', async () => {
                try {
                    const guild = client.guilds.cache.get(serverId);
                    if (!guild) {
                        client.destroy();
                        return reject(new Error('Server not found. Make sure the token is in this server.'));
                    }

                    console.log(`[Opcode14] Connected — fetching members from: ${guild.name}`);

                    const fetchedMembers = await guild.members.fetch();
                    const now = Date.now();
                    const timePeriodMs = options.timePeriodMinutes
                        ? options.timePeriodMinutes * 60 * 1000
                        : Infinity;

                    fetchedMembers.forEach(member => {
                        if (member.user.bot) return;
                        if (options.filterAdmins && member.permissions.has('ADMINISTRATOR')) return;

                        if (options.timePeriodMinutes && member.lastMessageTimestamp) {
                            if (now - member.lastMessageTimestamp > timePeriodMs) return;
                        }

                        if (options.minAccountAge) {
                            const ageMinutes = (now - member.user.createdTimestamp) / (1000 * 60);
                            if (ageMinutes < options.minAccountAge) return;
                        }

                        members.add(member.id);
                    });

                    console.log(`[Opcode14] Done — ${members.size} members scraped`);
                    if (options.onProgress) {
                        options.onProgress({ phase: 'done', total: members.size });
                    }

                    finish(Array.from(members));
                } catch (err) {
                    console.error('[Opcode14] Error:', err.message);
                    if (!settled) {
                        settled = true;
                        client.destroy();
                        reject(err);
                    }
                }
            });

            client.login(extractToken(token)).catch(err => {
                console.error('[Opcode14] Login failed:', err.message);
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });

            // 3-minute timeout — returns whatever was collected so far
            setTimeout(() => {
                if (!settled) {
                    const partial = Array.from(members);
                    console.log(`[Opcode14] Timeout — returning ${partial.length} partial results`);
                    finish(partial);
                }
            }, 180000);
        });
    },

    scraperKeywords: async (token, serverId, keywords, options = {}) => {
        return new Promise((resolve, reject) => {
            const client = new Client({ checkUpdate: false });
            const members = new Set();
            let settled = false;

            function finish(result) {
                if (settled) return;
                settled = true;
                client.destroy();
                resolve(result);
            }

            const keywordArray = keywords.map(k => k.toLowerCase());
            const now = Date.now();
            const timePeriodMs = options.timePeriodMinutes
                ? options.timePeriodMinutes * 60 * 1000
                : Infinity;

            client.on('ready', async () => {
                try {
                    const guild = client.guilds.cache.get(serverId);
                    if (!guild) {
                        client.destroy();
                        return reject(new Error('Server not found. Make sure the token is in this server.'));
                    }

                    console.log(`[Keywords] Searching "${keywords.join(', ')}" in ${guild.name}`);

                    const channels = await guild.channels.fetch();
                    let channelsScanned = 0;

                    for (const channel of channels.values()) {
                        if (channel.type !== 'GUILD_TEXT') continue;
                        if (settled) break;

                        try {
                            let lastMessageId = null;
                            let hasMore = true;
                            let foundOldMessage = false;

                            while (hasMore && !foundOldMessage && !settled) {
                                const messages = await channel.messages.fetch({
                                    limit: 100,
                                    ...(lastMessageId ? { before: lastMessageId } : {})
                                });

                                if (messages.size === 0) { hasMore = false; break; }

                                for (const msg of messages.values()) {
                                    const age = now - msg.createdTimestamp;

                                    if (options.timePeriodMinutes && age > timePeriodMs) {
                                        foundOldMessage = true;
                                        break;
                                    }

                                    if (msg.author.bot) continue;
                                    if (options.filterAdmins && msg.member?.permissions.has('ADMINISTRATOR')) continue;

                                    const content = msg.content.toLowerCase();
                                    for (const kw of keywordArray) {
                                        if (content.includes(kw)) {
                                            members.add(msg.author.id);
                                            break;
                                        }
                                    }
                                }

                                if (!foundOldMessage && messages.size > 0) {
                                    lastMessageId = messages.last().id;
                                } else {
                                    hasMore = false;
                                }
                            }

                            channelsScanned++;
                            if (options.onProgress) {
                                options.onProgress({ phase: 'scanning', channelsScanned, found: members.size });
                            }
                        } catch {
                            console.log(`[Keywords] Skipping channel ${channel.name} (no read access)`);
                        }
                    }

                    console.log(`[Keywords] Done — ${members.size} members found across ${channelsScanned} channels`);
                    finish(Array.from(members));
                } catch (err) {
                    console.error('[Keywords] Error:', err.message);
                    if (!settled) {
                        settled = true;
                        client.destroy();
                        reject(err);
                    }
                }
            });

            client.login(extractToken(token)).catch(err => {
                console.error('[Keywords] Login failed:', err.message);
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });

            // 5-minute timeout for keyword scraper (it reads many messages)
            setTimeout(() => {
                if (!settled) {
                    const partial = Array.from(members);
                    console.log(`[Keywords] Timeout — returning ${partial.length} partial results`);
                    finish(partial);
                }
            }, 300000);
        });
    },

    scraperReaction: async (token, serverId, channelId, messageId, emoji, options = {}) => {
        const TIMEOUT_MS = 3 * 60 * 1000; // 3-minute hard cap, same as other scrapers
        const client = new Client({ checkUpdate: false });
        let timeoutHandle;

        const cleanup = () => {
            clearTimeout(timeoutHandle);
            try { client.destroy(); } catch (_) {}
        };

        try {
            const result = await Promise.race([
                // Main work
                (async () => {
                    await client.login(extractToken(token));

                    const channel = await client.channels.fetch(channelId);
                    if (!channel) throw new Error('Channel not found');

                    const message = await channel.messages.fetch(messageId);
                    if (!message) throw new Error('Message not found');

                    // Try both raw emoji string and encoded form
                    let reaction = message.reactions.cache.get(emoji);
                    if (!reaction) {
                        reaction = message.reactions.cache.find(r =>
                            r.emoji.name === emoji ||
                            r.emoji.toString() === emoji ||
                            r.emoji.id === emoji
                        );
                    }

                    if (!reaction) {
                        console.log(`[Reaction] Available reactions: ${[...message.reactions.cache.keys()].join(', ')}`);
                        return [];
                    }

                    const users = await reaction.users.fetch();
                    const ids = users.filter(u => !u.bot).map(u => u.id);
                    console.log(`[Reaction] ${ids.length} non-bot reactors found`);
                    return ids;
                })(),
                // Timeout sentinel
                new Promise((_, reject) => {
                    timeoutHandle = setTimeout(() => reject(new Error('Reaction scraper timed out after 3 minutes')), TIMEOUT_MS);
                })
            ]);
            return result;
        } catch (err) {
            console.error('[Reaction] Error:', err.message);
            return [];
        } finally {
            cleanup();
        }
    },

    scraperOpcode8: async (token, idStart, idEnd, options = {}) => {
        const client = new Client({ checkUpdate: false });
        const members = new Set();
        const onProgress = options.onProgress || (() => {});

        const BATCH_SIZE = 50;
        const DELAY_MS   = 1200;
        const MAX_MEMBERS = options.maxMembers || 5000;

        const range = idEnd - idStart;
        const totalSamples = Math.min(Number(range), MAX_MEMBERS * 10);
        const step = range / BigInt(totalSamples);

        try {
            await client.login(extractToken(token));

            let checked = 0;
            let current = idStart;

            while (current <= idEnd && members.size < MAX_MEMBERS) {
                const batch = [];
                for (let i = 0; i < BATCH_SIZE && current <= idEnd && members.size + batch.length < MAX_MEMBERS; i++) {
                    batch.push(current.toString());
                    current += step > 0n ? step : 1n;
                }

                await Promise.all(batch.map(async (id) => {
                    try {
                        const user = await client.users.fetch(id, { force: true });
                        if (user && !user.bot) members.add(user.id);
                    } catch (_) {}
                }));

                checked += batch.length;
                onProgress({ checked, found: members.size, total: totalSamples });
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        } catch (err) {
            console.error('[Opcode8] Error:', err.message);
        } finally {
            client.destroy();
        }

        return Array.from(members);
    }
};
