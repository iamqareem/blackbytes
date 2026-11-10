import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '..', 'database.sqlite');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -20000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456');

const schema = `
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT CHECK(media_type IN ('video', 'image', 'embed', 'text', 'shorts')) DEFAULT 'text',
    source_url TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN (
        'News', 'Sports', 'Geopolitics',
        'Tech', 'AI & Quantum', 'Web3',
        'IoT & Open Source', 'Education',
        'Entertainment', 'Culture'
    )),    engagement_score INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    post_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('view', 'like', 'share', 'save', 'reaction')),
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_preferences (
    session_id TEXT PRIMARY KEY,
    favorite_categories TEXT DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    payload TEXT,
    session_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Local-only raw feeds staging table.
-- Scraped feeds land here FIRST before Hermes summarization.
-- This table is NEVER synced to Turso.
CREATE TABLE IF NOT EXISTS raw_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT CHECK(media_type IN ('video', 'image', 'embed', 'text', 'shorts')) DEFAULT 'text',
    source_url TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN (
        'News', 'Sports', 'Geopolitics',
        'Tech', 'AI & Quantum', 'Web3',
        'IoT & Open Source', 'Education',
        'Entertainment', 'Culture'
    )),
    published_at TIMESTAMP,
    media_caption TEXT,
    status TEXT CHECK(status IN ('pending', 'summarized', 'failed', 'skipped')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);
CREATE INDEX IF NOT EXISTS idx_raw_posts_status ON raw_posts(status);
CREATE INDEX IF NOT EXISTS idx_raw_posts_source_url ON raw_posts(source_url);
CREATE INDEX IF NOT EXISTS idx_raw_posts_category ON raw_posts(category);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON user_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_post ON user_interactions(post_id);
CREATE INDEX IF NOT EXISTS idx_interactions_action ON user_interactions(action_type);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
`;

function initDb() {
    db.exec(schema);
    // Migration: add payload column to user_interactions if it doesn't exist
    try {
        db.exec(`ALTER TABLE user_interactions ADD COLUMN payload TEXT`);
        console.log('Migration: added payload column to user_interactions');
    } catch (err) {
        if (!err.message.includes('duplicate column')) {
            console.debug('Migration note:', err.message);
        }
    }
    // Migration: add media_caption column to posts if it doesn't exist
    try {
        db.exec(`ALTER TABLE posts ADD COLUMN media_caption TEXT`);
        console.log('Migration: added media_caption column to posts');
    } catch (err) {
        if (!err.message.includes('duplicate column')) {
            console.debug('Migration note (media_caption):', err.message);
        }
    }

    // Repair: restore user_interactions foreign key to point to `posts(id)` if it was rewritten to `posts_old`
    const interactionsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_interactions'").get()?.sql || '';
    if (interactionsSql.includes('posts_old')) {
        console.log('Repairing user_interactions foreign key (restoring reference to posts)...');
        db.exec(`
            PRAGMA foreign_keys = OFF;
            BEGIN;
            ALTER TABLE user_interactions RENAME TO user_interactions_repair;
            CREATE TABLE user_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                post_id INTEGER NOT NULL,
                action_type TEXT NOT NULL CHECK(action_type IN ('view', 'like', 'share', 'save', 'reaction')),
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            );
            INSERT INTO user_interactions (id, session_id, post_id, action_type, payload, created_at)
                SELECT id, session_id, post_id, action_type, payload, created_at FROM user_interactions_repair;
            DROP TABLE user_interactions_repair;
            CREATE INDEX IF NOT EXISTS idx_interactions_session ON user_interactions(session_id);
            CREATE INDEX IF NOT EXISTS idx_interactions_post ON user_interactions(post_id);
            CREATE INDEX IF NOT EXISTS idx_interactions_action ON user_interactions(action_type);
            COMMIT;
            PRAGMA foreign_keys = ON;
        `);
        console.log('user_interactions foreign key repaired successfully.');
    }
    // Migration v2: Expand the posts.category CHECK constraint to the new 10-category system.
    // SQLite can't ALTER constraints, so we recreate the table via the standard
    // "rename → create new → copy → drop old" technique.
    const hasNewCategories = (() => {
        try {
            const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get();
            return info?.sql?.includes("'AI & Quantum'");
        } catch { return false; }
    })();
    if (!hasNewCategories) {
        console.log('Migration: expanding posts.category constraint to 10 categories...');
        db.exec(`
            BEGIN;
            ALTER TABLE posts RENAME TO posts_old;
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                media_url TEXT,
                media_type TEXT CHECK(media_type IN ('video', 'image', 'embed', 'text', 'shorts')) DEFAULT 'text',
                source_url TEXT UNIQUE NOT NULL,
                source_name TEXT NOT NULL,
                category TEXT NOT NULL CHECK(category IN (
                    'News', 'Sports', 'Geopolitics',
                    'Tech', 'AI & Quantum', 'Web3',
                    'IoT & Open Source', 'Education',
                    'Entertainment', 'Culture'
                )),
                engagement_score INTEGER DEFAULT 0,
                views INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                saves INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                media_caption TEXT
            );
            -- Map old Memes -> Culture during copy
            INSERT INTO posts
                SELECT id, title, summary, media_url, media_type, source_url, source_name,
                    CASE category WHEN 'Memes' THEN 'Culture' ELSE category END,
                    engagement_score, views, likes, shares, saves, created_at, indexed_at, media_caption
                FROM posts_old;
            DROP TABLE posts_old;
            CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
            CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts(engagement_score DESC);
            CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);
            COMMIT;
        `);
        console.log('Migration: posts.category expanded to 10 categories (Memes -> Culture remapped).');
    }
    // Migration: rename legacy category values to new 10-category system
    const categoryMap = [
        ['Memes', 'Culture'],
    ];
    for (const [from, to] of categoryMap) {
        if (from !== to) {
            try {
                db.prepare(`UPDATE posts SET category = ? WHERE category = ?`).run(to, from);
            } catch {}
        }
    }
    console.log('Database schema initialized');
}

