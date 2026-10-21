const API_BASE = '/admin/api';

let currentTab = 'posts';
let postsPage = 1;
let postsLimit = 20;
let currentPostId = null;

async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        credentials: 'include',
        ...options,
    });
    
    if (res.status === 401) {
        window.location.href = '/admin/';
        return null;
    }
    
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    
    return res.json();
}

function showTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    
    document.getElementById('page-title').textContent = 
        tabName.charAt(0).toUpperCase() + tabName.slice(1);
    
    loadTabData(tabName);
}

async function loadTabData(tab) {
    switch (tab) {
        case 'posts': await loadPosts(); break;
        case 'scraper': await loadScraperConfig(); break;
        case 'analytics': await loadAnalytics(); break;
        case 'settings': await loadConfig(); break;
        case 'users': await loadUsers(); break;
    }
}

async function loadPosts(page = 1) {
    postsPage = page;
    const data = await api(`/posts?page=${page}&limit=${postsLimit}`);
    if (!data) return;
    
    const tbody = document.getElementById('posts-tbody');
    tbody.innerHTML = data.posts.map(post => `
        <tr>
            <td class="font-mono text-sm">${post.id}</td>
            <td class="max-w-xs truncate" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</td>
            <td>${escapeHtml(post.source_name)}</td>
            <td><span class="badge ${getBadgeClass(post.category)}">${escapeHtml(post.category)}</span></td>
            <td class="font-mono">${post.engagement_score || 0}</td>
            <td class="font-mono">${post.views || 0}</td>
            <td class="text-sm">${formatDate(post.created_at)}</td>
            <td>
                <div class="flex items-center gap-2">
                    <button class="edit-btn p-1.5 text-ig-400 hover:text-ig-primary transition-colors" data-id="${post.id}" aria-label="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="delete-btn p-1.5 text-ig-400 hover:text-ig-danger transition-colors" data-id="${post.id}" aria-label="Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('posts-pagination-info').textContent = 
        `Page ${data.page} of ${data.totalPages} (${data.total} total)`;
    document.getElementById('prev-page').disabled = page <= 1;
    document.getElementById('next-page').disabled = page >= data.totalPages;
    
    tbody.querySelectorAll('.edit-btn').forEach(btn => 
        btn.addEventListener('click', () => openPostModal(btn.dataset.id))
    );
    tbody.querySelectorAll('.delete-btn').forEach(btn => 
        btn.addEventListener('click', () => deletePost(btn.dataset.id))
    );
}

async function loadScraperConfig() {
    const config = await api('/config');
    if (config) {
        document.getElementById('cron-schedule').value = config.scraper_cron || '*/30 * * * *';
    }
}

async function loadAnalytics() {
    const [analytics, userStats, categoryStats, topPosts] = await Promise.all([
        api('/analytics'),
        api('/analytics').then(r => r?.userStats),
        api('/analytics').then(r => r?.categoryStats),
        api('/analytics').then(r => r?.topPosts),
    ]);
    
    if (!analytics) return;
    
    document.getElementById('stat-sessions').textContent = userStats?.total_sessions || 0;
    document.getElementById('stat-interactions').textContent = userStats?.total_interactions || 0;
    document.getElementById('stat-posts').textContent = categoryStats?.reduce((a, c) => a + c.count, 0) || 0;
    document.getElementById('stat-engagement').textContent = topPosts?.reduce((a, p) => a + p.engagement_score, 0) || 0;
    
    const dailyEl = document.getElementById('analytics-daily');
    dailyEl.innerHTML = analytics.daily?.map(d => `
        <div class="flex justify-between text-sm">
            <span>${d.date}</span>
            <span class="font-mono">Views: ${d.views} · Likes: ${d.likes} · Shares: ${d.shares} · Saves: ${d.saves}</span>
        </div>
    `).join('') || '<p class="text-ig-400 text-center py-4">No data</p>';
    
    const topTbody = document.getElementById('top-posts-tbody');
    topTbody.innerHTML = topPosts?.map(p => `
        <tr>
            <td class="max-w-xs truncate" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</td>
            <td><span class="badge ${getBadgeClass(p.category)}">${escapeHtml(p.category)}</span></td>
            <td class="font-mono">${p.views}</td>
            <td class="font-mono">${p.likes}</td>
            <td class="font-mono">${p.shares}</td>
            <td class="font-mono">${p.saves}</td>
            <td class="font-mono font-semibold">${p.engagement_score}</td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-ig-400 py-4">No data</td></tr>';
    
    const catEl = document.getElementById('category-stats');
    catEl.innerHTML = categoryStats?.map(c => `
        <div class="text-center p-3 bg-ig-50 dark:bg-ig-elevated rounded-lg">
            <p class="text-2xl font-bold text-ig-primary">${c.count}</p>
            <p class="text-xs text-ig-400">${escapeHtml(c.category)}</p>
        </div>
    `).join('') || '<p class="text-ig-400 text-center py-4">No data</p>';
}

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
    
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = data.users.map(u => `
        <tr>
            <td class="font-mono">${u.id}</td>
            <td>${escapeHtml(u.username)}</td>
            <td><span class="badge badge-memes">${escapeHtml(u.role)}</span></td>
            <td>${formatDate(u.created_at)}</td>
            <td>${u.last_login ? formatDate(u.last_login) : 'Never'}</td>
        </tr>
    `).join('');
}

