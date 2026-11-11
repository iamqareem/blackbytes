// Static SEO generator — mirrors the Express SEO endpoints as plain files.
//
// Production reality: Cloudflare Pages serves pwa/ straight from the GitHub
// repo (auto-deploy on push), and the Express backend only lives on
// localhost. Dynamic endpoints (/sitemap.xml, /robots.txt, /feed.xml,
// /llms.txt, /llms-full.txt, /post/:id) therefore don't exist in production —
// this script bakes them into pwa/ as static files so crawlers, chatbots and
// WhatsApp link previews get real content.
//
// Run after every Scrape + Summarize + Sync cycle:
//   npm run build:seo
// then commit + push so Pages redeploys.
//
// Uses Node 22 (better-sqlite3 ABI).

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { generateJsonLd } from '../src/seo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PWA = path.join(ROOT, 'pwa');
const DB_PATH = process.env.LOCAL_DB_PATH || path.join(ROOT, 'database.sqlite');

const SITE_URL = (process.env.SITE_URL || 'https://snaps.ugaplex.com').replace(/\/$/, '');
const SITE_NAME = 'Snapfeed';
const SITE_DESC = 'A swipeable, AI-summarized feed of African and world news, sports, geopolitics, tech and culture, refreshed every 30 minutes from 30+ verified sources.';

const db = new Database(DB_PATH, { readonly: true });

const esc = (s = '') => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const cdata = (s = '') => `<![CDATA[${String(s).replace(/]]>/g, ']]&gt;')}]]>`;

const posts = db.prepare(`
    SELECT * FROM posts ORDER BY created_at DESC
`).all();
const categories = db.prepare('SELECT category, COUNT(*) AS n FROM posts GROUP BY category ORDER BY n DESC').all();

console.log(`posts: ${posts.length} · generating into ${path.relative(ROOT, PWA)}/`);

// ── robots.txt ──────────────────────────────────────────────────────────────
const AI_BOTS = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web',
    'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended',
    'Applebot-Extended', 'CCBot', 'cohere-ai', 'YouBot', 'Meta-ExternalAgent',
];
let robots = `# ${SITE_NAME} — ${SITE_URL}
User-agent: *
Allow: /
Disallow: /admin/

`;
for (const bot of AI_BOTS) {
    robots += `User-agent: ${bot}\nAllow: /\nDisallow: /admin/\n\n`;
}
robots += `Sitemap: ${SITE_URL}/sitemap.xml
# Content policy: quoting our summaries is welcome with a link back to the
# canonical URL; original reporting is linked from every post page.

Crawl-delay: 5
`;
fs.writeFileSync(path.join(PWA, 'robots.txt'), robots);

// ── sitemap.xml — every post ────────────────────────────────────────────────
let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${SITE_URL}</loc>
        <changefreq>hourly</changefreq>
        <priority>1.0</priority>
    </url>
