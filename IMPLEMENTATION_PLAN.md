# Implementation Plan: Afrocentric Media & Meme Aggregator

## Project Overview
Build a low-overhead, mobile-first content aggregator with ~60-word micro-summaries, hotlinked video embeds, and dynamic Python personalization. Optimized for Chromebook HP Blooguard (4GB RAM, Dual-Core CPU, 64GB SSD). Admin dashboard accessible from MacBook Pro 2017 via Caddy-secured admin hatch.

## Tech Stack Summary
- **Backend**: Node.js (Express), SQLite3 (better-sqlite3 with WAL)
- **Scraping**: axios, cheerio, rss-parser, node-cron
- **Summarization**: Google Generative AI (gemini-2.5-flash)
- **Ranking**: Python 3 (native sqlite3, heuristic scoring)
- **Frontend**: Vanilla JS + Tailwind CSS (build step, Instagram-inspired colors) + PWA
- **Admin Dashboard**: Separate admin panel with Caddy TLS/mTLS auth
- **Plugins**: Modular architecture in `src/plugins/`
- **SEO/AI Discovery**: sitemap.xml, robots.txt, llms.txt, JSON-LD, Open Graph

---

## Phase 0: Repository Initialization & Core Config
**Goal**: Git init, README, base configs, Tailwind build setup

### Tasks:
1. `git init` and configure user (GitHub CLI already authenticated)
2. Create `README.md` with project overview, tech stack, setup instructions
3. Create `package.json` with dependencies:
   - Runtime: `express`, `better-sqlite3`, `axios`, `cheerio`, `rss-parser`, `node-cron`, `cors`, `dotenv`, `@google/generative-ai`, `jsonwebtoken`, `bcryptjs`, `helmet`, `compression`
   - Dev: `tailwindcss`, `@tailwindcss/cli`, `postcss`, `autoprefixer`, `esbuild` (for JS bundling if needed)
4. Create `requirements.txt` (Python - native libraries only)
5. Create `.env.example` with:
   - `GEMINI_API_KEY`, `PORT=3000`, `ADMIN_PORT=3001`
   - `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`
   - `CADDY_ADMIN_DOMAIN` (e.g., admin.gossip.ugaplex.com)
   - `SITE_URL=https://gossip.ugaplex.com`
6. Create `tailwind.config.js` with Instagram-inspired color palette (light/dark):
   - Light: `#FFFFFF`, `#FAFAFA`, `#EFEFEF`, `#DBDBDB`, `#8E8E8E`, `#262626`, `#0095F6`, `#ED4956`, `#F56040`
   - Dark: `#121212`, `#1E1E1E`, `#2C2C2C`, `#3A3A3A`, `#8E8E8E`, `#FFFFFF`, `#0095F6`, `#ED4956`, `#F56040`
7. Create `postcss.config.js`, `src/input.css` with `@tailwind base/components/utilities`
8. Add npm scripts: `dev`, `build:css`, `build:js`, `start`, `admin:dev`
9. Create `.gitignore` (node_modules, .env, database.sqlite, dist, *.log)

### Deliverables:
- `package.json`, `requirements.txt`, `.env.example`, `README.md`
- `tailwind.config.js`, `postcss.config.js`, `src/input.css`
- `.gitignore`, npm scripts configured
- Git commit: `chore: initialize repo with build config and instagram-themed tailwind`

---

## Phase 1: Database Schema & Core Models
**Goal**: SQLite with WAL mode, extended schema for admin/ads/SEO

### Tasks:
1. Implement `src/db.js` - SQLite connection with WAL mode and schema:
   - `posts` table (id, title, summary, media_url, media_type, source_url UNIQUE, source_name, category, engagement_score, views, likes, shares, saves, created_at, indexed_at)
   - `user_interactions` table (id, session_id, post_id, action_type, created_at)
   - `user_preferences` table (session_id PK, favorite_categories JSON, updated_at)
   - `admin_users` table (id, username, password_hash, role, created_at, last_login)
   - `site_config` table (key, value, description) - for ads, SEO, feature flags
   - `analytics_events` table (id, event_name, payload JSON, session_id, created_at) - for Google Ads conversions
2. Indexes: category, created_at, source_url, session_id, engagement_score
3. Seed default admin user from env, default site config (adsense_client_id, ad_slots, ga4_id, etc.)

### Deliverables:
- `src/db.js` with extended schema
- Git commit: `feat: database schema with admin, analytics, and ads tables`

---

## Phase 2: Modular Plugin Architecture
**Goal**: Dynamic plugin system for social media scraping

### Tasks:
1. Implement `src/pluginManager.js` - dynamic loading of plugins from `src/plugins/`
2. Implement `src/plugins/tiktokPlugin.js` - TikTok oEmbed API for zero-block embeds
3. Implement `src/plugins/nitterPlugin.js` - Parse public Twitter handles via Nitter RSS mirrors
4. Implement `src/plugins/youtubePlugin.js` - Parse YouTube Shorts channel RSS feeds

