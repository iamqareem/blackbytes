-- ============================================================================
-- Snapfeed — Turso Remote Schema
-- Paste this into the Turso web dashboard SQL editor and run it once.
-- ============================================================================

-- Posts table — mirrors the local SQLite schema exactly so sync is 1:1
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text',
    source_url TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'News',
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    media_caption TEXT
);

-- Indexes the PWA ranking engine depends on
CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_media_type ON posts(media_type);

-- User preferences (category favorites) — synced from local DB if you run the admin portal
CREATE TABLE IF NOT EXISTS user_preferences (
    session_id TEXT PRIMARY KEY,
    favorite_categories TEXT DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interaction counts (likes/shares/saves/views) — local-first, synced periodically
CREATE TABLE IF NOT EXISTS user_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    post_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('like','save','share','view','reaction')),
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interactions_session ON user_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_post ON user_interactions(post_id);

-- Site config (admin-editable toggles, ad slots, etc.)
CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default config
INSERT OR IGNORE INTO site_config (key, value) VALUES
    ('enable_ads', 'false'),
    ('adsense_client_id', ''),
    ('adsense_slot_feed', ''),
    ('monetag_zone_id', ''),
    ('telegram_mini_app', 'false'),
    ('affiliate_aliexpress', 'false');

-- ============================================================================
-- End of schema
-- ============================================================================