`;
for (const p of posts) {
    sitemap += `    <url>
        <loc>${SITE_URL}/post/${p.id}</loc>
        <lastmod>${new Date(p.indexed_at || p.created_at).toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>
`;
}
sitemap += '</urlset>\n';
fs.writeFileSync(path.join(PWA, 'sitemap.xml'), sitemap);

// ── feed.xml — RSS 2.0, latest 50 ───────────────────────────────────────────
let feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${esc(SITE_DESC)}</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
`;
for (const p of posts.slice(0, 50)) {
    feed += `    <item>
        <title>${cdata(p.title)}</title>
        <link>${SITE_URL}/post/${p.id}</link>
        <guid isPermaLink="true">${SITE_URL}/post/${p.id}</guid>
        <description>${cdata(p.summary || '')}</description>
        <category>${cdata(p.category)}</category>
        <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
        <source url="${esc(p.source_url)}">${esc(p.source_name)}</source>
    </item>
`;
}
feed += '</channel>\n</rss>\n';
fs.writeFileSync(path.join(PWA, 'feed.xml'), feed);

// ── llms.txt ────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(PWA, 'llms.txt'), `# ${SITE_NAME}

> ${SITE_DESC} Every story is aggregated from a verified source, AI-summarized, and
> published with an attribution link to the original reporting.

${SITE_NAME} covers: ${categories.map(c => `${c.category} (${c.n})`).join(', ')}.

## Citing us
Quoting our summaries is welcome with a link to the canonical
${SITE_URL}/post/<id> URL. Original reporting always lives at the source
linked on each post page — cite them for primary facts.

## Content for retrieval
- [Full text for LLMs](${SITE_URL}/llms-full.txt): titles, categories and
  summaries of the 60 most recent posts
- [RSS feed](${SITE_URL}/feed.xml): latest 50 posts with summaries
- [Sitemap](${SITE_URL}/sitemap.xml): all post URLs
- [Frontend](${SITE_URL}): swipeable PWA

## Update cadence
Sources are scraped every 30 minutes; ${SITE_NAME} reflects the newest
~100 posts at any time.
`);

// ── llms-full.txt — 60 most recent ──────────────────────────────────────────
const llmPosts = posts.slice(0, 60);
fs.writeFileSync(path.join(PWA, 'llms-full.txt'), `# ${SITE_NAME} — full content for LLM retrieval

Generated: ${new Date().toISOString()}
Entries: ${llmPosts.length} most recent posts. Summaries are AI-generated by
${SITE_NAME} from linked original sources; every entry links to the canonical
${SITE_NAME} URL and names the original publisher.

## Posts

${llmPosts.map(p => `### ${p.title}
- Category: ${p.category} · Published: ${String(p.created_at).split(' ')[0]} · Source: ${p.source_name}
- URL: ${SITE_URL}/post/${p.id}
- Summary: ${p.summary}`).join('\n\n')}
`);

// ── post/<id>/index.html — static post pages, ALL posts ─────────────────────
// Cloudflare Pages resolves /post/<id> → /post/<id>/index.html, so every
// sitemap URL lands on a real page with OG tags + JSON-LD (WhatsApp previews,
// Google articles, LLM citations).
const POSTS_DIR = path.join(PWA, 'post');
fs.mkdirSync(POSTS_DIR, { recursive: true });

// Clean stale directories (posts deleted from the DB)
const liveIds = new Set(posts.map(p => String(p.id)));
for (const dir of fs.readdirSync(POSTS_DIR)) {
    if (!liveIds.has(dir)) fs.rmSync(path.join(POSTS_DIR, dir), { recursive: true, force: true });
}

const appUrl = SITE_URL;
for (const p of posts) {
    const postUrl = `${SITE_URL}/post/${p.id}`;
    const imageUrl = p.media_url || `${SITE_URL}/icons/og-image.png`;
    const jsonLd = generateJsonLd(p, SITE_URL);
    const title = esc(p.title);
    const summary = esc(p.summary || '');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <meta name="description" content="${esc(String(p.summary || '').slice(0, 160))}">
    <title>${title} | ${SITE_NAME}</title>
    <link rel="canonical" href="${postUrl}">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${summary}">
    <meta property="og:image" content="${esc(imageUrl)}">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="article:published_time" content="${p.created_at}">
    <meta property="article:author" content="${esc(p.source_name)}">
    <meta property="article:section" content="${esc(p.category)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${summary}">
    <meta name="twitter:image" content="${esc(imageUrl)}">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #000; color: #fff;
               max-width: 640px; margin: 0 auto; padding: 32px 20px; line-height: 1.6; }
        h1 { font-size: 1.5rem; margin: 0 0 16px; }
        .meta { color: #888; font-size: .85rem; margin-bottom: 24px; }
        p.summary { color: #ccc; white-space: pre-line; }
        a { color: #4db8ff; }
        .open-app { display: inline-block; margin-top: 24px; padding: 12px 24px;
                    background: #fff; color: #000; border-radius: 24px;
                    font-weight: 700; text-decoration: none; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="meta">${esc(p.category)} · ${esc(p.source_name)} · ${String(p.created_at).split(' ')[0]}</div>
    <p class="summary">${summary}</p>
    <p>Original reporting: <a href="${esc(p.source_url)}" rel="noopener noreferrer">${esc(p.source_name)}</a></p>
    <a class="open-app" href="${appUrl}">Open the ${SITE_NAME} feed &rarr;</a>
</body>
</html>
`;
    const dir = path.join(POSTS_DIR, String(p.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
}

console.log(`done: robots.txt, sitemap.xml (${posts.length} urls), feed.xml (50), llms.txt, llms-full.txt (60), post pages (${posts.length})`);
