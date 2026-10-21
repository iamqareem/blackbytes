import { summarize } from './summarizer.js';

let sessionId = localStorage.getItem('session_id');
if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('session_id', sessionId);
}

let currentCursor = null;
let isLoading = false;
let hasMore = true;
const feed = document.getElementById('feed');
const loader = document.getElementById('loader');
const cookieBanner = document.getElementById('cookie-banner');
const cookieAccept = document.getElementById('cookie-accept');
const cookieDecline = document.getElementById('cookie-decline');

const CATEGORIES = ['Memes', 'Culture', 'Tech', 'Entertainment', 'News', 'Sports'];
const CATEGORY_COLORS = {
    'Memes': 'badge-memes',
    'Culture': 'badge-culture',
    'Tech': 'badge-tech',
    'Entertainment': 'badge-entertainment',
    'News': 'badge-news',
    'Sports': 'badge-sports',
};

function getCategoryBadge(category) {
    return CATEGORY_COLORS[category] || 'badge-memes';
}

async function fetchFeed(cursor = null) {
    if (isLoading || !hasMore) return;
    isLoading = true;
    loader.classList.remove('hidden');

    try {
        const params = new URLSearchParams({ session_id: sessionId, limit: '20' });
        if (cursor) params.set('cursor', cursor);
        
        const response = await fetch(`/api/feed?${params}`);
        const data = await response.json();
        
        if (data.posts && data.posts.length > 0) {
            renderPosts(data.posts);
            currentCursor = data.next_cursor;
            hasMore = data.posts.length === 20;
        } else {
            hasMore = false;
        }
    } catch (err) {
        console.error('Feed fetch error:', err);
        if (feed.children.length === 0) {
            feed.innerHTML = '<div class="text-center py-12 text-ig-400">Failed to load feed. Pull to retry.</div>';
        }
    } finally {
        isLoading = false;
        loader.classList.add('hidden');
    }
}

function renderPosts(posts) {
    const fragment = document.createDocumentFragment();
    
    posts.forEach(post => {
        if (post.ad) {
            const adCard = createAdCard(post);
            fragment.appendChild(adCard);
        } else {
            const card = createPostCard(post);
            fragment.appendChild(card);
        }
    });
    
    feed.appendChild(fragment);
}

function createPostCard(post) {
    const div = document.createElement('article');
    div.className = 'feed-card animate-fade-in relative group';
    div.dataset.postId = post.id;
    
    const mediaHtml = post.media_url ? getMediaHtml(post) : '';
    const categoryBadge = getCategoryBadge(post.category);
    
    div.innerHTML = `
        ${mediaHtml}
        <div class="p-4">
            <div class="flex items-center justify-between mb-2">
                <span class="badge ${categoryBadge}">${post.category}</span>
                <span class="text-xs text-ig-400">${post.source_name}</span>
            </div>
            <h3 class="font-semibold text-ig-900 dark:text-ig-text mb-2 line-clamp-2">${escapeHtml(post.title)}</h3>
            <p class="text-ig-700 dark:text-ig-muted text-sm leading-relaxed mb-4">${escapeHtml(post.summary)}</p>
            <div class="flex items-center justify-between pt-2 border-t border-ig-200 dark:border-ig-border">
                <div class="flex items-center gap-4">
                    <button class="interact-btn flex items-center gap-1.5 text-ig-400 hover:text-ig-danger transition-colors" data-action="like" data-post-id="${post.id}" aria-label="Like">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                        <span class="like-count">${post.likes || 0}</span>
                    </button>
                    <button class="interact-btn flex items-center gap-1.5 text-ig-400 hover:text-ig-primary transition-colors" data-action="share" data-post-id="${post.id}" aria-label="Share">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                        <span class="share-count">${post.shares || 0}</span>
                    </button>
                    <button class="interact-btn flex items-center gap-1.5 text-ig-400 hover:text-ig-warning transition-colors" data-action="save" data-post-id="${post.id}" aria-label="Save">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
                        <span class="save-count">${post.saves || 0}</span>
                    </button>
                </div>
                <a href="${post.source_url}" target="_blank" rel="noopener noreferrer" class="btn-ghost text-xs">
                    View Source
                </a>
            </div>
        </div>
    `;
    
    div.querySelectorAll('.interact-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleInteraction(btn.dataset.postId, btn.dataset.action, btn);
        });
    });
    
    return div;
}

