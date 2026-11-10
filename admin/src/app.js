// Snapfeed Admin — minimal dashboard logic
// One fetch per dataset (the old build hit /analytics four times in parallel),
// charts rendered lazily on tab activation, Chart.js tree-shaken by esbuild.
import Chart from 'chart.js/auto';

const API_BASE = '/admin/api';
let currentTab = 'overview';
let postsPage = 1;
let postsLimit = 20;
let currentPostId = null;

const CATEGORIES = [
    'News', 'Sports', 'Geopolitics', 'Tech', 'AI & Quantum', 'Web3',
    'IoT & Open Source', 'Education', 'Entertainment', 'Culture',
];

// Gradient-consistent categorical palette (indigo → violet → pink → warm)
const CATEGORY_COLORS = [
    '#6366F1', '#A855F7', '#EC4899', '#F97316', '#F59E0B',
    '#10B981', '#14B8A6', '#3B82F6', '#EF4444', '#8B5CF6',
];

const charts = {}; // reusable Chart instances, destroyed on re-render

async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        credentials: 'include',
        ...options,
    });
    if (res.status === 401) return null;
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function formatDate(dateStr) {
    try {
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch { return dateStr; }
}

function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function showTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-link').forEach(el => el.classList.toggle('active', el.dataset.tab === tabName));
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
    loadTabData(tabName);
}

async function loadTabData(tab) {
    switch (tab) {
        case 'overview': await loadOverview(); break;
        case 'posts': await loadPosts(); break;
        case 'pipeline': await loadScraperConfig(); break;
        case 'settings': await Promise.all([loadConfig(), loadUsers()]); break;
    }
}

// ── Overview ────────────────────────────────────────────────────────────────

async function loadOverview() {
    const data = await api('/analytics');
    if (!data) return;
    const { daily = [], userStats = {}, categoryStats = [], topPosts = [] } = data;

    document.getElementById('kpi-posts').textContent = fmtNum(categoryStats.reduce((a, c) => a + c.count, 0));
    document.getElementById('kpi-views').textContent = fmtNum(userStats.total_views_30d ?? daily.reduce((a, d) => a + d.views, 0));
    document.getElementById('kpi-interactions').textContent = fmtNum(userStats.total_interactions || 0);
    document.getElementById('kpi-sessions').textContent = fmtNum(userStats.total_sessions || 0);

    renderActivityChart(daily);
    renderCategoryChart(categoryStats);
    renderTopChart(topPosts);
    renderMomentum(daily);
}

function makeChart(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(el, config);
}

const baseLine = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, pointStyle: 'rectRounded', usePointStyle: true } } },
    scales: {
        x: { ticks: { color: '#6E6E7A', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#6E6E7A', font: { size: 10 }, precision: 0 }, grid: { color: 'rgba(23,23,28,.05)' }, border: { display: false } },
    },
};

function renderActivityChart(daily) {
    makeChart('chart-activity', {
        type: 'line',
        data: {
            labels: daily.map(d => d.date),
            datasets: [
                { label: 'Views', data: daily.map(d => d.views), borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,.08)', fill: true, tension: .3, pointRadius: 0, borderWidth: 2 },
                { label: 'Likes', data: daily.map(d => d.likes), borderColor: '#A855F7', tension: .3, pointRadius: 0, borderWidth: 2 },
                { label: 'Shares', data: daily.map(d => d.shares), borderColor: '#EC4899', tension: .3, pointRadius: 0, borderWidth: 2 },
                { label: 'Saves', data: daily.map(d => d.saves), borderColor: '#10B981', tension: .3, pointRadius: 0, borderWidth: 2 },
            ],
        },
        options: baseLine,
    });
}

function renderCategoryChart(categoryStats) {
    makeChart('chart-category', {
        type: 'doughnut',
        data: {
            labels: categoryStats.map(c => c.category),
            datasets: [{ data: categoryStats.map(c => c.count), backgroundColor: CATEGORY_COLORS, borderWidth: 0, hoverOffset: 6 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, color: '#6E6E7A', font: { size: 11 }, usePointStyle: true, pointStyle: 'rectRounded' } } },
        },
    });
}

