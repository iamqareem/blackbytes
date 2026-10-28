import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getDb } from './db.js';
import { requireAuth } from './auth.js';
import { generateJsonLd } from './seo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const RANKER_SCRIPT = path.resolve(__dirname, '..', 'python', 'ranking_engine.py');

const db = getDb();

const getConfig = db.prepare('SELECT value FROM site_config WHERE key = ?');
const getPost = db.prepare('SELECT * FROM posts WHERE id = ?');
const insertInteraction = db.prepare(`
    INSERT INTO user_interactions (session_id, post_id, action_type)
    VALUES (?, ?, ?)
`);
const deleteInteraction = db.prepare(`
    DELETE FROM user_interactions WHERE session_id = ? AND post_id = ? AND action_type = ?
`);
const checkInteraction = db.prepare(`
    SELECT id FROM user_interactions WHERE session_id = ? AND post_id = ? AND action_type = ? LIMIT 1
`);
const updatePostStats = db.prepare(`
    UPDATE posts SET
        views = views + CASE WHEN ? = 'view' THEN 1 ELSE 0 END,
        likes = likes + CASE WHEN ? = 'like' THEN 1 ELSE 0 END,
        shares = shares + CASE WHEN ? = 'share' THEN 1 ELSE 0 END,
        saves = saves + CASE WHEN ? = 'save' THEN 1 ELSE 0 END,
        engagement_score = views + (likes * 2) + (shares * 3) + (saves * 4)
    WHERE id = ?
`);
const decrementPostStats = db.prepare(`
    UPDATE posts SET
        likes = MAX(0, likes - CASE WHEN ? = 'like' THEN 1 ELSE 0 END),
        saves = MAX(0, saves - CASE WHEN ? = 'save' THEN 1 ELSE 0 END),
        engagement_score = views + (likes * 2) + (shares * 3) + (saves * 4)
    WHERE id = ?
`);
const getSessionInteractions = db.prepare(`
    SELECT post_id, action_type FROM user_interactions
    WHERE session_id = ? AND post_id IN (SELECT value FROM json_each(?))
`);
const getReactionsForPosts = db.prepare(`
    SELECT ui.post_id, ui.payload, COUNT(*) as count
    FROM user_interactions ui
    WHERE ui.action_type = 'reaction' AND ui.post_id IN (SELECT value FROM json_each(?))
    GROUP BY ui.post_id, ui.payload
    ORDER BY count DESC
`);
const upsertPreferences = db.prepare(`
    INSERT INTO user_preferences (session_id, favorite_categories, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
        favorite_categories = excluded.favorite_categories,
        updated_at = CURRENT_TIMESTAMP
`);
const getPreferences = db.prepare('SELECT favorite_categories FROM user_preferences WHERE session_id = ?');
const getPostForShare = db.prepare('SELECT id, title, summary, media_url, source_url, source_name FROM posts WHERE id = ?');
const getPostsForSitemap = db.prepare('SELECT id, source_url, created_at FROM posts ORDER BY created_at DESC LIMIT 50000');
const getSiteConfig = db.prepare('SELECT key, value FROM site_config');
const insertAnalytics = db.prepare(`
    INSERT INTO analytics_events (event_name, payload, session_id)
    VALUES (?, ?, ?)
`);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
app.use(cors({
    origin: process.env.SITE_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '..', 'public')));

function runRanker(sessionId, limit = 20, cursor = null) {
    return new Promise((resolve, reject) => {
        const args = [RANKER_SCRIPT, sessionId, limit.toString()];
        if (cursor) args.push(cursor);
        
        const py = spawn(PYTHON_PATH, args);
        let stdout = '';
        let stderr = '';
        
        py.stdout.on('data', (data) => { stdout += data.toString(); });
        py.stderr.on('data', (data) => { stderr += data.toString(); });
        
        py.on('close', (code) => {
            if (code !== 0) {
                console.error('Ranker stderr:', stderr);
                return reject(new Error(`Ranker exited with code ${code}`));
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error('Invalid JSON from ranker'));
            }
        });
    });
}

