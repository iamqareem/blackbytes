import 'dotenv/config';
import cron from 'node-cron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDb, initDb } from './db.js';
import { loadPlugins, fetchAllPlugins } from './pluginManager.js';

const db = getDb();

const OG_USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Snapfeed/1.0 (+https://gossip.ugaplex.com)';

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

const upsertRawPost = db.prepare(`
    INSERT INTO raw_posts (title, content, media_url, media_type, source_url, source_name, category, published_at, media_caption, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        media_url = excluded.media_url,
        media_type = excluded.media_type,
        source_name = excluded.source_name,
        category = excluded.category,
        published_at = excluded.published_at,
        media_caption = excluded.media_caption,
        updated_at = CURRENT_TIMESTAMP
`);

const checkExistingSummary = db.prepare("SELECT id FROM posts WHERE source_url = ? AND summary IS NOT NULL AND length(trim(summary)) > 0");

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
    console.log('[Scraper] Starting scrape cycle (Step 1: Ingest to raw_posts)...');
    const startTime = Date.now();

    try {
        await loadPlugins();
        let items = await fetchAllPlugins();
        
        if (items.length === 0) {
            console.log('[Scraper] No items fetched');
            return { fetched: 0, staged: 0, duration: Date.now() - startTime };
        }

        console.log(`[Scraper] Fetched ${items.length} raw items from plugins...`);
        // Global max posts per fetch cycle — 80 posts (8 per category × 10 categories)
        const MAX_POSTS_PER_CYCLE = 80;
        if (items.length > MAX_POSTS_PER_CYCLE) {
            console.log(`[Scraper] Capping to ${MAX_POSTS_PER_CYCLE} newest items (was ${items.length})`);
            items = items.slice(0, MAX_POSTS_PER_CYCLE);
        }

        // Fill missing images from article pages (og:image)
        await backfillImages(items);

        let staged = 0;
        for (const item of items) {
            // Check if post is already summarized in the main posts table
            const existing = checkExistingSummary.get(item.source_url);
            const status = existing ? 'summarized' : 'pending';

            const result = upsertRawPost.run(
                item.title,
                item.content || item.title,
                decodeMediaUrl(item.media_url) || null,
                item.media_type || 'text',
                item.source_url,
                item.source_name,
                item.category,
                normalizeDate(item.published_at),
                item.mediaCaption || null,
                status
            );
            if (result.changes > 0) staged++;
        }

        const duration = Date.now() - startTime;
        console.log(`[Scraper] Completed Step 1: ${staged}/${items.length} raw posts staged in raw_posts (${duration}ms)`);

        return { fetched: items.length, staged, duration };
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