function renderTopChart(topPosts) {
    const top = topPosts.slice(0, 8);
    makeChart('chart-top', {
        type: 'bar',
        data: {
            labels: top.map(p => p.title.length > 46 ? p.title.slice(0, 46) + '…' : p.title),
            datasets: [{ data: top.map(p => p.engagement_score), backgroundColor: CATEGORY_COLORS, borderRadius: 6, maxBarThickness: 26 }],
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 11 } } },
            scales: {
                x: { beginAtZero: true, ticks: { color: '#6E6E7A', font: { size: 10 }, precision: 0 }, grid: { color: 'rgba(23,23,28,.05)' }, border: { display: false } },
                y: { ticks: { color: '#6E6E7A', font: { size: 10.5 } }, grid: { display: false }, border: { display: false } },
            },
        },
    });
}

// 7-day momentum vs the previous 7 days — views, likes, shares deltas
function renderMomentum(daily) {
    const el = document.getElementById('momentum');
    if (!el) return;

    const n = daily.length;
    const recent = Math.min(7, n);
    const range = (list, key, from, to) => list.slice(from, to).reduce((a, d) => a + (Number(d[key]) || 0), 0);
    const viewsNow = range(daily, 'views', n - recent, n);
    const viewsPrev = range(daily, 'views', Math.max(0, n - recent * 2), n - recent);
    const likesNow = range(daily, 'likes', n - recent, n);
    const likesPrev = range(daily, 'likes', Math.max(0, n - recent * 2), n - recent);
    const sharesNow = range(daily, 'shares', n - recent, n);
    const sharesPrev = range(daily, 'shares', Math.max(0, n - recent * 2), n - recent);

    const row = (label, now, prev) => {
        const delta = now - prev;
        const pct = prev > 0 ? Math.round((delta / prev) * 100) : (now > 0 ? 100 : 0);
        const cls = delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat';
        const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
        const pctTxt = prev > 0 || now > 0 ? `${pct > 0 ? '+' : ''}${pct}%` : '0%';
        return `<div class="momentum-row"><span class="muted small">${label}</span><b>${fmtNum(now)}</b><span class="momentum-trend ${cls}">${arrow} ${pctTxt}</span></div>`;
    };
    el.innerHTML = `
        <p class="muted small" style="margin-bottom:4px;">Last 7 days vs previous 7</p>
        ${row('Views', viewsNow, viewsPrev)}
        ${row('Likes', likesNow, likesPrev)}
        ${row('Shares', sharesNow, sharesPrev)}
    `;
}

// ── Posts ───────────────────────────────────────────────────────────────────

async function loadPosts(page = 1) {
    postsPage = page;
    const data = await api(`/posts?page=${page}&limit=${postsLimit}`);
    if (!data) return;

    const tbody = document.getElementById('posts-tbody');
    tbody.innerHTML = data.posts.map(post => `
        <tr data-search="${escapeHtml((post.title + ' ' + post.source_name + ' ' + post.category).toLowerCase())}">
            <td class="title-cell" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</td>
            <td>${escapeHtml(post.source_name)}</td>
            <td><span class="cat-dot" style="background:${CATEGORY_COLORS[CATEGORIES.indexOf(post.category) % CATEGORY_COLORS.length] || '#A855F7'}"></span>${escapeHtml(post.category)}</td>
            <td class="num">${fmtNum(post.views)}</td>
            <td class="num">${fmtNum(post.engagement_score)}</td>
            <td class="muted small">${formatDate(post.created_at)}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-ghost btn-sm edit-btn" data-id="${post.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm danger delete-btn" data-id="${post.id}">Del</button>
                </div>
            </td>
        </tr>
    `).join('');

    document.getElementById('posts-pagination-info').textContent =
        `Page ${data.page} of ${data.totalPages} · ${data.total} posts`;
    document.getElementById('prev-page').disabled = page <= 1;
    document.getElementById('next-page').disabled = page >= data.totalPages;

    tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openPostModal(btn.dataset.id)));
    tbody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deletePost(btn.dataset.id)));
}

