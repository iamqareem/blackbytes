import 'dotenv/config';
import cron from 'node-cron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDb, initDb } from './db.js';
import { loadPlugins, fetchAllPlugins } from './pluginManager.js';
import { summarize } from './summarizer.js';

const db = getDb();

const OG_USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Blackbytes/1.0 (+https://gossip.ugaplex.com)';

// Fetch og:image (or first <img>) from an article page for posts missing media
let ogErrLogged = 0;
async function fetchOgImage(pageUrl) {
    try {
        const { data: html } = await axios.get(pageUrl, {
            headers: { 'User-Agent': OG_USER_AGENT },
            timeout: 10000,
            maxContentLength: 2 * 1024 * 1024,
        });
        const $ = cheerio.load(html);
        const og = $('meta[property="og:image"]').attr('content')
            || $('meta[name="twitter:image"]').attr('content')
            || $('link[rel="image_src"]').attr('href');
        if (og) return new URL(og, pageUrl).href;
        const img = $('article img').first().attr('src')
            || $('main img').first().attr('src')
            || $('img').first().attr('src');
        if (img && !img.startsWith('data:')) return new URL(img, pageUrl).href;
    } catch (err) {
        // Log first few failures for visibility, then every 20th
        if (ogErrLogged < 3 || ogErrLogged % 20 === 0) {
            console.log(`[og-image] failed for ${pageUrl.slice(0, 80)}:`, err.code || err.message);
        }
        ogErrLogged++;
    }
    return null;
}

// Backfill images for items without media_url (sequential, small delay)
async function backfillImages(items) {    const need = items.filter(it => !it.media_url && it.media_type !== 'shorts'
        && it.media_type !== 'embed' && it.source_url && /^https?:\/\//.test(it.source_url));
    if (need.length === 0) return 0;

    let found = 0;
    for (const item of need) {
        const img = await fetchOgImage(item.source_url);
        if (img) {
            item.media_url = img;
            item.media_type = 'image';
            found++;
        }
        await new Promise(r => setTimeout(r, 250));
    }
    console.log(`[og-image] backfilled ${found}/${need.length} images`);
    return found;
}

const insertPost = db.prepare(`
    INSERT INTO posts (title, summary, media_url, media_type, source_url, source_name, category, created_at, indexed_at, media_caption)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        media_url = excluded.media_url,
        media_type = excluded.media_type,
        indexed_at = excluded.indexed_at,
        media_caption = excluded.media_caption
`);

// Refresh content for live-updating posts (e.g. match scores) without resetting stats
const upsertPost = db.prepare(`
    INSERT INTO posts (title, summary, media_url, media_type, source_url, source_name, category, created_at, indexed_at, media_caption)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        media_url = excluded.media_url,
        media_type = excluded.media_type,
        indexed_at = excluded.indexed_at,
        media_caption = excluded.media_caption
`);

const updatePostEngagement = db.prepare(`
    UPDATE posts SET 
        engagement_score = views + (likes * 2) + (shares * 3) + (saves * 4),
        indexed_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);

const getConfig = db.prepare('SELECT value FROM site_config WHERE key = ?');

// RSS/XML often encodes query separators as &amp; — corrupts signed image URLs (e.g. i.guim.co.uk)
function decodeMediaUrl(url) {
    if (!url) return url;
    return url.replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

// Store every date as ISO-8601 UTC — the Python ranker parses with
// fromisoformat(), which chokes on RFC-2822 strings ("Fri, 02 Oct 2026 ... GMT")
function normalizeDate(value) {
    if (!value) return new Date().toISOString();
    // JS Date doesn't know RSS zone abbrevs like BST — map the common ones
    const s = String(value)
        .replace(/ BST$/, ' +0100')
        .replace(/ (GMT|UTC|Z)$/, ' +0000');
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function getCronSchedule() {
    const row = getConfig.get('scraper_cron');
    return row?.value || '*/30 * * * *';
}

async function runScraper() {
    console.log('[Scraper] Starting scrape cycle...');
    const startTime = Date.now();

    try {
        await loadPlugins();
        let items = await fetchAllPlugins();
        
        if (items.length === 0) {
            console.log('[Scraper] No items fetched');
            return { fetched: 0, saved: 0, duration: Date.now() - startTime };
        }

        console.log(`[Scraper] Fetched ${items.length} raw items, summarizing...`);
        // Global max posts per fetch cycle — keep feed fresh, prevent runaway growth
        const MAX_POSTS_PER_CYCLE = 40;
        if (items.length > MAX_POSTS_PER_CYCLE) {
            console.log(`[Scraper] Capping to ${MAX_POSTS_PER_CYCLE} newest items (was ${items.length})`);
            items = items.slice(0, MAX_POSTS_PER_CYCLE);
        }
        // Fill missing images from article pages (og:image)
        await backfillImages(items);
        // Video posts: title + video only, no word summary
        const VIDEO_TYPES = new Set(['shorts', 'embed', 'video']);
        // Spend AI calls only on genuinely new posts; reuse existing summaries on upserts
        const existingStmt = db.prepare('SELECT summary FROM posts WHERE source_url = ?');
        const summarized = [];
        let aiCount = 0;
        for (const [i, item] of items.entries()) {
            if (VIDEO_TYPES.has(item.media_type)) {
                summarized.push({ ...item, summary: '' });
                continue;
            }
            const row = existingStmt.get(item.source_url);
            if (row?.summary) {
                summarized.push({ ...item, summary: row.summary });
            } else {
                const { summary } = await summarize(item.content || item.title, item.title, true);
                summarized.push({ ...item, summary });
                aiCount++;
                console.log(`[Scraper] summarized ${i + 1}/${items.length} (${aiCount} AI calls) — ${item.source_name}: ${item.title.slice(0, 40)}`);
            }
        }
        console.log(`[Scraper] AI summaries generated: ${aiCount}/${items.length} (rest reused from DB)`);

        let saved = 0;
        for (const item of summarized) {
            const stmt = item.upsert ? upsertPost : insertPost;
const result = stmt.run(
                item.title,
                item.summary,
                decodeMediaUrl(item.media_url) || null,
                item.media_type || 'text',
                item.source_url,
                item.source_name,
                item.category,
                normalizeDate(item.published_at),
                new Date().toISOString(),
                item.mediaCaption
            );
            if (result.changes > 0) saved++;
        }

        const duration = Date.now() - startTime;
        console.log(`[Scraper] Completed: ${saved}/${items.length} new posts saved in ${duration}ms`);

        return { fetched: items.length, saved, duration };
    } catch (err) {
        console.error('[Scraper] Error:', err.message);
        throw err;
    }
}

// One-off maintenance: fill media_url for existing posts missing images
export async function backfillExistingImages({ limit = 200 } = {}) {
    const rows = db.prepare(`
        SELECT id, source_url FROM posts
        WHERE (media_url IS NULL OR media_url = '')
          AND source_url LIKE 'http%'
          AND media_type NOT IN ('shorts', 'embed')
        ORDER BY indexed_at DESC LIMIT ?
    `).all(limit);

    let found = 0;
    for (const row of rows) {
        const img = await fetchOgImage(row.source_url);
        if (img) {
            db.prepare("UPDATE posts SET media_url = ?, media_type = 'image' WHERE id = ?").run(decodeMediaUrl(img), row.id);
            found++;
        }
        await new Promise(r => setTimeout(r, 250));
    }
    console.log(`[backfill] ${found}/${rows.length} images restored`);
    return { checked: rows.length, found };
}

let scheduledTask = null;

export function startScheduler() {
    if (scheduledTask) {
        console.log('[Scraper] Scheduler already running');
        return;
    }

    const schedule = getCronSchedule();
    console.log(`[Scraper] Scheduling with cron: ${schedule}`);

    scheduledTask = cron.schedule(schedule, async () => {
        try {
            await runScraper();
        } catch (err) {
            console.error('[Scraper] Scheduled run failed:', err.message);
        }
    });

    scheduledTask.start();
    console.log('[Scraper] Scheduler started');
}

export function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        console.log('[Scraper] Scheduler stopped');
    }
}

export async function triggerScrape() {
    return await runScraper();
}

export { runScraper };

if (import.meta.url === `file://${process.argv[1]}`) {
    initDb();
    const mode = process.argv[2];
    const task = mode === '--backfill-images'
        ? backfillExistingImages({ limit: parseInt(process.argv[3]) || 200 })
        : runScraper();
    task
        .then(result => {
            console.log(mode === '--backfill-images' ? 'Backfill result:' : 'Manual scrape result:', result);
            process.exit(0);
        })
        .catch(err => {
            console.error('Failed:', err);
            process.exit(1);
        });
}