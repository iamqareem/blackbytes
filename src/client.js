// ─── Session ────────────────────────────────────────────────────────────────
let sessionId = localStorage.getItem('session_id');
if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('session_id', sessionId);
}

// ─── State ───────────────────────────────────────────────────────────────────
let currentCursor = null;
let isLoading = false;
let hasMore = true;
let activeIndex = -1;
let cardsData = [];

// Interaction state: { [postId]: { like: bool, save: bool, reaction: emoji|null } }
// This merges server state (other users' counts) + local session state
const interactionState = {};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const feed = document.getElementById('feed');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('empty-state');
const cookieBanner = document.getElementById('cookie-banner');
const cookieAccept = document.getElementById('cookie-accept');
const cookieDecline = document.getElementById('cookie-decline');
const emojiTrigger = document.getElementById('emoji-trigger');
const emojiPicker = document.getElementById('emoji-picker');
const progressDots = document.getElementById('progress-dots');

const actionLikeBtn = document.querySelector('.action-btn[data-action="like"]');
const actionSaveBtn = document.querySelector('.action-btn[data-action="save"]');
const actionShareBtn = document.querySelector('.action-btn[data-action="share"]');
const likeCount = document.getElementById('like-count');
const saveCount = document.getElementById('save-count');
const shareCount = document.getElementById('share-count');

const EMOJIS = [
    { char: '😂', label: 'Dying' },
    { char: '🔥', label: 'Fire' },
    { char: '😭', label: 'Crying' },
    { char: '💀', label: 'Dead' },
    { char: '💅', label: "Slay" },
    { char: '🤝', label: 'Facts' },
    { char: '🫡', label: 'Respect' },
    { char: '✨', label: 'Vibe' },
    { char: '👀', label: 'Watching' },
    { char: '❤️', label: 'Love' },
];

