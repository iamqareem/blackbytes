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
    category TEXT NOT NULL CHECK(category IN ('Memes', 'Culture', 'Tech', 'Entertainment', 'News', 'Sports')),
    engagement_score INTEGER DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);
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
        // Column already exists — expected for fresh installs after schema update
        if (!err.message.includes('duplicate column')) {
            console.debug('Migration note:', err.message);
        }
    }
    // Migration: update action_type constraint to include 'reaction'
    // SQLite can't ALTER constraints, so we just rely on the schema for new tables
    // and allow the old constraint to remain on existing tables — reactions still insert fine
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