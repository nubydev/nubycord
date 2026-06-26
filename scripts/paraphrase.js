const axios = require('axios');

// Per-session variant cache: cacheKey -> string[]
// Cleared at the start of each campaign run
const _variantCache = new Map();

function clearCache() {
    _variantCache.clear();
}

async function paraphrase(message, config) {
    if (!config || !config.paraphrase_enabled) return message;
    if (!config.paraphrase_api_key || !config.paraphrase_api_key.trim()) return message;
    if (!message || !message.trim()) return message;

    // Use a cache key based on first 200 chars of the message
    const cacheKey = message.trim().slice(0, 200);

    // Return a cached variant if we already have some for this message
    if (_variantCache.has(cacheKey)) {
        const variants = _variantCache.get(cacheKey);
        if (variants.length > 0) {
            return variants[Math.floor(Math.random() * variants.length)];
        }
    }

    const baseUrl = (config.paraphrase_base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model   = config.paraphrase_model || 'gpt-4o-mini';
    const apiKey  = config.paraphrase_api_key.trim();

    try {
        const resp = await axios.post(
            `${baseUrl}/chat/completions`,
            {
                model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a message rewriter. Rephrase the given message naturally while preserving its exact meaning, intent, and tone. Vary sentence structure and word choice. Return ONLY the rephrased message — no quotes, labels, or extra text.',
                    },
                    {
                        role: 'user',
                        content: message,
                    },
                ],
                temperature: 0.9,
                max_tokens: Math.min(600, Math.max(80, message.length * 3)),
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 12000,
            }
        );

        const result = resp.data?.choices?.[0]?.message?.content?.trim();
        if (!result || result.length < 5) return message;

        if (!_variantCache.has(cacheKey)) _variantCache.set(cacheKey, []);
        const variants = _variantCache.get(cacheKey);
        if (variants.length < 8) variants.push(result);

        return result;
    } catch {
        return message;
    }
}

function getCacheStats() {
    return { keys: _variantCache.size, totalVariants: [..._variantCache.values()].reduce((s, v) => s + v.length, 0) };
}

module.exports = { paraphrase, clearCache, getCacheStats };
