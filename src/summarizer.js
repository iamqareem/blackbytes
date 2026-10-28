// Free AI summarization via Pollinations.ai (keyless, GPT-OSS 20B).
// Anonymous tier: ~1 reply / 30s per IP on the classic endpoint, burst-tolerant
// on POST /openai. We go sequential with small gaps, honour 402 backoff, and
// fall back to truncation when the budget runs out.

const API_URL = 'https://text.pollinations.ai/openai';
const MODEL = process.env.SUMMARIZER_MODEL || 'openai-fast';
const MAX_WORDS = parseInt(process.env.SUMMARY_MAX_WORDS) || 60;
const DAILY_CALL_LIMIT = parseInt(process.env.SUMMARY_DAILY_LIMIT) || 500;
const MIN_CONTENT_CHARS = 80; // skip AI for short meme titles — nothing to summarize
const CALL_GAP_MS = 1200;     // polite gap between sequential calls
const RATE_LIMIT_WAIT_MS = 30000; // pollinations asks to wait 30s on 402

let aiEnabled = true;
let callsToday = 0;
let consecutiveFailures = 0;
let disabled = false;
let lastCallAt = 0;

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}
let countDay = todayKey();

function refreshDailyCount() {
    const key = todayKey();
    if (key !== countDay) {
        countDay = key;
        callsToday = 0;
    }
}

console.info(`AI summarizer enabled (Pollinations, model: ${MODEL}, daily limit: ${DAILY_CALL_LIMIT})`);

// ------- Helpers -------
function truncateToWords(text, maxWords) {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}

function cleanText(text) {
    return text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function clampWords(text, maxWords) {
    const words = text.trim().split(/\s+/);
    return words.length > maxWords ? words.slice(0, maxWords).join(' ') + '…' : text;
}

function truncationFallback(cleaned, title) {
    return truncateToWords(cleaned || title, MAX_WORDS);
}

const SYSTEM_PROMPT =
    `You write short, descriptive summaries for an African media & meme feed. ` +
    `Given a post title and content, produce 1-2 sentences (max ${MAX_WORDS} words) that say WHO, WHAT and WHERE. ` +
    `Be specific and concrete — mention names, places and key facts. ` +
    `No hashtags, no emoji, no "this post says", no preamble, just the summary.`;

/**
 * Summarize a social media post with Pollinations, falling back to truncation.
 *
 * @param {string} text - post content/text
 * @param {string} title - post title
 * @param {boolean} useAi - whether to attempt AI summarization
 * @returns {Promise<{summary: string, mediaCaption: null}>}
 */
export async function summarize(text, title = '', useAi = true) {
    const cleaned = cleanText(text);

    if (!useAi || !aiEnabled || disabled) {
        return { summary: truncationFallback(cleaned, title), mediaCaption: null };
    }

    refreshDailyCount();
    if (callsToday >= DAILY_CALL_LIMIT) {
        return { summary: truncationFallback(cleaned, title), mediaCaption: null };
    }

    const input = cleaned.length >= MIN_CONTENT_CHARS
        ? `${title ? `Title: ${title}\n` : ''}Content: ${cleaned}`
        : null;
    if (!input) {
        // Too short to summarize — truncation is already the full text
        return { summary: truncationFallback(cleaned || title, title), mediaCaption: null };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
        refreshDailyCount();
        if (callsToday >= DAILY_CALL_LIMIT) break;

        try {
            // Respect sequential gap
            const sinceLast = Date.now() - lastCallAt;
            if (sinceLast < CALL_GAP_MS) {
                await new Promise(r => setTimeout(r, CALL_GAP_MS - sinceLast));
            }
            lastCallAt = Date.now();
            callsToday++;

            // 20s hard timeout — undici's default is 300s, which stalls the scrape silently
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(20000),
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: input },
                    ],
                    max_tokens: 200,
                    temperature: 0.3,
                }),
            });

            if (response.status === 402 && attempt === 0) {
                // Rate limited — pollinations asks for a 30s wait
                callsToday--; // don't count the rejected call
                console.log('[summarizer] rate limited (402), waiting 30s before retry...');
                await new Promise(r => setTimeout(r, RATE_LIMIT_WAIT_MS));
                continue;
            }
            if (!response.ok) {
                throw new Error(`Pollinations API ${response.status}`);
            }

            const result = await response.json();
            const summary = result?.choices?.[0]?.message?.content?.trim() || '';
            if (!summary || summary.length < 5) {
                throw new Error('empty summary');
            }

            consecutiveFailures = 0;
            return { summary: clampWords(summary, MAX_WORDS), mediaCaption: null };
        } catch (err) {
            consecutiveFailures++;
            // Log first few failures, then every 10th
            if (consecutiveFailures <= 3 || consecutiveFailures % 10 === 0) {
                console.error(`AI summarization failed (${consecutiveFailures}):`, err.message);
            }
            if (consecutiveFailures >= 8) {
                disabled = true;
                console.warn('AI summarizer disabled after 8 consecutive failures - using truncation fallback');
            }
            break; // don't retry non-402 errors
        }
    }

    return { summary: truncationFallback(cleaned, title), mediaCaption: null };
}

/**
 * Summarize a batch of items sequentially (respecting rate limits).
 *
 * @param {Array} items - items with { title, content, ... }
 * @param {boolean} useAi - whether to attempt AI summarization
 * @returns {Promise<Array>} items enriched with { summary }
 */
export async function summarizeBatch(items, useAi = true) {
    const results = [];
    for (const item of items) {
        const { summary } = await summarize(item.content || item.title, item.title, useAi);
        results.push({ ...item, summary });
    }
    refreshDailyCount();
    console.log(`[summarizer] AI calls today: ${callsToday}/${DAILY_CALL_LIMIT}`);
    return results;
}

export { aiEnabled as hfEnabled, MAX_WORDS };