function createAdCard(ad) {
    const div = document.createElement('article');
    div.className = 'feed-card animate-fade-in relative';
    div.dataset.ad = 'true';
    
    div.innerHTML = `
        <div class="p-4 text-center">
            <div class="inline-flex items-center gap-2 px-3 py-1 bg-ig-100 dark:bg-ig-elevated rounded-full text-xs text-ig-400 mb-3">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>
                Sponsored
            </div>
            <ins class="adsbygoogle"
                 style="display:block"
                 data-ad-client="${ad.adsenseClient}"
                 data-ad-slot="${ad.adsenseSlot}"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
        </div>
    `;
    
    if (window.adsbygoogle) {
        setTimeout(() => (window.adsbygoogle = window.adsbygoogle || []).push({}), 0);
    }
    
    return div;
}

function getMediaHtml(post) {
    const { media_url, media_type, source_url } = post;
    
    if (!media_url) return '';
    
    if (media_type === 'embed') {
        if (source_url.includes('tiktok.com')) {
            const videoId = source_url.match(/\/video\/(\d+)/)?.[1] || source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
            if (videoId) {
                return `<div class="aspect-video bg-ig-100 dark:bg-ig-elevated relative">
                    <iframe src="https://www.tiktok.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe>
                </div>`;
            }
        }
        if (source_url.includes('youtube.com') || source_url.includes('youtu.be')) {
            const videoId = source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
            if (videoId) {
                return `<div class="aspect-video bg-ig-100 dark:bg-ig-elevated relative">
                    <iframe src="https://www.youtube.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe>
                </div>`;
            }
        }
        if (source_url.includes('twitter.com') || source_url.includes('x.com')) {
            return `<div class="aspect-video bg-ig-100 dark:bg-ig-elevated flex items-center justify-center">
                <a href="${source_url}" target="_blank" rel="noopener noreferrer" class="text-ig-primary font-medium">View on X →</a>
            </div>`;
        }
    }
    
    if (media_type === 'video') {
        return `<video class="w-full aspect-video bg-ig-100 dark:bg-ig-elevated" controls preload="metadata" poster="${escapeHtml(media_url)}">
            <source src="${escapeHtml(media_url)}" type="video/mp4">
        </video>`;
    }
    
    return `<img src="${escapeHtml(media_url)}" alt="${escapeHtml(post.title)}" class="w-full aspect-video object-cover bg-ig-100 dark:bg-ig-elevated" loading="lazy">`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function handleInteraction(postId, action, btn) {
    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading');
    
    try {
        const response = await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, post_id: postId, action_type: action })
        });
        
        if (response.ok) {
            const countEl = btn.querySelector(`.${action}-count`);
            if (countEl) {
                const current = parseInt(countEl.textContent) || 0;
                countEl.textContent = current + 1;
            }
            
            if (action === 'like') {
                btn.classList.add('text-ig-danger');
                btn.classList.remove('text-ig-400');
                btn.querySelector('svg').setAttribute('fill', 'currentColor');
            }
            
            if (action === 'share') {
                sharePost(postId);
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
    } finally {
        btn.classList.remove('loading');
    }
}

async function sharePost(postId) {
    try {
        const response = await fetch(`/api/share/${postId}/whatsapp`);
        const data = await response.json();
        
        if (navigator.share) {
            await navigator.share({
                title: 'Afro Aggregator',
                text: data.text,
                url: window.location.origin + '/?post=' + postId,
            });
        } else if (data.web_link) {
            window.open(data.web_link, '_blank');
        }
    } catch (err) {
        console.error('Share error:', err);
    }
}

function setupInfiniteScroll() {
    let ticking = false;
    
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrollTop = window.scrollY || document.documentElement.scrollTop;
                const scrollHeight = document.documentElement.scrollHeight;
                const clientHeight = document.documentElement.clientHeight;
                
                if (scrollTop + clientHeight >= scrollHeight - 300) {
                    fetchFeed(currentCursor);
                }
                ticking = false;
            });
            ticking = true;
        }
    });
}

function setupCookieConsent() {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
        setTimeout(() => cookieBanner.classList.remove('hidden'), 1000);
    }
    
    cookieAccept.addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'accepted');
        cookieBanner.classList.add('hidden');
        trackEvent('cookie_consent', { choice: 'accepted' });
    });
    
    cookieDecline.addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'declined');
        cookieBanner.classList.add('hidden');
        trackEvent('cookie_consent', { choice: 'declined' });
    });
}

async function trackEvent(eventName, payload = {}) {
    try {
        await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                session_id: sessionId, 
                post_id: 0, 
                action_type: eventName,
                payload: JSON.stringify(payload)
            })
        });
    } catch (err) {
        console.debug('Analytics error:', err);
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    }
}

function init() {
    setupInfiniteScroll();
    setupCookieConsent();
    registerServiceWorker();
    fetchFeed();
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            trackEvent('session_resume');
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { sessionId, fetchFeed };