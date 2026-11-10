// src/summarizer.js — Step 2: Summarize staged raw feeds and upsert into main posts
//
// Primary backend: OpenRouter chat-completions API (OPENROUTER_API_KEY in .env).
// Escape hatch:    SUMMARIZER_BACKEND=hermes falls back to the local Hermes CLI.
//
// Reads from local-only `raw_posts` (where status = 'pending')
// Failure policy: automatic retry once, then truncated excerpt + status='failed'
//                 (never retried, never re-billed for permanently bad items)
// Upserts into user-facing `posts` table (ready for Turso sync)

import 'dotenv/config';
import { spawn } from 'child_process';
import { getDb, initDb } from './db.js';

const db = getDb();

const BACKEND = (process.env.SUMMARIZER_BACKEND || 'openrouter').toLowerCase();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite';
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const HERMES_BIN = process.env.HERMES_PATH || '/home/qareem/.local/bin/hermes';
const MAX_WORDS = parseInt(process.env.SUMMARY_MAX_WORDS) || 50;
const TIMEOUT_MS = parseInt(process.env.SUMMARY_TIMEOUT_MS) || 25000;
const CONCURRENCY = Math.max(1, parseInt(process.env.SUMMARY_CONCURRENCY) || 4);

// Set when OpenRouter's free-tier DAILY cap is exhausted — subsequent calls
// in this cycle short-circuit immediately instead of hammering the API.
let dailyLimitHit = false;

// ---------------------------------------------------------------- fallbacks