function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/feed', async (req, res) => {
    try {
        let sessionId = req.query.session_id;
        if (!sessionId) {
            sessionId = generateSessionId();
        }
        
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const cursor = req.query.cursor || null;
        const offset = parseInt(cursor, 10) || 0;
        
        const result = await runRanker(sessionId, limit, cursor);
        
        const enableAds = getConfig.get('enable_ads')?.value === 'true';
        const adsenseClient = getConfig.get('adsense_client_id')?.value;
        const adsenseSlot = getConfig.get('adsense_slot_feed')?.value;
        
        let posts = result.posts || [];
        
        if (enableAds && adsenseClient && adsenseSlot && posts.length > 0) {
            const adInterval = 5;
            const ads = [];
            for (let i = adInterval - 1; i < posts.length; i += adInterval) {
                ads.push({ index: i, ad: true, adsenseClient, adsenseSlot });
            }
            
            const merged = [];
            let adIdx = 0;
            for (let i = 0; i < posts.length; i++) {
                if (adIdx < ads.length && ads[adIdx].index === i) {
                    merged.push(ads[adIdx]);
                    adIdx++;
                }
                merged.push(posts[i]);
            }
            if (adIdx < ads.length) merged.push(...ads.slice(adIdx).map(a => ({ ...a, ad: true })));
            posts = merged;
        }
        
        res.json({
            ...result,
            posts,
            session_id: sessionId,
            next_cursor: (result.posts || []).length === limit ? offset + limit : null,
        });
    } catch (err) {
        console.error('Feed error:', err);
        res.status(500).json({ error: 'Failed to generate feed' });
    }
});

app.post('/api/interact', async (req, res) => {
    try {
        const { session_id, post_id, action_type, payload } = req.body;
        
        if (!session_id || !post_id || !action_type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const toggleableActions = ['like', 'save'];
        const validActions = ['view', 'like', 'share', 'save', 'reaction', 'ad_click', 'ad_impression'];
        if (!validActions.includes(action_type)) {
            return res.status(400).json({ error: 'Invalid action_type' });
        }
        
        let toggled = false;
        let active = true;

        if (post_id > 0) {
            if (toggleableActions.includes(action_type)) {
                // Toggle: check if interaction already exists
                const existing = checkInteraction.get(session_id, post_id, action_type);
                if (existing) {
                    // Un-like / un-save
                    deleteInteraction.run(session_id, post_id, action_type);
                    decrementPostStats.run(action_type, action_type, post_id);
                    toggled = true;
                    active = false;
                } else {
                    insertInteraction.run(session_id, post_id, action_type);
                    updatePostStats.run(action_type, action_type, action_type, action_type, post_id);
                }
            } else if (action_type === 'reaction') {
                // Store reaction emoji in action_type payload via a separate log
                // Use the payload field (emoji char) stored as action payload
                const emoji = payload?.emoji || payload || '❤️';
                // Only insert if not already reacted with same emoji
                const existing = db.prepare(
                    `SELECT id FROM user_interactions WHERE session_id = ? AND post_id = ? AND action_type = 'reaction' AND payload = ? LIMIT 1`
                ).get(session_id, post_id, emoji);
                if (!existing) {
                    db.prepare(
                        `INSERT INTO user_interactions (session_id, post_id, action_type, payload) VALUES (?, ?, 'reaction', ?)`
                    ).run(session_id, post_id, emoji);
                }
            } else {
                insertInteraction.run(session_id, post_id, action_type);
                updatePostStats.run(action_type, action_type, action_type, action_type, post_id);
            }
        }
        
        if (!['reaction', 'ad_click', 'ad_impression'].includes(action_type)) {
            insertAnalytics.run(`interaction_${action_type}`, JSON.stringify(payload || { post_id }), session_id);
        }
        
        if (action_type === 'ad_click') {
            insertAnalytics.run('adsense_click', JSON.stringify(payload || { post_id }), session_id);
        }
        
        res.json({ success: true, toggled, active });
    } catch (err) {
        console.error('Interact error:', err);
        res.status(500).json({ error: 'Failed to log interaction' });
    }
});

// Get user's own interaction state for a batch of post IDs
app.get('/api/interactions', (req, res) => {
    try {
        const { session_id, post_ids } = req.query;
        console.log('[interactions] Query:', req.query);
        if (!session_id || !post_ids) {
            return res.status(400).json({ error: 'Missing session_id or post_ids' });
        }
        
        const ids = post_ids.split(',').map(Number).filter(Boolean);
        if (ids.length === 0) return res.json({ interactions: {}, reactions: {} });
        
        const idsJson = JSON.stringify(ids);
        console.log('[interactions] idsJson:', idsJson);
        
        // User's own interactions
        const rows = getSessionInteractions.all(session_id, idsJson);
        console.log('[interactions] rows:', rows);
        const interactions = {};
        for (const row of rows) {
            if (!interactions[row.post_id]) interactions[row.post_id] = {};
            interactions[row.post_id][row.action_type] = true;
        }
        
        // All users' reactions grouped by emoji per post
        const reactionRows = getReactionsForPosts.all(idsJson);
        console.log('[interactions] reactionRows:', reactionRows);
        const reactions = {};
        for (const row of reactionRows) {
            if (!reactions[row.post_id]) reactions[row.post_id] = [];
            reactions[row.post_id].push({ emoji: row.payload, count: row.count });
        }
        
        const result = { interactions, reactions };
        console.log('[interactions] result:', result);
        res.json(result);
    } catch (err) {
        console.error('Interactions fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch interactions' });
    }
});

