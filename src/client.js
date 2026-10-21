let sessionId = localStorage.getItem('session_id');
if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('session_id', sessionId);
}

let currentCursor = null;
let isLoading = false;
let hasMore = true;
let currentCardIndex = 0;
let cardsData = [];

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
            cardsData.push(...data.posts.filter(p => !p.ad));
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
        loader.classList.add('hidden');
    }
}

function renderCards() {
    const fragment = document.createDocumentFragment();
    
    cardsData.forEach((post, index) => {
        if (index < feed.children.length) return; // Already rendered
        const card = createSwipeCard(post, index);
        fragment.appendChild(card);
    });
    
    feed.appendChild(fragment);
    setupSwipeGestures();
}

function createSwipeCard(post, index) {
    const article = document.createElement('article');
    article.className = 'swipe-card animate-fade-in';
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
    const placeholderImg = post.media_url ? '' : getPlaceholderImage(post.category);
    
    article.innerHTML = `
        <div class="swipe-card-inner">
            ${mediaHtml || placeholderImg}
            <div class="swipe-card-content">
                <div class="swipe-card-meta">
                    <span class="swipe-card-source">${escapeHtml(post.source_name)}</span>
                    <span class="swipe-card-category">${categoryBadge}</span>
                </div>
                <h2 class="swipe-card-title">${escapeHtml(post.title)}</h2>
                <p class="swipe-card-summary">${escapeHtml(post.summary)}</p>
            </div>
            <div class="swipe-indicators">
                <div class="swipe-indicator swipe-like" aria-label="Swipe right to like">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                </div>
                <div class="swipe-indicator swipe-save" aria-label="Swipe left to save">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
                </div>
            </div>
            <div class="swipe-actions">
                <button class="swipe-action-btn" data-action="like" aria-label="Like">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                    <span class="like-count">${post.likes || 0}</span>
                </button>
                <button class="swipe-action-btn" data-action="save" aria-label="Save">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
                    <span class="save-count">${post.saves || 0}</span>
                </button>
                <button class="swipe-action-btn" data-action="share" aria-label="Share">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                    <span class="share-count">${post.shares || 0}</span>
                </button>
                <a href="${post.source_url}" target="_blank" rel="noopener noreferrer" class="swipe-action-btn swipe-source" aria-label="View source">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </a>
            </div>
        </div>
    `;
    
    return article;
}

function getMediaHtml(post) {
    const { media_url, media_type, source_url } = post;
    
    if (!media_url) return '';
    
    if (media_type === 'embed') {
        if (source_url.includes('tiktok.com')) {
            const videoId = source_url.match(/\/video\/(\d+)/)?.[1] || source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
            if (videoId) {
                return `<div class="swipe-card-media relative"><iframe src="https://www.tiktok.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
            }
        }
        if (source_url.includes('youtube.com') || source_url.includes('youtu.be')) {
            const videoId = source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
            if (videoId) {
                return `<div class="swipe-card-media relative"><iframe src="https://www.youtube.com/embed/${videoId}" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
            }
        }
        if (source_url.includes('twitter.com') || source_url.includes('x.com')) {
            return `<div class="swipe-card-media flex items-center justify-center"><a href="${source_url}" target="_blank" rel="noopener noreferrer" class="text-sm font-medium" style="color: var(--color-brand);">View on X →</a></div>`;
        }
    }
    
    if (media_type === 'video') {
        return `<video class="swipe-card-media" controls preload="metadata" poster="${escapeHtml(media_url)}"><source src="${escapeHtml(media_url)}" type="video/mp4"></video>`;
    }
    
    return `<img src="${escapeHtml(media_url)}" alt="${escapeHtml(post.title)}" class="swipe-card-media" loading="lazy">`;
}

