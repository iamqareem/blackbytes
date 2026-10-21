let sessionId = localStorage.getItem('session_id');
if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('session_id', sessionId);
}

let currentCursor = null;
let isLoading = false;
let hasMore = true;
let activePostId = null;
let activePostData = null;
let observer = null;

const feed = document.getElementById('feed');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('empty-state');
const cookieBanner = document.getElementById('cookie-banner');
const cookieAccept = document.getElementById('cookie-accept');
const cookieDecline = document.getElementById('cookie-decline');

const emojiTrigger = document.getElementById('emoji-trigger');
const emojiPicker = document.getElementById('emoji-picker');

const actionLikeBtn = document.querySelector('.action-btn[data-action="like"]');
const actionSaveBtn = document.querySelector('.action-btn[data-action="save"]');
const actionShareBtn = document.querySelector('.action-btn[data-action="share"]');

const EMOJIS = [
    { char: '😂', label: 'Dying' },
    { char: '😭', label: 'Crying' },
    { char: '🔥', label: 'Fire' },
    { char: '💀', label: 'Dead' },
    { char: '😭😭', label: 'Screaming' },
    { char: '💅', label: "Don't Care" },
    { char: '🤝', label: 'Facts' },
    { char: '🫡', label: 'Respect' },
    { char: '😭💀', label: "Can't" },
    { char: '✨', label: 'Slay' },
];

