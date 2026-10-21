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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const RANKER_SCRIPT = path.resolve(__dirname, '..', 'python', 'ranking_engine.py');

const db = getDb();

const getConfig = db.prepare('SELECT value FROM site_config WHERE key = ?');
const insertInteraction = db.prepare(`
    INSERT INTO user_interactions (session_id, post_id, action_type)
    VALUES (?, ?, ?)
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

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
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
        
        const result = await runRanker(sessionId, limit, cursor);
        
        res.json({
            ...result,
            session_id: sessionId,
            next_cursor: result.posts.length > 0 ? result.posts[result.posts.length - 1].id : null,
        });
    } catch (err) {
        console.error('Feed error:', err);
        res.status(500).json({ error: 'Failed to generate feed' });
    }
});

app.post('/api/interact', async (req, res) => {
    try {
        const { session_id, post_id, action_type } = req.body;
        
        if (!session_id || !post_id || !action_type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!['view', 'like', 'share', 'save'].includes(action_type)) {
            return res.status(400).json({ error: 'Invalid action_type' });
        }
        
        insertInteraction.run(session_id, post_id, action_type);
        updatePostStats.run(action_type, action_type, action_type, action_type, post_id);
        
        const analyticsInsert = db.prepare(`
            INSERT INTO analytics_events (event_name, payload, session_id)
            VALUES (?, ?, ?)
        `);
        analyticsInsert.run(`interaction_${action_type}`, JSON.stringify({ post_id }), session_id);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Interact error:', err);
        res.status(500).json({ error: 'Failed to log interaction' });
    }
});

app.get('/api/preferences/:session_id', (req, res) => {
    const row = getPreferences.get(req.params.session_id);
    res.json({
        session_id: req.params.session_id,
        favorite_categories: row ? JSON.parse(row.favorite_categories) : [],
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

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Public server running on http://localhost:${PORT}`);
});

export default app;