// ─── Feed Fetch ───────────────────────────────────────────────────────────────
async function fetchFeed(cursor = null) {
    if (isLoading || !hasMore) return;
    isLoading = true;

    try {
        const params = new URLSearchParams({ session_id: sessionId, limit: '20' });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(`/api/feed?${params}`);
        const data = await response.json();

        if (data.posts && data.posts.length > 0) {
            const newPosts = data.posts.filter(p => !p.ad);
            const startIdx = cardsData.length;
            cardsData.push(...newPosts);
            currentCursor = data.next_cursor;
            hasMore = data.posts.length === 20;

            renderCards(startIdx);
            loader.classList.add('hidden');

            // Fetch interaction state for new posts
            const newIds = newPosts.map(p => p.id);
            await fetchInteractionState(newIds);

            // Activate first card
            if (activeIndex === -1 && cardsData.length > 0) {
                setActiveCard(0);
            }
        } else {
            hasMore = false;
            loader.classList.add('hidden');
            if (cardsData.length === 0) {
                emptyState.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('Feed fetch error:', err);
        loader.classList.add('hidden');
        if (cardsData.length === 0) {
            emptyState.classList.remove('hidden');
        }
    } finally {
        isLoading = false;
    }
}

// Fetch persisted interaction state for a batch of post IDs
async function fetchInteractionState(postIds) {
    if (!postIds || postIds.length === 0) return;
    try {
        const params = new URLSearchParams({
            session_id: sessionId,
            post_ids: postIds.join(','),
        });
        const res = await fetch(`/api/interactions?${params}`);
        const data = await res.json();

        // Merge into local state
        for (const [postIdStr, actions] of Object.entries(data.interactions || {})) {
            const postId = parseInt(postIdStr);
            if (!interactionState[postId]) interactionState[postId] = {};
            Object.assign(interactionState[postId], actions);
        }

        // Store reaction data on card DOM elements
        for (const [postIdStr, reactions] of Object.entries(data.reactions || {})) {
            const postId = parseInt(postIdStr);
            if (!interactionState[postId]) interactionState[postId] = {};
            interactionState[postId].reactions = reactions;
        }

        // If active card is one of these, refresh its action bar state
        if (activeIndex >= 0 && activeIndex < cardsData.length) {
            const activePost = cardsData[activeIndex];
            if (postIds.includes(activePost.id)) {
                updateActionBar(activePost);
            }
        }
    } catch (err) {
        console.debug('Interaction state fetch failed:', err.message);
    }
}

// ─── Card Rendering ───────────────────────────────────────────────────────────
function renderCards(startIdx = 0) {
    const fragment = document.createDocumentFragment();

    for (let i = startIdx; i < cardsData.length; i++) {
        const post = cardsData[i];
        const card = createFlashCard(post, i);
        fragment.appendChild(card);
    }

    feed.appendChild(fragment);
    updateProgressDots();
    setupScrollObserver();
}

function createFlashCard(post, index) {
    const article = document.createElement('article');
    article.className = 'feed-card';
    article.dataset.index = index;
    article.dataset.postId = post.id;

    // Background media
    const bgHtml = getBackgroundHtml(post);

    // Reaction pills (populated after interaction state loaded)
    const reactionsHtml = `<div class="feed-card-reactions" id="reactions-${post.id}"></div>`;

    article.innerHTML = `
        ${bgHtml}
        <div class="feed-card-scrim"></div>
        <div class="feed-card-content">
            <div class="feed-card-source-row">
                <span class="feed-card-source">${escapeHtml(post.source_name)}</span>
                <div class="feed-card-dot"></div>
                <span class="feed-card-category">${escapeHtml(post.category)}</span>
            </div>
            <h2 class="feed-card-title">${escapeHtml(post.title)}</h2>
            <p class="feed-card-summary">${escapeHtml(post.summary)}</p>
            ${reactionsHtml}
            <a href="${post.source_url}" target="_blank" rel="noopener noreferrer" class="feed-card-link" aria-label="View source">
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                View Source
            </a>
        </div>
    `;

    return article;
}

function getBackgroundHtml(post) {
    const { media_url, media_type, source_url, title } = post;

    // YouTube Shorts — 9:16 iframe
    if (media_type === 'shorts' && source_url) {
        const videoId = extractYouTubeId(source_url);
        if (videoId) {
            return `<iframe
                class="feed-card-bg-iframe"
                src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                loading="lazy"
                title="${escapeHtml(title)}"></iframe>`;
        }
    }

    // YouTube embed
    if (media_type === 'embed' && source_url && (source_url.includes('youtube.com') || source_url.includes('youtu.be'))) {
        const videoId = extractYouTubeId(source_url);
        if (videoId) {
            return `<iframe
                class="feed-card-bg-iframe"
                src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                loading="lazy"
                title="${escapeHtml(title)}"></iframe>`;
        }
    }

    // TikTok embed
    if (media_type === 'embed' && source_url && source_url.includes('tiktok.com')) {
        const videoId = source_url.match(/\/video\/(\d+)/)?.[1] || source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
        if (videoId) {
            return `<iframe
                class="feed-card-bg-iframe"
                src="https://www.tiktok.com/embed/${videoId}"
                allowfullscreen
                loading="lazy"
                title="${escapeHtml(title)}"></iframe>`;
        }
    }

    // Image background
    if (media_url) {
        return `<img
            class="feed-card-bg"
            src="${escapeHtml(media_url)}"
            alt="${escapeHtml(title)}"
            loading="lazy"
            decoding="async">`;
    }

    // Placeholder gradient
    const gradients = {
        'Memes': 'linear-gradient(135deg, #1a0533 0%, #0d001a 100%)',
        'Culture': 'linear-gradient(135deg, #001a33 0%, #00052a 100%)',
        'Tech': 'linear-gradient(135deg, #001f3f 0%, #000d1a 100%)',
        'Entertainment': 'linear-gradient(135deg, #1a0a00 0%, #0d0500 100%)',
        'News': 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        'Sports': 'linear-gradient(135deg, #001a00 0%, #000d00 100%)',
    };
    const gradient = gradients[post.category] || gradients['News'];
    return `<div class="feed-card-placeholder" style="background: ${gradient};"></div>`;
}

function extractYouTubeId(url) {
    return url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || null;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Progress Dots ────────────────────────────────────────────────────────────
const MAX_DOTS = 12;

function updateProgressDots() {
    if (cardsData.length <= 1) {
        progressDots.innerHTML = '';
        return;
    }
    const count = Math.min(cardsData.length, MAX_DOTS);
    progressDots.innerHTML = Array.from({ length: count }, (_, i) =>
        `<div class="progress-dot${i === Math.min(activeIndex, MAX_DOTS - 1) ? ' active' : ''}"></div>`
    ).join('');
}

function updateProgressDotsActive() {
    const dots = progressDots.querySelectorAll('.progress-dot');
    dots.forEach((dot, i) => {
        const targetIdx = Math.min(activeIndex, MAX_DOTS - 1);
        dot.classList.toggle('active', i === targetIdx);
    });
}

// ─── Scroll Observer (snap-scroll active card detection) ─────────────────────
let scrollObserver = null;

function setupScrollObserver() {
    if (scrollObserver) scrollObserver.disconnect();

    scrollObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                const idx = parseInt(entry.target.dataset.index);
                if (idx !== activeIndex) {
                    setActiveCard(idx);
                }
            }
        }
    }, {
        root: feed,
        threshold: [0.55, 0.85],
        rootMargin: '0px',
    });

    feed.querySelectorAll('.feed-card').forEach(card => scrollObserver.observe(card));
}