async function fetchFeed(cursor = null) {
    if (isLoading || !hasMore) return;
    isLoading = true;
    loader.classList.remove('hidden');
    emptyState.classList.add('hidden');

    try {
        const params = new URLSearchParams({ session_id: sessionId, limit: '20' });
        if (cursor) params.set('cursor', cursor);
        
        const response = await fetch(`/api/feed?${params}`);
        const data = await response.json();
        
        if (data.posts && data.posts.length > 0) {
            renderPosts(data.posts);
            currentCursor = data.next_cursor;
            hasMore = data.posts.length === 20;
            setupIntersectionObserver();
            if (feed.children.length > 0) emptyState.classList.add('hidden');
        } else {
            hasMore = false;
            if (feed.children.length === 0) {
                loader.classList.add('hidden');
                emptyState.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('Feed fetch error:', err);
        if (feed.children.length === 0) {
            loader.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }
    } finally {
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
    const article = document.createElement('article');
    article.className = 'card animate-fade-in';
    article.dataset.postId = post.id;
    article.dataset.postData = JSON.stringify({
        id: post.id,
        title: post.title,
        summary: post.summary,
        media_url: post.media_url,
        media_type: post.media_type,
        source_url: post.source_url,
        source_name: post.source_name,
        category: post.category,
        likes: post.likes || 0,
        shares: post.shares || 0,
        saves: post.saves || 0,
    });
    
    const mediaHtml = post.media_url ? getMediaHtml(post) : '';
    const categoryBadge = getCategoryBadge(post.category);
    
    article.innerHTML = `
        ${mediaHtml}
        <div class="card-content">
            <div class="card-meta">
                <span class="card-source">${escapeHtml(post.source_name)}</span>
                <span class="card-category">${categoryBadge}</span>
            </div>
            <h3 class="card-title">${escapeHtml(post.title)}</h3>
            <p class="card-summary">${escapeHtml(post.summary)}</p>
        </div>
    `;
    
    return article;
}

function createAdCard(ad) {
    const article = document.createElement('article');
    article.className = 'card animate-fade-in';
    article.dataset.ad = 'true';
    
    article.innerHTML = `
        <div class="card-content" style="padding: 24px; text-align: center;">
            <div class="inline-flex items-center gap-2 px-3 py-1 text-xs" style="background-color: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-full); color: var(--color-text-muted); margin-bottom: 12px;">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>
                Sponsored
            </div>
            <ins class="adsbygoogle"
                 style="display:block; min-height: 200px;"
                 data-ad-client="${ad.adsenseClient}"
                 data-ad-slot="${ad.adsenseSlot}"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
        </div>
    `;
    
    if (window.adsbygoogle) {
        setTimeout(() => (window.adsbygoogle = window.adsbygoogle || []).push({}), 0);
    }
    
    return article;
}

function getMediaHtml(post) {
    const { media_url, media_type, source_url } = post;
    
    if (!media_url) return '';
    
    if (media_type === 'embed') {
        if (source_url.includes('tiktok.com')) {
            const videoId = source_url.match(/\/video\/(\d+)/)?.[1] || source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
            if (videoId) {
                return `<div class="card-media relative"><iframe src="https://www.tiktok.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
            }
        }
        if (source_url.includes('youtube.com') || source_url.includes('youtu.be')) {
            const videoId = source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
            if (videoId) {
                return `<div class="card-media relative"><iframe src="https://www.youtube.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
            }
        }
        if (source_url.includes('twitter.com') || source_url.includes('x.com')) {
            return `<div class="card-media flex items-center justify-center"><a href="${source_url}" target="_blank" rel="noopener noreferrer" class="text-sm font-medium" style="color: var(--color-brand);">View on X →</a></div>`;
        }
    }
    
    if (media_type === 'video') {
        return `<video class="card-media" controls preload="metadata" poster="${escapeHtml(media_url)}"><source src="${escapeHtml(media_url)}" type="video/mp4"></video>`;
    }
    
    return `<img src="${escapeHtml(media_url)}" alt="${escapeHtml(post.title)}" class="card-media" loading="lazy">`;
}

function getCategoryBadge(category) {
    const map = {
        'Memes': 'Memes',
        'Culture': 'Culture',
        'Tech': 'Tech',
        'Entertainment': 'Entertainment',
        'News': 'News',
        'Sports': 'Sports',
    };
    return map[category] || 'General';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupIntersectionObserver() {
    if (observer) observer.disconnect();
    
    const cards = feed.querySelectorAll('.card:not([data-ad])');
    
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                const postId = entry.target.dataset.postId;
                const postData = JSON.parse(entry.target.dataset.postData);
                if (postId !== activePostId) {
                    activePostId = postId;
                    activePostData = postData;
                    updateActionBar(postData);
                }
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: [0.5, 0.75],
    });
    
    cards.forEach(card => observer.observe(card));
}

function updateActionBar(postData) {
    if (!postData) return;
    
    const likeCount = actionLikeBtn.querySelector('.like-count');
    const saveCount = actionSaveBtn.querySelector('.save-count');
    const shareCount = actionShareBtn.querySelector('.share-count');
    
    likeCount.textContent = postData.likes || 0;
    saveCount.textContent = postData.saves || 0;
    shareCount.textContent = postData.shares || 0;
    
    likeCount.classList.toggle('hidden', !postData.likes);
    saveCount.classList.toggle('hidden', !postData.saves);
    shareCount.classList.toggle('hidden', !postData.shares);
    
    actionLikeBtn.dataset.postId = postData.id;
    actionSaveBtn.dataset.postId = postData.id;
    actionShareBtn.dataset.postId = postData.id;
    
    if (postData.likes > 0) {
        actionLikeBtn.classList.add('active');
    } else {
        actionLikeBtn.classList.remove('active');
    }
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
                countEl.classList.remove('hidden');
            }
            
            if (action === 'like') {
                btn.classList.add('active');
            }
            
            if (action === 'share') {
                sharePost(postId);
            }
            
            if (action === 'reaction') {
                trackEvent('reaction', { post_id: postId, reaction: btn.dataset.emoji });
                showToast(`${btn.dataset.emoji} Reacted!`);
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
                title: 'Blackbytes',
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

function setupEmojiPicker() {
    emojiPicker.innerHTML = EMOJIS.map(emoji => `
        <button class="emoji-btn" 
                data-emoji="${emoji.char}" 
                data-action="reaction"
                aria-label="${emoji.label}"
                role="menuitem">
            ${emoji.char}
        </button>
    `).join('');
    
    emojiTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = emojiPicker.classList.toggle('open');
        emojiTrigger.setAttribute('aria-expanded', isOpen);
    });
    
    emojiPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-btn');
        if (btn && activePostId) {
            handleInteraction(activePostId, 'reaction', btn);
            emojiPicker.classList.remove('open');
            emojiTrigger.setAttribute('aria-expanded', 'false');
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!emojiTrigger.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.classList.remove('open');
            emojiTrigger.setAttribute('aria-expanded', 'false');
        }
    });
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
        setTimeout(() => cookieBanner.classList.add('open'), 1000);
    }
    
    cookieAccept.addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'accepted');
        cookieBanner.classList.remove('open');
        trackEvent('cookie_consent', { choice: 'accepted' });
    });
    
    cookieDecline.addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'declined');
        cookieBanner.classList.remove('open');
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

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
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
    setupEmojiPicker();
    registerServiceWorker();
    fetchFeed();
    
    actionLikeBtn.addEventListener('click', () => {
        if (activePostId) handleInteraction(activePostId, 'like', actionLikeBtn);
    });
    actionSaveBtn.addEventListener('click', () => {
        if (activePostId) handleInteraction(activePostId, 'save', actionSaveBtn);
    });
    actionShareBtn.addEventListener('click', () => {
        if (activePostId) sharePost(activePostId);
    });
    
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