// Truncate to word count fallback
function truncateToWords(text, maxWords = MAX_WORDS) {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildPrompt(title, content) {
    return (
        `You write concise 1-2 sentence summaries for an African news, culture, and tech feed.\n` +
        `Title: ${title}\n` +
        `Content: ${content}\n\n` +
        `Task: Summarize who, what, and where in 1 to 2 clear sentences (under ${MAX_WORDS} words). ` +
        `Output ONLY the summary. Do not include introductory phrases, hashtags, quotes, or markdown headers.`
    );
}

// Clean a model response: strip wrappers, labels, markdown
function cleanSummary(output) {
    if (!output) return '';
    return String(output)
        .replace(/^["'`]|["'`]$/g, '')
        .replace(/^(Summary|Here is a summary|Key Takeaway):\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------------------------------------------------------- OpenRouter call

/**
 * Summarize via OpenRouter chat-completions.
 * Returns { summary, ok, error } — on failure, summary is the truncated excerpt.
 * Retries once on 429/5xx/network errors with a short backoff.
 */
export async function summarizeWithOpenRouter(title = '', content = '') {
    const cleaned = cleanText(content || title);
    if (!cleaned || cleaned.length < 50) {
        return { summary: truncateToWords(cleaned || title, MAX_WORDS), ok: true };
    }

    if (dailyLimitHit) {
        return { summary: '', ok: false, dailyLimit: true, error: 'free-tier daily rate limit (cycle aborted earlier)' };
    }

    const endpoint = `${OPENROUTER_BASE_URL}/chat/completions`;
    const payload = {
        model: OPENROUTER_MODEL,
        // Free-tier models (Nemotron etc.) are often reasoning models; without
        // this they burn the entire token budget on hidden "thinking" and
        // return content: null with finish_reason: length.
        reasoning: { enabled: false },
        max_tokens: MAX_WORDS * 4,
        temperature: 0.4,
        messages: [
            { role: 'system', content: 'You are a concise summarizer for an African news, culture, and tech feed. Output only the summary text.' },
            { role: 'user', content: buildPrompt(title, cleaned) },
        ],
    };

    let attempt = 0;
    let lastError = '';
    while (attempt < 2) {
        attempt++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.SITE_URL || 'https://gossip.ugaplex.com',
                    'X-Title': 'Snapfeed Summarizer',
                },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                const output = data?.choices?.[0]?.message?.content;
                const summary = cleanSummary(truncateToWords(output, MAX_WORDS));
                if (summary) {
                    return { summary, ok: true };
                }
                lastError = 'empty model response';
            } else if (res.status === 429) {
                // Distinguish a free-tier DAILY cap from a per-minute burst:
                // a daily cap is unretryable and must abort the whole cycle
                // BEFORE other items get excerpt-fallback + 'failed' status.
                const body = await res.json().catch(() => ({}));
                const limitSource = body?.error?.metadata?.limit_source || '';
                if (limitSource.includes('daily')) {
                    dailyLimitHit = true;
                    console.error('[summarizer] OpenRouter FREE-TIER DAILY LIMIT exhausted (429, limit_source=' + limitSource + ').');
                    console.error('[summarizer] Aborting cycle — pending items stay pending, none marked failed.');
                    return { summary: truncateToWords(cleaned, MAX_WORDS), ok: false, dailyLimit: true, error: 'free-tier daily rate limit' };
                }
                lastError = 'HTTP 429 (burst rate limit)';
            } else {
                const retryable = res.status >= 500;
                lastError = `HTTP ${res.status}`;
                if (!retryable) break; // other 4xx → don't retry
            }
        } catch (err) {
            lastError = err.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : err.message;
            // network error / timeout → fall through to retry
        } finally {
            clearTimeout(timer);
        }

        if (attempt < 2) {
            await new Promise(r => setTimeout(r, 2500));
        }
    }

    console.warn(`[summarizer] OpenRouter failed (${lastError}), using excerpt fallback.`);
    return { summary: truncateToWords(cleaned, MAX_WORDS), ok: false, error: lastError };
}

// ---------------------------------------------------------- Hermes fallback

/**
 * Escape-hatch backend: summarize via the local Hermes CLI.
 * Passes the prompt via stdin using `--query-file -` to prevent shell-escaping errors.
 */
export async function summarizeWithHermes(title = '', content = '') {
    const cleaned = cleanText(content || title);
    if (!cleaned || cleaned.length < 50) {
        return { summary: truncateToWords(cleaned || title, MAX_WORDS), ok: true };
    }

    const prompt = `You write concise 1-2 sentence summaries for an African news, culture, and tech feed.\n` +
        `Title: ${title}\n` +
        `Content: ${cleaned}\n\n` +
        `Task: Summarize who, what, and where in 1 to 2 clear sentences (under ${MAX_WORDS} words). ` +
        `Output ONLY the summary. Do not include introductory phrases, hashtags, quotes, or markdown headers.`;

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
            killed = true;
            try { proc.kill('SIGKILL'); } catch {}
            console.warn('[summarizer] Hermes CLI timed out after 25s, falling back to excerpt.');
            resolve({ summary: truncateToWords(cleaned, MAX_WORDS), ok: true });
        }, TIMEOUT_MS);

        const proc = spawn(HERMES_BIN, [
            'chat',
            '--query-file', '-',
            '--oneshot',
            '-Q',
            '--source', 'tool',
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PATH: `${process.env.PATH}:/home/qareem/.local/bin` },
        });

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('error', (err) => {
            clearTimeout(timer);
            if (!killed) {
                console.warn(`[summarizer] Hermes execution failed (${err.message}), using fallback.`);
                resolve({ summary: truncateToWords(cleaned, MAX_WORDS), ok: true });
            }
        });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (killed) return;

            if (code === 0 && stdout.trim()) {
                resolve({ summary: truncateToWords(cleanSummary(stdout), MAX_WORDS), ok: true });
            } else {
                if (stderr && (stderr.includes('re-authenticate') || stderr.includes('No access token'))) {
                    console.warn('[summarizer] Hermes notice: authentication needed (run `hermes model` in terminal).');
                } else if (stderr) {
                    console.warn(`[summarizer] Hermes exited with code ${code}: ${stderr.slice(0, 150)}`);
                }
                resolve({ summary: truncateToWords(cleaned, MAX_WORDS), ok: true });
            }
        });

        // Write the prompt to stdin and close the stream
        try {
            proc.stdin.write(prompt);
            proc.stdin.end();
        } catch {
            clearTimeout(timer);
            resolve({ summary: truncateToWords(cleaned, MAX_WORDS), ok: true });
        }
    });
}

// Per-item dispatch so the two backends share one result shape
async function summarize(title, content) {
    if (BACKEND === 'hermes') {
        return summarizeWithHermes(title, content);
    }
    return summarizeWithOpenRouter(title, content);
}

// ---------------------------------------------------------------- DB layer

// Prepared statements for moving raw_posts -> posts
const getPendingRawPosts = db.prepare(`
    SELECT * FROM raw_posts
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT ?
`);

