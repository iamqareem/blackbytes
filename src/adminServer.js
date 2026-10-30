import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, initDb } from './db.js';
import { requireAdmin, generateToken, verifyToken, setAuthCookie, clearAuthCookie, hashPassword, verifyPassword } from './auth.js';
import { triggerScrape } from './scraper.js';
import { syncToTurso } from './sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

const db = getDb();

const getPost = db.prepare('SELECT * FROM posts WHERE id = ?');
const getPosts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?');
const countPosts = db.prepare('SELECT COUNT(*) as total FROM posts');
const insertPost = db.prepare(`
    INSERT INTO posts (title, summary, media_url, media_type, source_url, source_name, category, created_at, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updatePost = db.prepare(`
    UPDATE posts SET title = ?, summary = ?, media_url = ?, media_type = ?, source_url = ?, source_name = ?, category = ?
    WHERE id = ?
`);
const deletePost = db.prepare('DELETE FROM posts WHERE id = ?');
const getConfigAll = db.prepare('SELECT * FROM site_config');
const updateConfig = db.prepare('UPDATE site_config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
const getAnalytics = db.prepare(`
    SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_events,
        SUM(CASE WHEN event_name = 'interaction_view' THEN 1 ELSE 0 END) as views,
        SUM(CASE WHEN event_name = 'interaction_like' THEN 1 ELSE 0 END) as likes,
        SUM(CASE WHEN event_name = 'interaction_share' THEN 1 ELSE 0 END) as shares,
        SUM(CASE WHEN event_name = 'interaction_save' THEN 1 ELSE 0 END) as saves
    FROM analytics_events
    WHERE created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
`);
const getUserStats = db.prepare(`
    SELECT 
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_interactions
    FROM user_interactions
    WHERE created_at >= DATE('now', '-30 days')
`);
const getCategoryStats = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM posts
    GROUP BY category
    ORDER BY count DESC
`);
const getTopPosts = db.prepare(`
    SELECT id, title, source_name, category, views, likes, shares, saves, engagement_score
    FROM posts
    ORDER BY engagement_score DESC
    LIMIT 10
`);

app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
    origin: process.env.SITE_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '..', 'admin')));

app.post('/admin/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    db.prepare('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    
    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    setAuthCookie(res, token);
    
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/admin/api/auth/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
});

app.get('/admin/api/auth/me', requireAdmin, (req, res) => {
    res.json({ user: req.user });
});

app.get('/admin/api/posts', requireAdmin, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const category = req.query.category;
    const search = req.query.search;
    
    let where = '';
    const params = [];
    
    if (category) {
        where += 'WHERE category = ? ';
        params.push(category);
    }
    if (search) {
        where += (where ? 'AND ' : 'WHERE ') + '(title LIKE ? OR source_name LIKE ?) ';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM posts ${where}`);
    const total = countStmt.get(...params).total;
    
    const selectStmt = db.prepare(`SELECT * FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
    params.push(limit, offset);
    const posts = selectStmt.all(...params);
    
    res.json({ posts, total, page, limit, totalPages: Math.ceil(total / limit) });
});

app.post('/admin/api/posts', requireAdmin, (req, res) => {
    const { title, summary, media_url, media_type, source_url, source_name, category } = req.body;
    
    if (!title || !summary || !source_url || !source_name || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        const result = insertPost.run(
            title, summary, media_url || null, media_type || 'text',
            source_url, source_name, category,
            new Date().toISOString(), new Date().toISOString()
        );
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Source URL already exists' });
        }
        throw err;
    }
});

app.put('/admin/api/posts/:id', requireAdmin, (req, res) => {
    const { title, summary, media_url, media_type, source_url, source_name, category } = req.body;
    
    if (!title || !summary || !source_url || !source_name || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = updatePost.run(title, summary, media_url, media_type, source_url, source_name, category, req.params.id);
    
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json({ success: true });
});

app.delete('/admin/api/posts/:id', requireAdmin, (req, res) => {
    const result = deletePost.run(req.params.id);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ success: true });
});

app.post('/admin/api/scrape/trigger', requireAdmin, async (req, res) => {
    try {
        const result = await triggerScrape();
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/api/sync', requireAdmin, async (req, res) => {
    try {
        const result = await syncToTurso();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/admin/api/sync/status', requireAdmin, (req, res) => {
    res.json({
        turso_configured: Boolean(process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN),
        local_db: process.env.LOCAL_DB_PATH || './database.sqlite',
    });
});

app.get('/admin/api/analytics', requireAdmin, (req, res) => {
    const daily = getAnalytics.all();
    const userStats = getUserStats.get();
    const categoryStats = getCategoryStats.all();
    const topPosts = getTopPosts.all();
    
    res.json({ daily, userStats, categoryStats, topPosts });
});

app.get('/admin/api/config', requireAdmin, (req, res) => {
    const config = getConfigAll.all();
    res.json(config.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});

app.put('/admin/api/config', requireAdmin, (req, res) => {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
        updateConfig.run(String(value), key);
    }
    res.json({ success: true });
});

app.get('/admin/api/users', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, role, created_at, last_login FROM admin_users').all();
    res.json({ users });
});

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'admin', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Admin server running on http://localhost:${PORT}`);
});

export default app;