### Plugin Interface:
```javascript
{
  name: 'plugin-name',
  category: 'Memes|Culture|Tech|Entertainment',
  fetch: async () => Array<{title, content, media_url, media_type, source_url, source_name}>
}
```

### Deliverables:
- `src/pluginManager.js`
- `src/plugins/tiktokPlugin.js`, `nitterPlugin.js`, `youtubePlugin.js`
- Git commit: `feat: add plugin manager and social scraper modules`

---

## Phase 3: Summarization Engine & Scraper Orchestrator
**Goal**: Compress content to ~60-word micro-summaries and orchestrate scraping

### Tasks:
1. Implement `src/summarizer.js` using `@google/generative-ai` (gemini-2.5-flash):
   - Compress text to punchy micro-summaries (<60 words / ~350 chars)
   - Text truncation fallback if API fails
   - Cache summaries to avoid re-processing
2. Implement `src/scraper.js` orchestrator:
   - Pull items through registered plugins
   - Summarize each item via summarizer
   - Save to SQLite (upsert by source_url)
   - Configurable cron schedule (default 30min via `node-cron`)
   - Manual trigger endpoint for admin
3. Add `npm run scrape` CLI command

### Deliverables:
- `src/summarizer.js`, `src/scraper.js`
- Git commit: `feat: add gemini summarizer and scraping orchestrator`

---

## Phase 4: Python Ranker & Express API (Public + Admin)
**Goal**: Personalized ranking engine and REST API endpoints

### Tasks:
1. Implement `python/ranking_engine.py`:
   - Input: `session_id`
   - Heuristic scoring:
     ```
     Final Score = (Category Affinity Weight × 5.0) + (Global Likes × 1.5) - (Age in Hours × 0.1)
     ```
   - Output: Sorted JSON of posts
2. Implement `src/server.js` (Express) - Public API:
   - `GET /api/feed?session_id=XYZ&cursor=ID&limit=20` - ranked feed (cursor pagination)
   - `POST /api/interact` - log telemetry (view, like, share, save)
   - `GET /api/preferences/:session_id` - get/update user preferences
   - `GET /feed.xml` - text-only RSS endpoint for desktop readers
   - `GET /sitemap.xml` - dynamic sitemap for SEO
   - `GET /robots.txt` - allow all, point to sitemap
   - `GET /llms.txt` - AI agent discovery file
   - `GET /api/share/:postId/whatsapp` - returns {image_url, deep_link, text} for WhatsApp share
3. Implement `src/adminServer.js` (Express) - Admin API (mounted on subdomain/path):
   - JWT auth with httpOnly secure cookies
   - `GET /admin/api/posts` - paginated, filterable, sortable
   - `POST /admin/api/posts` - manual add/edit
   - `DELETE /admin/api/posts/:id`
   - `POST /admin/api/scrape/trigger` - manual scrape
   - `GET /admin/api/analytics` - engagement stats
   - `GET /admin/api/config` / `PUT` - site config (ads, SEO, features)
   - `GET /admin/api/users` - session stats
4. Caddy config template (`Caddyfile.template`) for:
   - Main site: `gossip.ugaplex.com` → `:3000`
   - Admin: `admin.gossip.ugaplex.com` → `:3001` with mTLS/client cert auth
   - Automatic HTTPS via Let's Encrypt

### Deliverables:
- `python/ranking_engine.py`
- `src/server.js`, `src/adminServer.js`, `src/auth.js`
- `Caddyfile.template`
- Git commit: `feat: python ranker, public & admin APIs, caddy config`

---

## Phase 5: PWA Frontend (Public)
**Goal**: Mobile-first vertical swipe interface with Instagram-themed Tailwind

### Tasks:
1. Build `public/index.html` (entry point, loads built CSS/JS):
   - DevBytes/Pinterest-style vertical swipe layout
   - Built Tailwind CSS (not CDN) - `dist/styles.css`
   - Infinite scroll / swipe navigation (IntersectionObserver)
   - Video embed players (TikTok, YouTube, Twitter/X)
   - Session ID generation/storage (localStorage)
   - WhatsApp share button → calls `/api/share/:id/whatsapp` → opens `whatsapp://send?text=` with image preview
   - Cookie consent banner (GDPR/CCPA compliant) - stores consent in localStorage + cookie
   - Terms of Service link in footer
   - JSON-LD structured data (BlogPosting, ItemList)
   - Open Graph / Twitter Card meta tags per post
2. Create `public/manifest.json`:
   - PWA config, shortcuts for categories, icons
3. Create `public/sw.js` (Service Worker):
   - Cache-first for static assets
   - Stale-while-revalidate for API feeds
   - Offline fallback page
4. Build `src/client.js` → bundled to `dist/app.js` (esbuild)

### Deliverables:
- `public/index.html`, `public/manifest.json`, `public/sw.js`
- `src/client.js`, `src/input.css`
- Built assets in `dist/` (gitignored)
- Git commit: `feat: mobile-first PWA frontend with instagram theme`

---