function getBadgeClass(category) {
    const map = {
        'Memes': 'badge-memes',
        'Culture': 'badge-culture',
        'Tech': 'badge-tech',
        'Entertainment': 'badge-entertainment',
        'News': 'badge-news',
        'Sports': 'badge-sports',
    };
    return map[category] || 'badge-memes';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    try {
        return new Date(dateStr).toLocaleDateString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric' 
        });
    } catch {
        return dateStr;
    }
}

function openPostModal(id = null) {
    currentPostId = id;
    const modal = document.getElementById('post-modal');
    const form = document.getElementById('post-form');
    const title = document.getElementById('modal-title');
    
    form.reset();
    document.getElementById('post-id').value = '';
    
    if (id) {
        title.textContent = 'Edit Post';
        api(`/posts/${id}`).then(post => {
            if (post) {
                document.getElementById('post-id').value = post.id;
                document.getElementById('post-title').value = post.title;
                document.getElementById('post-summary').value = post.summary;
                document.getElementById('post-media_url').value = post.media_url || '';
                document.getElementById('post-media_type').value = post.media_type || 'text';
                document.getElementById('post-source_url').value = post.source_url;
                document.getElementById('post-source_name').value = post.source_name;
                document.getElementById('post-category').value = post.category;
            }
        });
    } else {
        title.textContent = 'Add Post';
    }
    
    modal.classList.remove('hidden');
}

function closePostModal() {
    document.getElementById('post-modal').classList.add('hidden');
    currentPostId = null;
}

async function savePost(e) {
    e.preventDefault();
    const id = document.getElementById('post-id').value;
    const data = {
        title: document.getElementById('post-title').value,
        summary: document.getElementById('post-summary').value,
        media_url: document.getElementById('post-media_url').value || null,
        media_type: document.getElementById('post-media_type').value,
        source_url: document.getElementById('post-source_url').value,
        source_name: document.getElementById('post-source_name').value,
        category: document.getElementById('post-category').value,
    };
    
    try {
        if (id) {
            await api(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
            await api('/posts', { method: 'POST', body: JSON.stringify(data) });
        }
        closePostModal();
        await loadPosts(postsPage);
    } catch (err) {
        alert(err.message);
    }
}

async function deletePost(id) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
        await api(`/posts/${id}`, { method: 'DELETE' });
        await loadPosts(postsPage);
    } catch (err) {
        alert(err.message);
    }
}

async function triggerScrape() {
    const btn = document.getElementById('trigger-scrape');
    const logs = document.getElementById('scraper-logs');
    btn.disabled = true;
    btn.textContent = 'Running...';
    logs.textContent = 'Starting scraper...\n';
    
    try {
        const result = await api('/scrape/trigger', { method: 'POST' });
        logs.textContent += `Completed: ${result.result?.saved || 0}/${result.result?.fetched || 0} new posts in ${result.result?.duration || 0}ms\n`;
    } catch (err) {
        logs.textContent += `Error: ${err.message}\n`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Run Scraper Now';
    }
}

async function saveConfig() {
    const config = {};
    document.querySelectorAll('[id^="cfg-"]').forEach(el => {
        const key = el.id.replace('cfg-', '');
        config[key] = el.type === 'checkbox' ? String(el.checked) : el.value;
    });
    
    try {
        await api('/config', { method: 'PUT', body: JSON.stringify(config) });
        alert('Configuration saved');
    } catch (err) {
        alert(err.message);
    }
}

async function saveCronSchedule() {
    const cron = document.getElementById('cron-schedule').value;
    try {
        await api('/config', { method: 'PUT', body: JSON.stringify({ scraper_cron: cron }) });
        alert('Cron schedule updated');
    } catch (err) {
        alert(err.message);
    }
}

async function logout() {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/admin/';
}

function checkAuth() {
    return api('/auth/me').then(user => {
        if (user) {
            document.getElementById('user-display').textContent = user.user.username;
            return true;
        }
        return false;
    }).catch(() => false);
}

document.addEventListener('DOMContentLoaded', async () => {
    const authed = await checkAuth();
    if (!authed) return;
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showTab(link.dataset.tab);
        });
    });
    
    document.getElementById('add-post-btn')?.addEventListener('click', () => openPostModal());
    document.getElementById('post-form')?.addEventListener('submit', savePost);
    document.getElementById('close-modal')?.addEventListener('click', closePostModal);
    document.getElementById('cancel-modal')?.addEventListener('click', closePostModal);
    document.getElementById('trigger-scrape')?.addEventListener('click', triggerScrape);
    document.getElementById('save-config')?.addEventListener('click', saveConfig);
    document.getElementById('cron-schedule')?.addEventListener('change', saveCronSchedule);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('prev-page')?.addEventListener('click', () => loadPosts(postsPage - 1));
    document.getElementById('next-page')?.addEventListener('click', () => loadPosts(postsPage + 1));
    
    document.getElementById('post-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePostModal();
    });
    
    showTab('posts');
});