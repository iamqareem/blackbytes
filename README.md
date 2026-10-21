# Afrocentric Media & Meme Aggregator

A low-overhead, mobile-first content aggregator featuring ~60-word AI micro-summaries, hotlinked video embeds, and dynamic Python-powered personalization. Built for resource-constrained environments (4GB RAM, dual-core CPU).

## Features

- **Smart Aggregation**: Plugins for TikTok, Twitter/X (via Nitter), YouTube Shorts
- **AI Summaries**: Gemini 2.5 Flash compresses content to punchy 60-word micro-summaries
- **Personalized Feed**: Python heuristic ranker (category affinity ×5 + likes ×1.5 - age ×0.1)
- **PWA Ready**: Offline-first, installable, vertical swipe UX
- **Admin Dashboard**: Caddy-secured (mTLS), content management, analytics, scraper control
- **SEO & AI Discovery**: sitemap.xml, robots.txt, llms.txt, JSON-LD, Open Graph
- **Monetization Ready**: AdSense integration, Google Ads conversion tracking
- **Compliance**: GDPR/CCPA cookie consent, ToS, Privacy Policy
- **Sharing**: Native WhatsApp share with image preview

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ (ESM) |
| Database | SQLite3 (better-sqlite3, WAL mode) |
| API | Express.js |
| Scraping | axios, cheerio, rss-parser, node-cron |
| AI | Google Generative AI (gemini-2.5-flash) |
| Ranking | Python 3 (native sqlite3) |
| Frontend | Vanilla JS, Tailwind CSS (build step) |
| Styling | Instagram-inspired palette (light/dark) |
| Auth | JWT (httpOnly cookies), bcrypt |
| Security | Helmet, CORS, compression |
| Build | Tailwind CLI, esbuild |
| Reverse Proxy | Caddy (auto-HTTPS, mTLS for admin) |

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.8+
- Caddy 2.7+ (for production)

### Installation

```bash
# Clone and enter
git clone https://github.com/yourusername/afro-aggregator.git
cd afro-aggregator

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your keys (GEMINI_API_KEY, JWT_SECRET, etc.)

# Build assets
npm run build

# Initialize database
npm run db:init

# Development (two terminals)
npm run dev        # Public API on :3000
npm run admin:dev  # Admin API on :3001
```

### Production with Caddy

```bash
# Build for production
NODE_ENV=production npm run build

# Configure Caddy (copy template and edit domains)
cp Caddyfile.template Caddyfile
# Edit Caddyfile with your domains

# Run Caddy
caddy run --config Caddyfile

# Start services (use PM2 or systemd)
pm2 start src/server.js --name afro-public
pm2 start src/adminServer.js --name afro-admin
```

## Project Structure

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
├── src/
│   ├── db.js              # SQLite + schema
│   ├── pluginManager.js   # Dynamic plugin loader
│   ├── plugins/           # TikTok, Nitter, YouTube
│   ├── summarizer.js      # Gemini 2.5 Flash
│   ├── scraper.js         # Orchestrator + cron
│   ├── server.js          # Public API
│   ├── adminServer.js     # Admin API (JWT auth)
│   ├── auth.js            # JWT helpers
│   ├── client.js          # Frontend entry
│   └── input.css          # Tailwind entry
├── python/
│   └── ranking_engine.py  # Heuristic ranker
├── admin/
│   ├── index.html         # Dashboard entry
│   ├── src/app.js         # Dashboard logic
│   └── input.css          # Admin Tailwind entry
├── public/
│   ├── index.html         # PWA entry
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service Worker
│   ├── tos.html           # Terms of Service
│   ├── privacy.html       # Privacy Policy
│   └── thunderbird/       # Thunderbird extension
└── dist/                  # Built assets (gitignored)
```

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feed` | Ranked feed (cursor pagination) |
| POST | `/api/interact` | Log view/like/share/save |
| GET | `/api/preferences/:session_id` | User preferences |
| GET | `/api/share/:id/whatsapp` | WhatsApp share payload |
| GET | `/feed.xml` | RSS 2.0 (text-only) |
| GET | `/sitemap.xml` | Dynamic sitemap |
| GET | `/robots.txt` | Crawler directives |
| GET | `/llms.txt` | AI agent discovery |

### Admin (requires JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/api/posts` | Paginated posts management |
| POST | `/admin/api/posts` | Create/edit post |
| DELETE | `/admin/api/posts/:id` | Delete post |
| POST | `/admin/api/scrape/trigger` | Manual scrape |
| GET | `/admin/api/analytics` | Engagement stats |
| GET/PUT | `/admin/api/config` | Site config (ads, SEO) |
| GET | `/admin/api/users` | Session stats |

## Configuration

Key environment variables:

```env
GEMINI_API_KEY=           # Required for AI summaries
JWT_SECRET=               # 32+ char random string
ADMIN_PASSWORD_HASH=      # bcrypt hash (generate: node -e "console.log(require('bcryptjs').hashSync('password', 12))")
ADSENSE_CLIENT_ID=        # ca-pub-xxxxxxxxxxxxxxxx
GA4_ID=                   # G-XXXXXXXXXX
CADDY_ADMIN_DOMAIN=       # admin.yourdomain.com
```

## Scraper Sources

Configure in admin dashboard or `site_config` table:
- TikTok usernames/hashtags
- Twitter/X handles (via Nitter instances)
- YouTube Shorts channel IDs

## License

MIT