const markRawPostStatus = db.prepare(`
    UPDATE raw_posts
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);

const upsertPost = db.prepare(`
    INSERT INTO posts (title, summary, media_url, media_type, source_url, source_name, category, created_at, indexed_at, media_caption)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        media_url = excluded.media_url,
        media_type = excluded.media_type,
        source_name = excluded.source_name,
        category = excluded.category,
        indexed_at = excluded.indexed_at,
        media_caption = excluded.media_caption
`);

// ------------------------------------------------------------- concurrency

function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const idx = next++;
            results[idx] = await fn(items[idx], idx);
        }
    }
    return Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker)
    ).then(() => results);
}

// -------------------------------------------------------------- Step 2 run

/**
 * Step 2 Runner: Process pending raw posts through the summarizer and stage
 * into the main `posts` table.
 * Concurrency pool of 4; failure policy: excerpt + status='failed'.
 */
export async function runSummarizer({ limit = 80 } = {}) {
    console.log(`[Summarizer] Starting summarization cycle (Step 2: raw_posts -> posts, backend=${BACKEND}, model=${BACKEND === 'openrouter' ? OPENROUTER_MODEL : 'hermes-cli'})...`);
    const startTime = Date.now();
    dailyLimitHit = false; // reset per cycle

    if (BACKEND === 'openrouter' && !OPENROUTER_API_KEY) {
        console.error('[Summarizer] OPENROUTER_API_KEY is not set in .env — aborting cycle without consuming items.');
        console.error('[Summarizer] Set OPENROUTER_API_KEY=d... in .env (get a key at https://openrouter.ai/settings/keys), or set SUMMARIZER_BACKEND=hermes.');
        return { processed: 0, total: 0, skipped: 'missing_api_key', duration: Date.now() - startTime };
    }

    const pending = getPendingRawPosts.all(limit);
    if (pending.length === 0) {
        console.log('[Summarizer] No pending raw posts found to summarize.');
        return { processed: 0, total: 0, duration: Date.now() - startTime };
    }

    console.log(`[Summarizer] Found ${pending.length} pending raw posts to summarize (concurrency=${CONCURRENCY})...`);
    const VIDEO_TYPES = new Set(['shorts', 'embed', 'video']);

    const summarized = await mapWithConcurrency(pending, CONCURRENCY, async (item, idx) => {
        if (VIDEO_TYPES.has(item.media_type)) {
            // Video cards: title is self-explanatory, no long summary needed
            return { item, summary: item.title, ok: true };
        }

        const result = await summarize(item.title, item.content);
        console.log(
            `[Summarizer] [${idx + 1}/${pending.length}] ${item.source_name} — "${item.title.slice(0, 50)}" → ` +
            (result.ok ? 'ok' : `fallback (${result.error || 'unknown error'})`)
        );
        return { item, ...result };
    });

    let processed = 0;
    let deferred = 0;
    for (const { item, summary, ok, dailyLimit } of summarized) {
        // Daily rate-limit failures: leave as 'pending' so the NEXT cycle
        // picks them up — they were never actually attempted against the API.
        if (!ok && dailyLimit) {
            deferred++;
            continue;
        }

        // Upsert into main posts table (excerpt included even on failure so the feed isn't empty)
        upsertPost.run(
            item.title,
            summary,
            item.media_url || null,
            item.media_type || 'text',
            item.source_url,
            item.source_name,
            item.category,
            item.published_at || new Date().toISOString(),
            new Date().toISOString(),
            item.media_caption || null
        );

        // Mark summarized, or 'failed' so it's never retried/re-billed
        markRawPostStatus.run(ok ? 'summarized' : 'failed', item.id);
        processed++;
    }

    const failedCount = summarized.filter(r => !r.ok && !r.dailyLimit).length;
    const deferredExcerpt = summarized.filter(r => !r.ok && r.dailyLimit).length;
    const duration = Date.now() - startTime;
    if (deferredExcerpt > 0) {
        console.log(`[Summarizer] ${deferredExcerpt} item(s) deferred — daily free-tier limit was hit, they stay pending for the next cycle.`);
    }
    console.log(`[Summarizer] Completed Step 2: ${processed}/${pending.length} posts moved to main posts table (${failedCount} fallback excerpts, ${duration}ms).`);
    return { processed, total: pending.length, failed: failedCount, deferred: deferredExcerpt, duration };
}

// Standalone backward-compatibility export for any other caller
export async function summarizeText(text, title = '') {
    const result = await summarize(title, text);
    return { summary: result.summary, mediaCaption: null };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('summarizer.js')) {
    initDb();
    const limit = parseInt(process.argv[2]) || 80;
    runSummarizer({ limit })
        .then((res) => {
            console.log('[Summarizer] Finished:', res);
            process.exit(0);
        })
        .catch((err) => {
            console.error('[Summarizer] Fatal error:', err);
            process.exit(1);
        });
}
