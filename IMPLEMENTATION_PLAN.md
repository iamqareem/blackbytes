# Snapfeed — Implementation Plan

**Goal:** Split Blackbytes into a local scraping backend + Cloudflare PWA frontend, with Turso as the synced read database.

**Current state (done):**
- Rename → Snapfeed (package, HTML, SEO, plugins, manifests)
- Config-driven RSS sources (`src/config/rss-sources.js`)
- Shared RSS parser (`src/rssParser.js`)
- JS ranking engine ported to `src/ranking.js` (3-day freshness, video interleave, meme boost)
- Turso sync module (`src/sync.js`) + admin sync endpoint + UI button

---

## Phase 1 — Turso Schema (Awaiting your action)

**You need to do this in the Turso web dashboard:**

1. Go to your Turso database `snapfeed-mwanja.aws-ap-south-1.turso.io`
2. Open the SQL editor / console
3. Paste and run `turso-schema.sql` (created at repo root)

This creates: `posts`, `user_preferences`, `user_interactions`, `site_config` tables + indexes the ranking engine needs.

> ⚠️ Do this **before** any sync runs, otherwise sync will fail on missing tables.

---

## Phase 2 — Local Backend Sync (Code done, needs `.env` + test)

**Already implemented:**

| File | What it does |
|------|--------------|
| `src/sync.js` | Pushes all local SQLite posts → Turso (upsert by `source_url`, batched in 100s) |
| `src/server.js` | `POST /api/sync` (auth-protected) + `GET /api/sync/status` |
| `src/adminServer.js` | `POST /admin/api/sync` + `GET /admin/api/sync/status` |
| `admin/index.html` | "Sync to Turso" button in the scraper tab |
| `admin/src/app.js` | `triggerSync()` function wired to the button |

**What you do:**

1. Copy `.env.example` → `.env` (gitignored, never committed)
2. Add your Turso auth token:
   ```
   TURSO_URL=libsql://snapfeed-mwanja.aws-ap-south-1.turso.io
   TURSO_AUTH_TOKEN=<create this in Turso dashboard: Settings > Auth tokens>
   ```
3. Run both servers:
   ```bash
   # Terminal 1
   npm run dev           # public server :3000
   # Terminal 2
   npm run admin:dev     # admin portal :3001
   ```
4. Log into admin portal, scrape some content, click "Sync to Turso"
5. Verify posts appear in your Turso dashboard SQL editor

**Sync behavior:** One-way, local → Turso. PWA only **reads** from Turso. Local DB is the source of truth for scraping/summarization.

---

## Phase 3 — PWA Frontend (Cloudflare Workers/Pages)

**Architecture:** SPA hosted on Cloudflare, reads from Turso via HTTPS, ranks in-browser.

| Piece | Approach |
|-------|----------|
| Hosting | Cloudflare Workers + Pages (free tier) |
| Styling | Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com">`) — no build step |
| Data | Fetch from Turso HTTP endpoint (`TURSO_URL/v2/pipeline` or REST) |
| Ranking | `src/ranking.js` (already ported to JS, dependency-free) runs client-side |
| PWA | Service worker + manifest (already exist in `public/`) |

**Files to create:**
- `pwa/index.html` — shell, imports Tailwind CDN + `pwa/app.js`
- `pwa/app.js` — fetches posts from Turso, runs `rankPosts()`, renders cards
- `pwa/styles.css` — minimal overrides (optional, since Tailwind CDN)
- `wrangler.toml` — Cloudflare deploy config with Turso binding

**Turso access from Cloudflare:**
Cloudflare Workers can fetch Turso's HTTPS endpoint directly using the auth token. You'll store `TURSO_URL` and `TURSO_AUTH_TOKEN` as Cloudflare secrets/variables.

---

## Phase 4 — Ad Monetization (PWA)

| Ad Network | Placement | Implementation |
|------------|-----------|----------------|
| Google AdSense | Feed interstitial (every 5th card) + sidebar | Existing `adsense_client_id` / `adsense_slot_feed` config |
| Monetag | Pop-under / direct links | `monetag_zone_id` config → inject script |

**Config toggles in `site_config` table:**
- `enable_ads` (true/false)
- `adsense_client_id`, `adsense_slot_feed`
- `monetag_zone_id`

The PWA reads these from Turso and injects ads conditionally.

---

## Phase 5 — Telegram Mini App

**Wrap the PWA as a Telegram Mini App:**

- Add Telegram WebApp script: `https://telegram.org/js/telegram-web-app.js`
- The PWA detects `window.Telegram.WebApp` and adjusts UI (full-screen, no browser chrome)
- **Adsgram** — Telegram's ad network for Mini Apps (replaces/shows alongside AdSense in Telegram context)
- **Telegram Stars** — in-app purchases for premium features (ad-free, save more, etc.)

**Files:** `pwa/telegram-integration.js` — detects Telegram environment, initializes WebApp, exposes Stars purchase flow.

---

## Phase 6 — AliExpress Affiliate Links

- Add affiliate config to `site_config`: `affiliate_aliexpress` (true/false), `affiliate_aliexpress_tag`
- When enabled, outbound links to product URLs get wrapped with your AliExpress Partner Network affiliate ID
- Simple link-rewriting in `pwa/app.js` when rendering cards

---

## Sync Flow Summary

```
Local SQLite (scrapes + summarizes)
        │
        │ sync (POST /admin/api/sync, batched upserts)
        ▼
Turso Remote (libsql://snapfeed-mwanja.aws-ap-south-1.turso.io)
        │
        │ HTTPS read (PWA fetches posts)
        ▼
Cloudflare PWA (ranks in JS, renders cards, shows ads)
```

---

## Confirmation Checklist

Before I start building the PWA, please confirm:

1. [ ] You'll run `turso-schema.sql` in your Turso dashboard
2. [ ] You'll add `TURSO_AUTH_TOKEN` to your local `.env`
3. [ ] You're OK with one-way sync (local → Turso only; PWA reads only)
4. [ ] PWA on Cloudflare Workers/Pages is your preferred frontend host
5. [ ] Ad priority order: AdSense → Monetag → Adsgram (Telegram)
6. [ ] Telegram Mini App + AliExpress affiliate are Phase 5/6 (after PWA is live)

Say "go" on the items above and I'll start building `pwa/` + Cloudflare deploy config.