// Client-side filter over the current page
function filterPosts() {
    const q = document.getElementById('posts-search').value.trim().toLowerCase();
    document.querySelectorAll('#posts-tbody tr').forEach(tr => {
        tr.classList.toggle('hidden', q && !tr.dataset.search.includes(q));
    });
}

// ── Post CRUD ───────────────────────────────────────────────────────────────

async function openPostModal(id = null) {
    currentPostId = id;
    document.getElementById('modal-title').textContent = id ? 'Edit Post' : 'Add Post';

    if (id) {
        // Find from paginated data — fetch single via list page search
        const data = await api(`/posts?page=${postsPage}&limit=${postsLimit}`);
        const post = data?.posts?.find(p => String(p.id) === String(id));
        if (!post) return;
        document.getElementById('post-id').value = post.id;
        document.getElementById('post-title').value = post.title || '';
        document.getElementById('post-summary').value = post.summary || '';
        document.getElementById('post-media_url').value = post.media_url || '';
        document.getElementById('post-media_type').value = post.media_type || 'text';
        document.getElementById('post-source_url').value = post.source_url || '';
        document.getElementById('post-source_name').value = post.source_name || '';
        document.getElementById('post-category').value = post.category || 'News';
    } else {
        document.getElementById('post-form').reset();
        document.getElementById('post-id').value = '';
        document.getElementById('post-category').value = 'News';
    }
    document.getElementById('post-modal').classList.remove('hidden');
}

function closePostModal() {
    document.getElementById('post-modal').classList.add('hidden');
}

async function savePost(e) {
    e.preventDefault();
    const payload = {
        title: document.getElementById('post-title').value,
        summary: document.getElementById('post-summary').value,
        media_url: document.getElementById('post-media_url').value || null,
        media_type: document.getElementById('post-media_type').value,
        source_url: document.getElementById('post-source_url').value,
        source_name: document.getElementById('post-source_name').value,
        category: document.getElementById('post-category').value,
    };
    const id = document.getElementById('post-id').value;
    try {
        if (id) await api(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
        closePostModal();
        await loadPosts(postsPage);
    } catch (err) {
        alert(err.message);
    }
}

async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    try {
        await api(`/posts/${id}`, { method: 'DELETE' });
        await loadPosts(postsPage);
    } catch (err) {
        alert(err.message);
    }
}

// ── Pipeline triggers ───────────────────────────────────────────────────────