function setActiveCard(index) {
    const prevCard = feed.querySelector('.feed-card.is-active');
    if (prevCard) prevCard.classList.remove('is-active');

    activeIndex = index;
    const card = feed.querySelector(`.feed-card[data-index="${index}"]`);
    if (card) {
        card.classList.add('is-active');
        // Track view
        const post = cardsData[index];
        if (post) {
            trackInteraction(post.id, 'view');
            updateActionBar(post);
            updateReactionPills(post.id);
        }
    }

    updateProgressDotsActive();

    // Pre-fetch more cards when near end
    if (index >= cardsData.length - 4) {
        fetchFeed(currentCursor);
    }
}

// ─── Action Bar ───────────────────────────────────────────────────────────────
function updateActionBar(post) {
    const state = interactionState[post.id] || {};

    // Like
    const isLiked = !!state.like;
    actionLikeBtn.classList.toggle('active', isLiked);
    const totalLikes = post.likes || 0;
    likeCount.textContent = totalLikes > 0 ? fmtCount(totalLikes) : '';
    likeCount.classList.toggle('hidden', totalLikes === 0);

    // Save
    const isSaved = !!state.save;
    actionSaveBtn.classList.toggle('active', isSaved);
    const totalSaves = post.saves || 0;
    saveCount.textContent = totalSaves > 0 ? fmtCount(totalSaves) : '';
    saveCount.classList.toggle('hidden', totalSaves === 0);

    // Share
    const totalShares = post.shares || 0;
    shareCount.textContent = totalShares > 0 ? fmtCount(totalShares) : '';
    shareCount.classList.toggle('hidden', totalShares === 0);

    // Emoji trigger reflects active reaction
    const myReaction = state.reaction;
    emojiTrigger.textContent = myReaction || '😊';
}

function fmtCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
}

function updateReactionPills(postId) {
    const container = document.getElementById(`reactions-${postId}`);
    if (!container) return;
    const state = interactionState[postId] || {};
    const reactions = state.reactions || [];

    if (reactions.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Show top 3 reactions
    const top = reactions.slice(0, 3);
    container.innerHTML = top.map(r =>
        `<div class="feed-card-reaction-pill">
            <span>${r.emoji}</span>
            <span>${fmtCount(r.count)}</span>
        </div>`
    ).join('');
}

// ─── Interaction Handler ──────────────────────────────────────────────────────
async function handleInteraction(postId, action, btn) {
    if (btn?.classList.contains('_loading')) return;
    if (btn) btn.classList.add('_loading');

    const post = cardsData.find(p => p.id === postId);
    if (!post) { if (btn) btn.classList.remove('_loading'); return; }

    try {
        const res = await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                post_id: postId,
                action_type: action,
                payload: { post_id: postId },
            }),
        });

        if (res.ok) {
            const data = await res.json();
            if (!interactionState[postId]) interactionState[postId] = {};

            if (action === 'like') {
                const wasLiked = interactionState[postId].like;
                interactionState[postId].like = !wasLiked;
                // Update count optimistically
                post.likes = Math.max(0, (post.likes || 0) + (wasLiked ? -1 : 1));
                // Heart animation
                if (!wasLiked) {
                    actionLikeBtn.querySelector('svg').classList.add('heart-beat');
                    setTimeout(() => actionLikeBtn.querySelector('svg').classList.remove('heart-beat'), 500);
                }
            } else if (action === 'save') {
                interactionState[postId].save = !interactionState[postId].save;
                post.saves = Math.max(0, (post.saves || 0) + (interactionState[postId].save ? 1 : -1));
                showToast(interactionState[postId].save ? '🔖 Saved!' : 'Unsaved');
            } else if (action === 'share') {
                post.shares = (post.shares || 0) + 1;
            }

            updateActionBar(post);
        }
    } catch (err) {
        console.error('Interaction error:', err);
    } finally {
        if (btn) btn.classList.remove('_loading');
    }
}