function getPlaceholderImage(category) {
    const gradients = {
        'Memes': 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)',
        'Culture': 'linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%)',
        'Tech': 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
        'Entertainment': 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)',
        'News': 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
        'Sports': 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)',
    };
    const gradient = gradients[category] || gradients['Memes'];
    return `<div class="swipe-card-media placeholder-media" style="background: ${gradient}; display: flex; align-items: center; justify-content: center;">
        <svg class="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
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

function setupSwipeGestures() {
    const cards = feed.querySelectorAll('.swipe-card');
    
    cards.forEach((card, index) => {
        if (card.dataset.swipeInitialized) return;
        card.dataset.swipeInitialized = 'true';
        
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let isDragging = false;
        let lastTap = 0;
        
        const inner = card.querySelector('.swipe-card-inner');
        const likeIndicator = card.querySelector('.swipe-like');
        const saveIndicator = card.querySelector('.swipe-save');
        
        // Touch events
        inner.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
            inner.style.transition = 'none';
            
            // Double tap detection
            const now = Date.now();
            if (now - lastTap < 300) {
                handleInteraction(card.dataset.postId, 'like', card.querySelector('[data-action="like"]'));
                showLikeAnimation(card);
            }
            lastTap = now;
        }, { passive: true });
        
        inner.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentX = e.touches[0].clientX - startX;
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            
            // Prevent horizontal swipe if vertical scroll
            if (deltaY > Math.abs(currentX)) {
                isDragging = false;
                return;
            }
            
            e.preventDefault();
            
            const rotate = currentX / 15;
            inner.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
            
            // Show indicators
            const threshold = 80;
            if (currentX > threshold) {
                likeIndicator.style.opacity = Math.min((currentX - threshold) / 100, 1);
                likeIndicator.style.transform = 'scale(1)';
            } else {
                likeIndicator.style.opacity = '0';
                likeIndicator.style.transform = 'scale(0.8)';
            }
            
            if (currentX < -threshold) {
                saveIndicator.style.opacity = Math.min((-currentX - threshold) / 100, 1);
                saveIndicator.style.transform = 'scale(1)';
            } else {
                saveIndicator.style.opacity = '0';
                saveIndicator.style.transform = 'scale(0.8)';
            }
        }, { passive: false });
        
        inner.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            
            inner.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            likeIndicator.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            saveIndicator.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            
            const threshold = 120;
            
            if (currentX > threshold) {
                // Swipe right - Like
                inner.style.transform = `translateX(${window.innerWidth + 100}px) rotate(30deg)`;
                setTimeout(() => {
                    handleInteraction(card.dataset.postId, 'like', card.querySelector('[data-action="like"]'));
                    removeCard(card);
                }, 150);
            } else if (currentX < -threshold) {
                // Swipe left - Save
                inner.style.transform = `translateX(-${window.innerWidth + 100}px) rotate(-30deg)`;
                setTimeout(() => {
                    handleInteraction(card.dataset.postId, 'save', card.querySelector('[data-action="save"]'));
                    removeCard(card);
                }, 150);
            } else {
                // Snap back
                inner.style.transform = 'translateX(0) rotate(0deg)';
            }
            
            likeIndicator.style.opacity = '0';
            likeIndicator.style.transform = 'scale(0.8)';
            saveIndicator.style.opacity = '0';
            saveIndicator.style.transform = 'scale(0.8)';
        });
        
        // Click handlers for action buttons
        card.querySelectorAll('.swipe-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'share') {
                    sharePost(card.dataset.postId);
                } else {
                    handleInteraction(card.dataset.postId, action, btn);
                }
            });
        });
    });
}

function removeCard(card) {
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-20px)';
    setTimeout(() => {
        card.remove();
        checkLoadMore();
    }, 300);
}

function checkLoadMore() {
    const remainingCards = feed.querySelectorAll('.swipe-card').length;
    if (remainingCards < 3 && hasMore && !isLoading) {
        fetchFeed(currentCursor);
    }
}

function showLikeAnimation(card) {
    const heart = document.createElement('div');
    heart.className = 'like-animation';
    heart.innerHTML = '<svg class="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    heart.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        color: var(--color-brand);
        pointer-events: none;
        z-index: 10;
        animation: heartPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    `;
    card.querySelector('.swipe-card-inner').appendChild(heart);
    setTimeout(() => heart.remove(), 600);
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
            const currentCard = feed.querySelector('.swipe-card');
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
    // For swipe cards, we load more when running low
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
    setupCookieConsent();
    setupEmojiPicker();
    registerServiceWorker();
    fetchFeed();
    
    actionLikeBtn.addEventListener('click', () => {
        const currentCard = feed.querySelector('.swipe-card');
        if (currentCard) handleInteraction(currentCard.dataset.postId, 'like', actionLikeBtn);
    });
    actionSaveBtn.addEventListener('click', () => {
        const currentCard = feed.querySelector('.swipe-card');
        if (currentCard) handleInteraction(currentCard.dataset.postId, 'save', actionSaveBtn);
    });
    actionShareBtn.addEventListener('click', () => {
        const currentCard = feed.querySelector('.swipe-card');
        if (currentCard) sharePost(currentCard.dataset.postId);
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