import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUMMARIZER_HF_TOKEN = process.env.SUMMARIZER_HF_TOKEN;
const SUMMARIZER_MODEL = process.env.SUMMARIZER_MODEL || 'facebook/bart-large-cnn';
const MAX_WORDS = parseInt(process.env.SUMMARY_MAX_WORDS) || 60;
const MAX_CHARS = MAX_WORDS * 6;

let genAI = null;
let model = null;
let hfEnabled = false;
let hfFailedCount = 0;
let hfDisabled = false;

// ------- Initialise Gemini (kept for backward compat) -------
function initGemini() {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
        console.warn('GEMINI_API_KEY not configured - will use HF or fallback');
        return false;
    }
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        return true;
    } catch (err) {
        console.error('Failed to initialize Gemini:', err.message);
        return false;
    }
}

// ------- Initialise Hugging Face ----------
function initHf() {
    if (!SUMMARIZER_HF_TOKEN) {
        console.info('SUMMARIZER_HF_TOKEN not set - using truncation fallback');
        return;
    }
    // Token present — mark summarizer as HF-enabled
    hfEnabled = true;
    console.info(`Hugging Face summarizer enabled (model: ${SUMMARIZER_MODEL})`);
}

initGemini();
initHf();

// ------- Helper: truncate to max words -------
function truncateToWords(text, maxWords) {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}

// ------- Helper: clean text of URLs, handles, tags -------
function cleanText(text) {
    return text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ------- Retry helper with exponential backoff -------
async function fetchWithRetry(url, options, maxRetries = 2, delayMs = 500) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (err) {
            if (attempt === maxRetries) throw err;
            await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
        }
    }
}

/**
 * Summarize a social media post using Gemini, Hugging Face, or truncation.
 * 
 * @param {string} text - post content/text
 * @param {string} title - post title
 * @param {boolean} useHf - whether to attempt HF summarization
 * @returns {{summary: string, mediaCaption?: string}} - text summary + optional visual caption
 */
export async function summarize(text, title = '', useHf = true) {
    const cleaned = cleanText(text);

    // --- Try Hugging Face Inference API ---
    if (useHf && hfEnabled && !hfDisabled) {
        try {
            const response = await fetchWithRetry(
                `https://api-inference.huggingface.co/models/${SUMMARIZER_MODEL}`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${SUMMARIZER_HF_TOKEN}` },
                    body: JSON.stringify({ inputs: cleaned || title })
                },
                2, 500
            );
            if (!response.ok) {
                throw new Error(`HF API ${response.status}`);
            }
            const result = await response.json();
            // HF summarization models return { summary_text: "..." }
            let summary;
            if (Array.isArray(result)) {
                summary = result[0]?.summary_text || result[0] || '';
            } else {
                summary = result?.summary_text || result || '';
            }
            if (!summary || summary.length < 5) {
                throw new Error('empty summary');
            }
            // Trim to MAX_WORDS if needed
            const words = summary.trim().split(/\s+/);
            summary = words.length > MAX_WORDS ? words.slice(0, MAX_WORDS).join(' ') + '…' : summary;
            return { summary, mediaCaption: null };
        } catch (err) {
            hfFailedCount++;
            // Log first 3 failures, then every 10th
            if (hfFailedCount <= 3 || hfFailedCount % 10 === 0) {
                console.error(`Hugging Face summarization failed (${hfFailedCount}):`, err.message);
            }
            // Disable HF after 5 consecutive failures (likely unreachable)
            if (hfFailedCount >= 5) {
                hfDisabled = true;
                console.warn('Hugging Face summarizer disabled after 5 consecutive failures - using truncation fallback');
            }
            // fall through to truncation
        }
    }

    // --- Fallback: truncation (original behavior) ---
    if (!cleaned || cleaned.length < 50) {
        return { summary: truncateToWords(cleaned || title, MAX_WORDS), mediaCaption: null };
    }
    return { summary: truncateToWords(cleaned, MAX_WORDS), mediaCaption: null };
}

/**
 * Summarize a batch of items, attaching summaries.
 * 
 * @param {Array} items - each item: { title, content, media_url, media_type, source_url, source_name, category, published_at }
 * @param {boolean} useHf - whether to attempt HF summarization
 * @returns {Array} items enriched with { summary }
 */
export async function summarizeBatch(items, useHf = true) {
    const results = [];
    for (const item of items) {
        const { summary } = await summarize(item.content || item.title, item.title, useHf);
        results.push({ ...item, summary });
        await new Promise(r => setTimeout(r, 100));
    }
    return results;
}

// Export utilities
export { hfEnabled, MAX_WORDS };