async function handleReaction(emoji, postId) {
    if (!postId) return;
    if (!interactionState[postId]) interactionState[postId] = {};

    // Optimistic update
    interactionState[postId].reaction = emoji;
    emojiTrigger.textContent = emoji;

    try {
        await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                post_id: postId,
                action_type: 'reaction',
                payload: { emoji, post_id: postId },
            }),
        });

        // Re-fetch reactions for this post to show updated community reactions
        await fetchInteractionState([postId]);
        updateReactionPills(postId);
    } catch (err) {
        console.debug('Reaction error:', err.message);
    }
}

async function sharePost(postId) {
    try {
        const res = await fetch(`/api/share/${postId}/whatsapp`);
        const data = await res.json();

        if (navigator.share) {
            await navigator.share({
                title: 'Blackbytes',
                text: data.text,
                url: window.location.origin + '/?post=' + postId,
            });
        } else if (data.web_link) {
            window.open(data.web_link, '_blank');
        }

        await handleInteraction(postId, 'share', actionShareBtn);
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Share error:', err);
    }
}

async function trackInteraction(postId, action) {
    try {
        await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                post_id: postId,
                action_type: action,
                payload: { post_id: postId },
            }),
        });
    } catch (_) { /* silent */ }
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
function setupEmojiPicker() {
    emojiPicker.innerHTML = EMOJIS.map(e =>
        `<button class="emoji-btn" data-emoji="${e.char}" aria-label="${e.label}" role="menuitem">${e.char}</button>`
    ).join('');

    emojiTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = emojiPicker.classList.toggle('open');
        emojiTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    emojiPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-btn');
        if (btn && activeIndex >= 0 && activeIndex < cardsData.length) {
            const post = cardsData[activeIndex];
            handleReaction(btn.dataset.emoji, post.id);
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

// ─── Cookie Consent ───────────────────────────────────────────────────────────
function setupCookieConsent() {
    if (!localStorage.getItem('cookie_consent')) {
        setTimeout(() => cookieBanner.classList.add('open'), 1500);
    }

    cookieAccept.addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'accepted');
        cookieBanner.classList.remove('open');
    });

    cookieDecline.addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'declined');
        cookieBanner.classList.remove('open');
    });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
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

// ─── Service Worker ───────────────────────────────────────────────────────────
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.debug('SW registration failed:', err));
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
    setupEmojiPicker();
    setupCookieConsent();
    registerServiceWorker();
    fetchFeed();

    actionLikeBtn.addEventListener('click', () => {
        if (activeIndex >= 0 && activeIndex < cardsData.length) {
            handleInteraction(cardsData[activeIndex].id, 'like', actionLikeBtn);
        }
    });

    actionSaveBtn.addEventListener('click', () => {
        if (activeIndex >= 0 && activeIndex < cardsData.length) {
            handleInteraction(cardsData[activeIndex].id, 'save', actionSaveBtn);
        }
    });

    actionShareBtn.addEventListener('click', () => {
        if (activeIndex >= 0 && activeIndex < cardsData.length) {
            sharePost(cardsData[activeIndex].id);
        }
    });

    // Keyboard navigation (accessibility)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'j') {
            const nextIdx = Math.min(activeIndex + 1, cardsData.length - 1);
            const nextCard = feed.querySelector(`.feed-card[data-index="${nextIdx}"]`);
            if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth' });
        }
        if (e.key === 'ArrowUp' || e.key === 'k') {
            const prevIdx = Math.max(activeIndex - 1, 0);
            const prevCard = feed.querySelector(`.feed-card[data-index="${prevIdx}"]`);
            if (prevCard) prevCard.scrollIntoView({ behavior: 'smooth' });
        }
        if (e.key === 'l') {
            if (activeIndex >= 0 && activeIndex < cardsData.length) {
                handleInteraction(cardsData[activeIndex].id, 'like', actionLikeBtn);
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { sessionId, fetchFeed };