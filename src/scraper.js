import cron from 'node-cron';
import { getDb, initDb } from './db.js';
import { loadPlugins, fetchAllPlugins } from './pluginManager.js';
import { summarizeBatch } from './summarizer.js';

const db = getDb();

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
        const summarized = await summarizeBatch(items);

        let saved = 0;
        for (const item of summarized) {
            const stmt = item.upsert ? upsertPost : insertPost;
const result = stmt.run(
                item.title,
                item.summary,
                item.media_url || null,
                item.media_type || 'text',
                item.source_url,
                item.source_name,
                item.category,
                item.published_at || new Date().toISOString(),
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
    runScraper()
        .then(result => {
            console.log('Manual scrape result:', result);
            process.exit(0);
        })
        .catch(err => {
            console.error('Manual scrape failed:', err);
            process.exit(1);
        });
}