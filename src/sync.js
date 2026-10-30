// src/sync.js — Push local SQLite → Turso remote (Snapfeed backend → cloud)
// Runs on the local admin portal machine. One-directional: local → Turso.
// The PWA on Cloudflare reads from Turso via HTTPS.
import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';

const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH || './database.sqlite';

// Turso config — set these in .env:
// TURSO_URL=https://snapfeed-abc123.turso.io
// TURSO_AUTH_TOKEN=your-auth-token
const TURSO_URL = process.env.TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
    console.warn('[sync] TURSO_URL / TURSO_AUTH_TOKEN not set — sync will be a no-op.');
}

const localDb = new Database(LOCAL_DB_PATH, { readonly: true });

// Table schema mirrored to Turso (run once in Turso console):
// CREATE TABLE IF NOT EXISTS posts (
//   id INTEGER PRIMARY KEY,
//   title TEXT,
//   summary TEXT,
//   media_url TEXT,
//   media_type TEXT,
//   source_url TEXT UNIQUE,
//   source_name TEXT,
//   category TEXT,
//   likes INTEGER DEFAULT 0,
//   shares INTEGER DEFAULT 0,
//   saves INTEGER DEFAULT 0,
//   views INTEGER DEFAULT 0,
//   created_at TEXT,
//   indexed_at TEXT,
//   media_caption TEXT
// );
// CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);
// CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
// CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

function rowToObj(row) {
    return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        media_url: row.media_url,
        media_type: row.media_type,
        source_url: row.source_url,
        source_name: row.source_name,
        category: row.category,
        likes: row.likes,
        shares: row.shares,
        saves: row.saves,
        views: row.views,
        created_at: row.created_at,
        indexed_at: row.indexed_at,
        media_caption: row.media_caption,
    };
}

export async function syncToTurso() {
    if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
        console.log('[sync] Skipping — Turso credentials not configured.');
        return { synced: 0, skipped: true };
    }

    const client = createClient({
        url: TURSO_URL,
        authToken: TURSO_AUTH_TOKEN,
    });

    // Fetch all posts from local DB (ordered by indexed_at for incremental feel)
    const rows = localDb.prepare('SELECT * FROM posts ORDER BY indexed_at DESC').all();
    const posts = rows.map(rowToObj);

    console.log(`[sync] ${posts.length} posts in local DB, pushing to Turso...`);

    // Push in batches of 100 (Turso pipeline limits)
    const BATCH = 100;
    let synced = 0;
    let errors = 0;

    for (let i = 0; i < posts.length; i += BATCH) {
        const batch = posts.slice(i, i + BATCH);
        const statements = batch.map((p) =>
            `INSERT INTO posts (id, title, summary, media_url, media_type, source_url, source_name, category, likes, shares, saves, views, created_at, indexed_at, media_caption)
             VALUES (${p.id}, ${JSON.stringify(p.title)}, ${JSON.stringify(p.summary)}, ${JSON.stringify(p.media_url)}, ${JSON.stringify(p.media_type)}, ${JSON.stringify(p.source_url)}, ${JSON.stringify(p.source_name)}, ${JSON.stringify(p.category)}, ${p.likes}, ${p.shares}, ${p.saves}, ${p.views}, ${JSON.stringify(p.created_at)}, ${JSON.stringify(p.indexed_at)}, ${JSON.stringify(p.media_caption)})
             ON CONFLICT(source_url) DO UPDATE SET
               title=excluded.title, summary=excluded.summary, media_url=excluded.media_url,
               media_type=excluded.media_type, source_name=excluded.source_name,
               category=excluded.category, likes=excluded.likes, shares=excluded.shares,
               saves=excluded.saves, views=excluded.views, created_at=excluded.created_at,
               indexed_at=excluded.indexed_at, media_caption=excluded.media_caption;`
        ).join('\n');

        try {
            const result = await client.execute({ sql: statements });
            synced += batch.length;
            console.log(`[sync] batch ${Math.floor(i / BATCH) + 1}: ${batch.length} posts OK`);
        } catch (err) {
            errors += batch.length;
            console.error(`[sync] batch ${Math.floor(i / BATCH) + 1} failed:`, err.message);
        }
    }

    client.close();
    localDb.close();

    return { synced, errors, total: posts.length };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('sync.js')) {
    syncToTurso().then((result) => {
        console.log('[sync] Complete:', result);
        process.exit(result.errors > 0 ? 1 : 0);
    }).catch((err) => {
        console.error('[sync] Fatal:', err.message);
        process.exit(1);
    });
}