app.get('/api/preferences/:session_id', (req, res) => {
    const row = getPreferences.get(req.params.session_id);
    res.json({
        session_id: req.params.session_id,
        favorite_categories: row ? JSON.parse(row.favorite_categories) : [],
        exists: !!row,
    });
});

app.put('/api/preferences/:session_id', (req, res) => {
    const { favorite_categories } = req.body;
    if (!Array.isArray(favorite_categories)) {
        return res.status(400).json({ error: 'favorite_categories must be an array' });
    }
    upsertPreferences.run(req.params.session_id, JSON.stringify(favorite_categories));
    res.json({ success: true });
});

app.get('/api/share/:id/whatsapp', (req, res) => {
    const post = getPostForShare.get(req.params.id);
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }
    
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const shareUrl = `${siteUrl}/?post=${post.id}`;
    const shareText = `${post.title}\n\n${post.summary}\n\n${shareUrl}`;
    
    res.json({
        image_url: post.media_url,
        deep_link: `whatsapp://send?text=${encodeURIComponent(shareText)}`,
        web_link: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        text: shareText,
    });
});

app.get('/feed.xml', (req, res) => {
    const posts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50').all();
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const siteName = getConfig.get('site_name')?.value || 'Afro Aggregator';
    const siteDesc = getConfig.get('site_description')?.value || '';
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>${siteName}</title>
    <link>${siteUrl}</link>
    <description>${siteDesc}</description>
    <language>en</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;
    
    for (const post of posts) {
        const pubDate = new Date(post.created_at).toUTCString();
        const postUrl = `${siteUrl}/?post=${post.id}`;
        
        xml += `
    <item>
        <title><![CDATA[${post.title}]]></title>
        <link>${postUrl}</link>
        <guid isPermaLink="false">${post.source_url}</guid>
        <description><![CDATA[${post.summary}]]></description>
        <pubDate>${pubDate}</pubDate>
        <category>${post.category}</category>
    </item>`;
    }
    
    xml += `
</channel>
</rss>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(xml);
});

app.get('/sitemap.xml', (req, res) => {
    const posts = getPostsForSitemap.all();
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    
    xml += `
    <url>
        <loc>${siteUrl}</loc>
        <changefreq>hourly</changefreq>
        <priority>1.0</priority>
    </url>`;
    
    for (const post of posts) {
        const postUrl = `${siteUrl}/?post=${post.id}`;
        const lastmod = new Date(post.created_at).toISOString().split('T')[0];
        
        xml += `
    <url>
        <loc>${postUrl}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`;
    }
    
    xml += `
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(xml);
});

