// src/sync.js — Push local SQLite → Turso remote (Snapfeed backend → cloud)
// Runs on the local admin portal machine. One-directional: local → Turso.
// The PWA on Cloudflare reads from Turso via HTTPS.
import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';

// Turso config — set these in .env:
// TURSO_URL=libsql://snapfeed-mwanja.aws-ap-south-1.turso.io
// TURSO_AUTH_TOKEN=your-auth-token
const TURSO_URL = process.env.TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

export async function syncToTurso() {
    if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
        console.log('[sync] Skipping — Turso credentials not configured.');
        return { synced: 0, skipped: true };
    }

    const client = createClient({
        url: TURSO_URL,
        authToken: TURSO_AUTH_TOKEN,
    });

    // Open local DB fresh for each call
    const localDb = new Database(process.env.LOCAL_DB_PATH || './database.sqlite', { readonly: true });

    try {
        const rows = localDb.prepare('SELECT * FROM posts ORDER BY indexed_at DESC').all();
        const posts = rows.map(r => ({
            id: r.id, title: r.title, summary: r.summary, media_url: r.media_url,
            media_type: r.media_type, source_url: r.source_url, source_name: r.source_name,
            category: r.category, likes: r.likes, shares: r.shares, saves: r.saves,
            views: r.views, created_at: r.created_at, indexed_at: r.indexed_at,
            media_caption: r.media_caption,
        }));

        console.log(`[sync] ${posts.length} posts in local DB, pushing to Turso...`);

        const INSERT_SQL = `
            INSERT INTO posts (id, title, summary, media_url, media_type, source_url, source_name, category, likes, shares, saves, views, created_at, indexed_at, media_caption)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_url) DO UPDATE SET
              title=excluded.title, summary=excluded.summary, media_url=excluded.media_url,
              media_type=excluded.media_type, source_name=excluded.source_name,
              category=excluded.category, likes=excluded.likes, shares=excluded.shares,
              saves=excluded.saves, views=excluded.views, created_at=excluded.created_at,
              indexed_at=excluded.indexed_at, media_caption=excluded.media_caption
        `;

        let synced = 0;
        let errors = 0;

        for (const p of posts) {
            try {
                await client.execute({
                    sql: INSERT_SQL,
                    args: [
                        p.id, p.title, p.summary, p.media_url, p.media_type, p.source_url,
                        p.source_name, p.category, p.likes, p.shares, p.saves, p.views,
                        p.created_at, p.indexed_at, p.media_caption,
                    ],
                });
                synced++;
            } catch (err) {
                errors++;
                if (errors <= 5) {
                    console.error(`[sync] post ${p.id} failed:`, err.message);
                }
            }
        }

        console.log(`[sync] Complete: ${synced} synced, ${errors} errors`);
        return { synced, errors, total: posts.length };
    } finally {
        localDb.close();
        client.close();
    }
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