## Phase 6: Admin Dashboard
**Goal**: Content management dashboard for MacBook Pro access via Caddy-secured admin hatch

### Tasks:
1. Build `admin/index.html` (separate entry, loaded on admin subdomain):
   - Tailwind build (shared config, separate entry `admin/input.css`)
   - JWT auth flow (login page → dashboard)
   - Sidebar navigation: Posts, Scraper, Analytics, Settings, Users
   - Posts table: sortable, filterable, inline edit, bulk actions
   - Scraper panel: trigger manual run, view logs, configure sources
   - Analytics: engagement charts (Chart.js via CDN), funnel
   - Settings: Adsense client ID, ad slots, GA4 ID, feature toggles
   - Users: session stats, preference distribution
2. `admin/src/app.js` → bundled to `admin/dist/app.js`
3. Responsive design (works on MacBook Pro 2017 13" screen)

### Deliverables:
- `admin/index.html`, `admin/src/app.js`, `admin/input.css`
- Built admin assets in `admin/dist/`
- Git commit: `feat: admin dashboard with content management and analytics`

---

## Phase 7: SEO, AI Discovery & Compliance
**Goal**: Google Ads ready, sitemap, llms.txt, cookies, ToS

### Tasks:
1. `GET /sitemap.xml` - dynamic, includes all posts, updates daily via cron
2. `GET /robots.txt` - allow all, sitemap reference, crawl-delay for budget
3. `GET /llms.txt` - AI agent discovery:
   ```
   # Afrocentric Media & Meme Aggregator
   ## Summary
   Curated Afrocentric memes, culture, tech, and entertainment with AI summaries.
   ## Links
   - Feed: https://gossip.ugaplex.com/api/feed
   - RSS: https://gossip.ugaplex.com/feed.xml
   - Sitemap: https://gossip.ugaplex.com/sitemap.xml
   ```
4. Cookie consent banner (Phase 5) - categories: Necessary, Analytics, Ads
5. Terms of Service page (`public/tos.html`) and Privacy Policy (`public/privacy.html`)
6. Google Ads / AdSense integration:
   - `site_config` table stores `adsense_client_id`, ad slot IDs
   - Auto-ad placement in feed (every N items)
   - Conversion tracking via `analytics_events`
7. Structured data (JSON-LD) on each post for rich snippets

### Deliverables:
- Sitemap, robots, llms.txt endpoints
- `public/tos.html`, `public/privacy.html`
- Cookie consent implementation
- Ad injection logic in feed
- Git commit: `feat: seo, ai discovery, cookies, tos, adsense integration`

---

## Phase 8: Thunderbird Extension
**Goal**: Text-only RSS consumer for desktop readers

### Tasks:
1. Create `public/thunderbird/manifest.json` (Manifest V3)
2. Create `public/thunderbird/popup.html` - consumes `/feed.xml`
3. Background script to fetch and cache feed
4. Package as `.xpi` for distribution

### Deliverables:
- `public/thunderbird/manifest.json`, `public/thunderbird/popup.html`, `public/thunderbird/background.js`
- Git commit: `feat: thunderbird extension for text-only feed`

---

## Resource Optimization Notes (Chromebook Target)
- SQLite WAL mode for concurrent reads
- Lazy-load plugin modules
- **Tailwind build step** (no CDN) - purge unused CSS in production
- Python ranker called via `child_process.spawn` (not persistent)
- Cron jobs for scraping (configurable, default 30min)
- Gemini API calls batched, with local truncation fallback
- Service Worker for offline-first PWA
- Compression (gzip/brotli) via Express `compression` middleware
- Helmet for security headers

---

## Directory Structure (Final)
```
afro-aggregator/
├── README.md
├── package.json
├── requirements.txt
├── .env.example
├── .gitignore
├── tailwind.config.js
├── postcss.config.js
├── Caddyfile.template
├── database.sqlite (auto-generated)
├── src/
│   ├── db.js
│   ├── pluginManager.js
│   ├── plugins/
│   │   ├── tiktokPlugin.js
│   │   ├── nitterPlugin.js
│   │   └── youtubePlugin.js
│   ├── summarizer.js
│   ├── scraper.js
│   ├── server.js
│   ├── adminServer.js
│   ├── auth.js
│   ├── client.js
│   └── input.css
├── python/
│   └── ranking_engine.py
├── admin/
│   ├── index.html
│   ├── src/app.js
│   └── input.css
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── tos.html
│   ├── privacy.html
│   └── thunderbird/
│       ├── manifest.json
│       ├── popup.html
│       └── background.js
└── dist/ (gitignored - built assets)
    ├── styles.css
    └── app.js
```

---

## Git Workflow
- Each phase = 1 commit (conventional commits)
- Commit as authenticated user (GitHub CLI configured)
- Branch: `main` only (linear history)
- Tags for releases: `v0.1.0`, `v0.2.0`, etc.

---

## Next Steps
1. Review and confirm this updated plan
2. I'll start scaffolding Phase 0 immediately upon confirmation
3. Each phase committed separately for easy rollback/review