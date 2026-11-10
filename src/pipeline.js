// src/pipeline.js — Unified 3-Step Content Pipeline:
//   Step 1: Scrape raw feeds from RSS/APIs into local SQLite `raw_posts` (no AI, fast, reliable)
//   Step 2: Summarize pending `raw_posts` via OpenRouter and upsert into `posts`
//   Step 3: Sync summarized `posts` to Turso remote cloud
//
// You can run the entire pipeline at once:
//   npm run pipeline
// Or run individual steps:
//   npm run scrape      (Step 1 only)
//   npm run summarize   (Step 2 only)
//   npm run sync        (Step 3 only)

import 'dotenv/config';
import { runScraper } from './scraper.js';
import { runSummarizer } from './summarizer.js';
import { syncToTurso } from './sync.js';
import { initDb } from './db.js';

export async function runFullPipeline() {
    console.log('====================================================');
    console.log('🚀 Starting Snapfeed 3-Step Pipeline');
    console.log('====================================================');
    const totalStart = Date.now();

    initDb();

    // ── Step 1: Scrape ────────────────────────────────────────────────────────
    console.log('\n📥 STEP 1/3: Scraping feeds into local raw_posts staging...');
    const scrapeResult = await runScraper();
    console.log(`✓ Step 1 complete: ${scrapeResult.staged} items staged.`);

    // ── Step 2: Summarize ─────────────────────────────────────────────────────
    console.log('\n🧠 STEP 2/3: Summarizing pending raw posts via OpenRouter (backend: ' + (process.env.SUMMARIZER_BACKEND || 'openrouter') + ')...');
    const summarizeResult = await runSummarizer({ limit: 80 });
    console.log(`✓ Step 2 complete: ${summarizeResult.processed} items summarized into posts.`);

    // ── Step 3: Sync ──────────────────────────────────────────────────────────
    console.log('\n☁️  STEP 3/3: Syncing finalized posts to Turso cloud...');
    const syncResult = await syncToTurso();
    console.log(`✓ Step 3 complete: ${syncResult.synced || 0} items synced.`);

    const totalDuration = ((Date.now() - totalStart) / 1000).toFixed(1);
    console.log('\n====================================================');
    console.log(`🎉 Pipeline finished in ${totalDuration}s`);
    console.log('====================================================');

    return { scrapeResult, summarizeResult, syncResult, durationSeconds: totalDuration };
}

if (process.argv[1] && process.argv[1].endsWith('pipeline.js')) {
    runFullPipeline()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('\n❌ Pipeline failed:', err.message);
            process.exit(1);
        });
}