function seedDefaults() {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminHash) {
        console.warn('ADMIN_PASSWORD_HASH not set in .env - admin user not seeded');
        return;
    }

    const stmt = db.prepare('INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)');
    stmt.run(adminUser, adminHash);
    console.log(`Admin user "${adminUser}" seeded`);

    const defaults = [
        ['adsense_client_id', '', 'Google AdSense client ID (ca-pub-xxx)'],
        ['adsense_slot_feed', '', 'AdSense slot ID for in-feed ads'],
        ['adsense_slot_sidebar', '', 'AdSense slot ID for sidebar ads'],
        ['ga4_id', '', 'Google Analytics 4 Measurement ID (G-XXXXXXXXXX)'],
        ['site_name', 'Afro Aggregator', 'Site name for SEO/meta'],
        ['site_description', 'Curated Afrocentric memes, culture, tech & entertainment with AI summaries', 'Meta description'],
        ['scraper_cron', '*/30 * * * *', 'Cron schedule for scraper (default: every 30 min)'],
        ['scraper_user_agent', 'Snapfeed/1.0 (+https://gossip.ugaplex.com)', 'User agent for scraping'],
        ['posts_per_page', '20', 'Default pagination limit'],
        ['summary_max_words', '60', 'Max words for AI summaries'],
        ['enable_ads', 'false', 'Toggle ad injection in feed'],
        ['enable_analytics', 'true', 'Toggle analytics tracking'],
        ['monetag_zone_id', '', 'Monetag multitag zone id (site-wide overlay formats)'],
        ['monetag_tag_url', '', 'Full Monetag tag script src from dashboard (overrides built-in tag template)'],
        ['adsgram_blocks', '{}', 'JSON map category -> Adsgram blockId, e.g. {"default":"123","Memes":"456"} — Telegram in-feed rails'],
        ['adsgram_bot_id', '9263703483', 'Telegram bot ID for Adsgram platform reference'],
        ['ad_rail_interval', '6', 'Show a sponsored rail every N cards in the feed'],
        ['affiliate_aliexpress', 'false', 'Enable AliExpress affiliate link wrapping'],
        ['affiliate_aliexpress_tag', '', 'AliExpress affiliate tag'],
        ['google_review_url', '', 'Google Business Profile review link (g.page/r/.../review) shown by the PWA review button'],
        ['telegram_stars_invoice', '', 'Telegram Stars invoice link for the boost-with-Stars flow (createInvoiceLink, currency XTR) — optional'],
    ];

    const configStmt = db.prepare('INSERT OR IGNORE INTO site_config (key, value, description) VALUES (?, ?, ?)');
    for (const [key, value, desc] of defaults) {
        configStmt.run(key, value, desc);
    }
    console.log('Default site config seeded');
}

export function getDb() {
    return db;
}

export { initDb, seedDefaults };

if (import.meta.url === `file://${process.argv[1]}`) {
    initDb();
    seedDefaults();
    console.log('Database initialized and seeded');
}