async function runJob(endpoint, btn, runningLabel, logLine) {
    const logs = document.getElementById('scraper-logs');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = runningLabel;
    try {
        const result = await api(endpoint, { method: 'POST' });
        logs.textContent += logLine(result);
    } catch (err) {
        logs.textContent += `Error: ${err.message}\n`;
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

function triggerScrape() {
    runJob('/scrape/trigger', document.getElementById('trigger-scrape'), 'Scraping…',
        r => {
            const x = r.result || {};
            return `Scraped: ${x.saved || 0}/${x.fetched || 0} new posts in ${x.duration || 0}ms\n`;
        });
}

function triggerSummarize() {
    runJob('/summarize/trigger', document.getElementById('trigger-summarize'), 'Summarizing…',
        r => {
            const x = r.result || {};
            if (x.skipped === 'missing_api_key') return 'Skipped: OPENROUTER_API_KEY is not set on the server (.env)\n';
            const failed = x.failed > 0 ? `, ${x.failed} excerpt fallbacks` : '';
            const deferred = x.deferred > 0 ? `, ${x.deferred} deferred (rate limit)` : '';
            return `Summarized: ${x.processed || 0}/${x.total || 0}${failed}${deferred} in ${x.duration || 0}ms\n`;
        });
}

function triggerPipeline() {
    runJob('/pipeline/trigger', document.getElementById('trigger-pipeline'), 'Running…',
        r => {
            const x = r.result || {};
            const s = x.scrapeResult || {}, m = x.summarizeResult || {}, sy = x.syncResult || {};
            return `Pipeline done: scrape ${s.saved ?? s.staged ?? 0} saved | summarized ${m.processed ?? 0} | synced ${sy.synced ?? 0}/${sy.total ?? 0} (${x.durationSeconds || '?'}s)\n`;
        });
}

function triggerSync() {
    runJob('/sync', document.getElementById('trigger-sync'), 'Syncing…',
        r => `Synced: ${r.synced || 0}/${r.total || 0} posts to Turso${r.errors > 0 ? ` (${r.errors} errors)` : ''}\n`);
}

// ── Config & users ──────────────────────────────────────────────────────────

async function loadConfig() {
    const config = await api('/config');
    if (!config) return;
    Object.entries(config).forEach(([key, value]) => {
        const el = document.getElementById(`cfg-${key}`);
        if (el) {
            if (el.type === 'checkbox') el.checked = value === 'true';
            else el.value = value;
        }
    });
}

async function loadUsers() {
    const data = await api('/users');
    if (!data) return;
    document.getElementById('users-tbody').innerHTML = data.users.map(u => `
        <tr>
            <td>${escapeHtml(u.username)}</td>
            <td><span class="muted small">${escapeHtml(u.role)}</span></td>
            <td class="muted small">${u.last_login ? formatDate(u.last_login) : 'Never'}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="muted">No users</td></tr>';
}

async function saveConfig() {
    const config = {};
    document.querySelectorAll('[id^="cfg-"]').forEach(el => {
        const key = el.id.replace('cfg-', '');
        config[key] = el.type === 'checkbox' ? String(el.checked) : el.value;
    });
    try {
        await api('/config', { method: 'PUT', body: JSON.stringify(config) });
        const btn = document.getElementById('save-config');
        btn.textContent = 'Saved ✓';
        setTimeout(() => (btn.textContent = 'Save configuration'), 1600);
    } catch (err) {
        alert(err.message);
    }
}

async function saveCronSchedule() {
    const cron = document.getElementById('cron-schedule').value;
    try {
        await api('/config', { method: 'PUT', body: JSON.stringify({ scraper_cron: cron }) });
    } catch (err) {
        alert(err.message);
    }
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
        const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        if (result) window.location.reload();
    } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

async function logout() {
    await api('/auth/logout', { method: 'POST' });
    window.location.reload();
}

function checkAuth() {
    return api('/auth/me')
        .then(user => (user?.user?.username ? user : null))
        .catch(() => null);
}

// ── Events & boot ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('login-form-el')?.addEventListener('submit', e => { e.preventDefault(); login(); });
    const passwordInput = document.getElementById('login-password');
    passwordInput?.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Category select options
    document.getElementById('post-category').innerHTML =
        CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

    const user = await checkAuth();
    if (!user) {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('dashboard-app').classList.add('hidden');
        document.getElementById('login-username')?.focus();
        return;
    }

    document.getElementById('user-display').textContent = user.user.username;
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('dashboard-app').classList.remove('hidden');

    document.querySelectorAll('.tab-link').forEach(link =>
        link.addEventListener('click', e => { e.preventDefault(); showTab(link.dataset.tab); }));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

    document.getElementById('add-post-btn')?.addEventListener('click', () => openPostModal());
    document.getElementById('post-form')?.addEventListener('submit', savePost);
    document.getElementById('close-modal')?.addEventListener('click', closePostModal);
    document.getElementById('cancel-modal')?.addEventListener('click', closePostModal);
    document.getElementById('post-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closePostModal(); });

    document.getElementById('trigger-scrape')?.addEventListener('click', triggerScrape);
    document.getElementById('trigger-summarize')?.addEventListener('click', triggerSummarize);
    document.getElementById('trigger-pipeline')?.addEventListener('click', triggerPipeline);
    document.getElementById('trigger-sync')?.addEventListener('click', triggerSync);
    document.getElementById('save-cron')?.addEventListener('click', saveCronSchedule);
    document.getElementById('save-config')?.addEventListener('click', saveConfig);
    document.getElementById('prev-page')?.addEventListener('click', () => loadPosts(postsPage - 1));
    document.getElementById('next-page')?.addEventListener('click', () => loadPosts(postsPage + 1));
    document.getElementById('posts-search')?.addEventListener('input', filterPosts);

    const params = new URLSearchParams(window.location.search);
    showTab(['overview', 'posts', 'pipeline', 'settings'].includes(params.get('tab')) ? params.get('tab') : 'overview');
});