app.get('/robots.txt', (req, res) => {
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    
    res.set('Content-Type', 'text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml

Crawl-delay: 10
`);
});

app.get('/llms.txt', (req, res) => {
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const siteName = getConfig.get('site_name')?.value || 'Afro Aggregator';
    const siteDesc = getConfig.get('site_description')?.value || '';
    
    res.set('Content-Type', 'text/plain');
    res.send(`# ${siteName}

## Summary
${siteDesc}

## Links
- Feed: ${siteUrl}/api/feed
- RSS: ${siteUrl}/feed.xml
- Sitemap: ${siteUrl}/sitemap.xml
- Frontend: ${siteUrl}

## API
GET /api/feed?session_id=XYZ&limit=20&cursor=ID
POST /api/interact {session_id, post_id, action_type}
GET /api/preferences/:session_id
PUT /api/preferences/:session_id {favorite_categories}
GET /api/share/:id/whatsapp
`);
});

app.get('/post/:id', (req, res) => {
    const post = getPost.get(req.params.id);
    if (!post) {
        return res.status(404).sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
    }
    
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const siteName = 'Blackbytes';
    const siteDesc = 'Your daily dose of Afrocentric memes, culture & tech';
    const postUrl = `${siteUrl}/post/${post.id}`;
    const imageUrl = post.media_url || `${siteUrl}/icons/og-image.png`;
    
    const jsonLd = generateJsonLd(post, siteUrl);
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0095F6">
    <meta name="description" content="${post.summary.replace(/"/g, '"').substring(0, 160)}">
    
    <title>${post.title.replace(/"/g, '"')} | ${siteName}</title>
    
    <link rel="canonical" href="${postUrl}">
    <link rel="manifest" href="/manifest.json">
    
    <meta property="og:type" content="article">
    <meta property="og:title" content="${post.title.replace(/"/g, '"')}">
    <meta property="og:description" content="${post.summary.replace(/"/g, '"')}">
    <meta property="og:image" content="${imageUrl.replace(/"/g, '"')}">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:site_name" content="${siteName}">
    <meta property="article:published_time" content="${post.created_at}">
    <meta property="article:author" content="${post.source_name.replace(/"/g, '"')}">
    <meta property="article:section" content="${post.category}">
    <meta property="article:tag" content="${post.category}">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${post.title.replace(/"/g, '"')}">
    <meta name="twitter:description" content="${post.summary.replace(/"/g, '"')}">
    <meta name="twitter:image" content="${imageUrl.replace(/"/g, '"')}">
    <meta name="twitter:site" content="@blackbytes">
    
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    
    <link rel="stylesheet" href="/dist/styles.css">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
</head>
<body class="min-h-screen bg-ig-50 dark:bg-ig-bg">
    <article class="max-w-2xl mx-auto px-4 py-8">
        <header class="mb-6">
            <a href="/" class="text-ig-400 hover:text-ig-primary text-sm mb-4 inline-block">&larr; Back to Feed</a>
            <span class="badge ${post.category === 'Memes' ? 'badge-memes' : post.category === 'Culture' ? 'badge-culture' : post.category === 'Tech' ? 'badge-tech' : post.category === 'Entertainment' ? 'badge-entertainment' : post.category === 'News' ? 'badge-news' : 'badge-sports'}">${post.category}</span>
            <h1 class="text-2xl md:text-3xl font-bold text-ig-900 dark:text-ig-text mt-3 mb-2 leading-tight">${post.title}</h1>
            <div class="flex items-center gap-4 text-sm text-ig-400">
                <a href="${post.source_url}" target="_blank" rel="noopener noreferrer" class="hover:text-ig-primary">${post.source_name}</a>
                <span>·</span>
                <time>${new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            </div>
        </header>
        
        ${post.media_url || post.media_type === 'shorts' ? `
        <div class="mb-6 rounded-xl overflow-hidden bg-ig-100 dark:bg-ig-elevated">
            ${(['embed', 'shorts'].includes(post.media_type)) && post.source_url.includes('tiktok.com') ? (() => {
                const videoId = post.source_url.match(/\/video\/(\d+)/)?.[1] || post.source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
                return videoId ? `<iframe src="https://www.tiktok.com/player/v1/${videoId}" class="w-full" style="aspect-ratio: 9/16; max-height: 70vh; margin: 0 auto;" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` : '';
            })() : post.media_type === 'embed' && post.source_url.includes('youtube') ? (() => {
                const videoId = post.source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
                return videoId ? `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1" class="w-full aspect-video" frameborder="0" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>` : '';
            })() : post.media_type === 'shorts' ? (() => {
                const videoId = post.source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
                return videoId ? `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1" class="w-full" style="aspect-ratio: 9/16;" frameborder="0" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>` : '';
            })() : post.media_type === 'video' ? `<video class="w-full" controls preload="metadata" poster="${post.media_url}"><source src="${post.media_url}" type="video/mp4"></video>` : `<img src="${post.media_url}" alt="${post.title.replace(/"/g, '"')}" class="w-full" loading="lazy">`}
        </div>` : ''}
        
        <div class="prose prose-ig max-w-none dark:prose-invert">
            <p class="text-lg text-ig-700 dark:text-ig-muted leading-relaxed whitespace-pre-wrap">${post.summary}</p>
        </div>
        
        <footer class="mt-8 pt-6 border-t border-ig-200 dark:border-ig-border">
            <div class="flex flex-wrap gap-2 mb-4">
                <button onclick="navigator.share ? navigator.share({title: '${post.title.replace(/'/g, "\\'")}', text: '${post.summary.replace(/'/g, "\\'").substring(0, 100)}', url: '${postUrl}') : window.open('https://wa.me/?text=${encodeURIComponent(post.title + '\\n\\n' + post.summary + '\\n\\n' + postUrl)}', '_blank')" class="btn-primary text-sm">
                    <svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
                    Share
                </button>
                <a href="${post.source_url}" target="_blank" rel="noopener noreferrer" class="btn-secondary text-sm">View Source</a>
            </div>
            <p class="text-xs text-ig-400">Curated by Blackbytes · AI-summarized</p>
        </footer>
    </article>
    
    <script type="module" src="/dist/app.js"></script>
</body>
</html>`;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
});

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Public server running on http://localhost:${PORT}`);
});

export default app;