let sessionId = localStorage.getItem('session_id');
if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('session_id', sessionId);
}

let currentCursor = null;
let isLoading = false;
let hasMore = true;
let activeIndex = 0;
let cardsData = [];
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
            const newCards = data.posts.filter(p => !p.ad);
            cardsData.push(...newCards);
            currentCursor = data.next_cursor;
            hasMore = data.posts.length === 20;
            renderCards();
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
        isLoading = false;
    }
}

function renderCards() {
    const startIndex = feed.children.length;
    const fragment = document.createDocumentFragment();
    
    for (let i = startIndex; i < cardsData.length; i++) {
        const post = cardsData[i];
        const card = createFeedCard(post, i);
        fragment.appendChild(card);
    }
    
    feed.appendChild(fragment);
    setupObserver();
}

function createFeedCard(post, index) {
    const article = document.createElement('article');
    article.className = 'feed-card';
    article.dataset.index = index;
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
    
    const mediaHtml = getMediaHtml(post);
    const categoryBadge = getCategoryBadge(post.category);
    const placeholderHtml = post.media_url ? '' : getPlaceholderHtml(post.category);
    
    article.innerHTML = `
        ${mediaHtml || placeholderHtml}
        <div class="feed-card-content">
            <div class="feed-card-meta">
                <span class="feed-card-source">${escapeHtml(post.source_name)}</span>
                <span class="feed-card-category">${categoryBadge}</span>
            </div>
            <h2 class="feed-card-title">${escapeHtml(post.title)}</h2>
            <p class="feed-card-summary">${escapeHtml(post.summary)}</p>
            <a href="${post.source_url}" target="_blank" rel="noopener noreferrer" class="feed-card-source-link" aria-label="View source">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                View Source
            </a>
        </div>
    `;
    
    return article;
}

function getMediaHtml(post) {
    const { media_url, media_type, source_url, title } = post;
    
    if (!media_url) return '';
    
    if (media_type === 'embed') {
        if (source_url.includes('tiktok.com')) {
            const videoId = source_url.match(/\/video\/(\d+)/)?.[1] || source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
            if (videoId) {
                return `<div class="feed-card-media embed-media"><iframe src="https://www.tiktok.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
            }
        }
        if (source_url.includes('youtube.com') || source_url.includes('youtu.be')) {
            const videoId = source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
            if (videoId) {
                return `<div class="feed-card-media embed-media"><iframe src="https://www.youtube.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
            }
        }
        if (source_url.includes('twitter.com') || source_url.includes('x.com')) {
            return `<div class="feed-card-media embed-media flex items-center justify-center"><a href="${source_url}" target="_blank" rel="noopener noreferrer" class="text-sm font-medium" style="color: var(--color-brand);">View on X →</a></div>`;
        }
    }
    
    if (media_type === 'shorts') {
        const videoId = source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
        if (videoId) {
            // Use standard embed URL with shorts=1 parameter for proper Shorts player
            return `<div class="feed-card-media embed-media" style="aspect-ratio: 9/16;">
                <iframe src="https://www.youtube.com/embed/${videoId}?shorts=1&autoplay=0&rel=0&enablejsapi=1" 
                    class="absolute inset-0 w-full h-full" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowfullscreen></iframe>
            </div>`;
        }
    }
    
    if (media_type === 'video') {
        return `<video class="feed-card-media" controls preload="metadata" poster="${escapeHtml(media_url)}"><source src="${escapeHtml(media_url)}" type="video/mp4"></video>`;
    }
    
    return `<img src="${escapeHtml(media_url)}" alt="${escapeHtml(title)}" class="feed-card-media" loading="lazy">`;
}

function getPlaceholderHtml(category) {
    const gradients = {
        'Memes': 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)',
        'Culture': 'linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%)',
        'Tech': 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
        'Entertainment': 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)',
        'News': 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
        'Sports': 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)',
    };
    const gradient = gradients[category] || gradients['Memes'];
    return `<div class="feed-card-media placeholder-media" style="background: ${gradient}; display: flex; align-items: center; justify-content: center;">
        <svg class="w-16 h-16 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
    </div>`;
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

function setupObserver() {
    if (observer) observer.disconnect();
    
    const cards = feed.querySelectorAll('.feed-card');
    
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                const index = parseInt(entry.target.dataset.index);
                if (index !== activeIndex) {
                    activeIndex = index;
                    updateActionBar(entry.target);
                }
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: [0.6, 0.8],
    });
    
    cards.forEach(card => observer.observe(card));
}

function updateActionBar(card) {
    const postData = JSON.parse(card.dataset.postData);
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
    if (btn?.classList.contains('loading')) return;
    if (btn) btn.classList.add('loading');
    
    try {
        const payload = {
            post_id: parseInt(postId),
            entity_type: 'post',
            timestamp: new Date().toISOString(),
        };
        
        const response = await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                session_id: sessionId, 
                post_id: parseInt(postId), 
                action_type: action,
                payload: JSON.stringify(payload)
            })
        });
        
        if (response.ok) {
            if (btn) {
                const countEl = btn.querySelector(`.${action}-count`);
                if (countEl) {
                    const current = parseInt(countEl.textContent) || 0;
                    countEl.textContent = current + 1;
                    countEl.classList.remove('hidden');
                }
                
                if (action === 'like') {
                    btn.classList.add('active');
                    btn.querySelector('svg').setAttribute('fill', 'currentColor');
                    btn.querySelector('svg').style.stroke = 'var(--color-brand)';
                }
                if (action === 'save') {
                    btn.classList.add('active');
                }
            }
            
            if (action === 'reaction') {
                trackEvent('reaction', { post_id: postId, reaction: btn.dataset.emoji });
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
    } finally {
        if (btn) btn.classList.remove('loading');
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
        if (btn) {
            const currentCard = feed.querySelector('.feed-card:nth-child(' + (activeIndex + 1) + ')');
            if (currentCard) {
                handleInteraction(currentCard.dataset.postId, 'reaction', btn);
            }
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
        if (activeIndex < cardsData.length) {
            handleInteraction(cardsData[activeIndex].id, 'like', actionLikeBtn);
        }
    });
    actionSaveBtn.addEventListener('click', () => {
        if (activeIndex < cardsData.length) {
            handleInteraction(cardsData[activeIndex].id, 'save', actionSaveBtn);
        }
    });
    actionShareBtn.addEventListener('click', () => {
        if (activeIndex < cardsData.length) {
            sharePost(cardsData[activeIndex].id);
        }
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