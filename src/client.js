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

// ─── Theme ───────────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
const THEME_SUN = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>';
const THEME_MOON = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>';

function applyTheme(theme) {
    const light = theme === 'light';
    document.documentElement.classList.toggle('light', light);
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#FFFFFF' : '#000000');
    if (themeToggle) themeToggle.innerHTML = light ? THEME_MOON : THEME_SUN;
}

applyTheme(localStorage.getItem('theme') || 'dark');
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
    });
}

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
            hasMore = data.next_cursor !== null && data.next_cursor !== undefined && newPosts.length > 0;

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

    // Image box above the text
    const mediaBoxHtml = getMediaBoxHtml(post);

    // Reaction pills (populated after interaction state loads)
    const reactionsHtml = `<div class="feed-card-reactions" id="reactions-${post.id}"></div>`;

    article.innerHTML = `
        ${mediaBoxHtml}
        <div class="feed-card-content">
            <div class="feed-card-source-row">
                <span class="feed-card-source">${escapeHtml(post.source_name)}</span>
                <div class="feed-card-dot"></div>
                <span class="feed-card-category">${escapeHtml(post.category)}</span>
            </div>
            <h2 class="feed-card-title">${escapeHtml(post.title)}</h2>
            ${post.summary ? `<p class="feed-card-summary">${escapeHtml(post.summary)}</p>` : ''}
            ${reactionsHtml}
            <a href="${escapeHtml(post.source_url)}" target="_blank" rel="noopener noreferrer"
               class="feed-card-link" aria-label="Read full story from ${escapeHtml(post.source_name)}">
                <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                Read on ${escapeHtml(post.source_name)}
            </a>
        </div>
    `;

    return article;
}

function getMediaBoxHtml(post) {
    const { media_url, media_type, source_url, title, category } = post;

    // Vertical (Shorts / TikTok) — taller box
    const isVertical = media_type === 'shorts';
    const boxClass = `feed-card-img-box${isVertical ? ' is-vertical' : ''}`;

    // YouTube Shorts
    if (media_type === 'shorts' && source_url) {
        const videoId = extractYouTubeId(source_url);
        if (videoId) {
            return `<div class="${boxClass}">
                <iframe
                    src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen
                    title="${escapeHtml(title)}"></iframe>
            </div>`;
        }
    }

    // YouTube embed (landscape)
    if (media_type === 'embed' && source_url &&
        (source_url.includes('youtube.com') || source_url.includes('youtu.be'))) {
        const videoId = extractYouTubeId(source_url);
        if (videoId) {
            return `<div class="feed-card-img-box">
                <iframe
                    src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen
                    title="${escapeHtml(title)}"></iframe>
            </div>`;
        }
    }

    // TikTok embed — official player, vertical like YouTube Shorts
    if ((media_type === 'embed' || media_type === 'shorts') && source_url && source_url.includes('tiktok.com')) {
        const videoId = source_url.match(/\/video\/(\d+)/)?.[1] || source_url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/)?.[1];
        if (videoId) {
            return `<div class="feed-card-img-box is-vertical">
                <iframe
                    src="https://www.tiktok.com/player/v1/${videoId}"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen loading="lazy"
                    title="${escapeHtml(title)}"></iframe>
            </div>`;
        }
    }

    // Plain image
    if (media_url) {
        return `<div class="feed-card-img-box">
            <img src="${escapeHtml(media_url)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">
        </div>`;
    }

    // Placeholder box with category gradient
    const gradients = {
        'Memes':         'linear-gradient(135deg,#1e0a3a,#0d001f)',
        'Culture':       'linear-gradient(135deg,#001a3a,#00062a)',
        'Tech':          'linear-gradient(135deg,#00213f,#000f1f)',
        'Entertainment': 'linear-gradient(135deg,#1f0a00,#100400)',
        'News':          'linear-gradient(135deg,#111,#1c1c1c)',
        'Sports':        'linear-gradient(135deg,#001f00,#000f00)',
    };
    const bg = gradients[category] || gradients['News'];
    return `<div class="feed-card-img-box is-placeholder" style="background:${bg};">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
    </div>`;
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

// ─── Active Post Resolver ─────────────────────────────────────────────────────
function getActivePost() {
    if (activeIndex >= 0 && activeIndex < cardsData.length) {
        return cardsData[activeIndex];
    }
    const cards = feed.querySelectorAll('.feed-card');
    for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (rect.top >= -rect.height / 2 && rect.top <= rect.height / 2) {
            const idx = parseInt(card.dataset.index, 10);
            if (!isNaN(idx) && cardsData[idx]) {
                activeIndex = idx;
                return cardsData[idx];
            }
        }
    }
    return cardsData[0] || null;
}

// ─── Action Bar ───────────────────────────────────────────────────────────────
function updateActionBar(post) {
    if (!post) return;
    const state = interactionState[post.id] || {};

    // Like
    const isLiked = !!state.like;
    actionLikeBtn.classList.toggle('active', isLiked);
    likeCount.classList.toggle('active-like', isLiked);
    likeCount.textContent = fmtCount(post.likes || 0);

    // Save
    const isSaved = !!state.save;
    actionSaveBtn.classList.toggle('active', isSaved);
    saveCount.classList.toggle('active-save', isSaved);
    saveCount.textContent = fmtCount(post.saves || 0);

    // Share
    const isShared = !!state.share;
    actionShareBtn.classList.toggle('active', isShared);
    shareCount.classList.toggle('active-share', isShared);
    shareCount.textContent = fmtCount(post.shares || 0);

    // Synchronize inline action buttons on the active card
    const card = feed.querySelector(`.feed-card[data-post-id="${post.id}"]`);
    if (card) {
        const inlineLike = card.querySelector('.action-btn-inline[data-action="like"]');
        const inlineSave = card.querySelector('.action-btn-inline[data-action="save"]');
        const inlineShare = card.querySelector('.action-btn-inline[data-action="share"]');

        if (inlineLike) {
            inlineLike.classList.toggle('active', isLiked);
            const countEl = inlineLike.querySelector('[data-count="like"]');
            if (countEl) {
                countEl.textContent = fmtCount(post.likes || 0);
                countEl.classList.toggle('active-like', isLiked);
            }
        }
        if (inlineSave) {
            inlineSave.classList.toggle('active', isSaved);
            const countEl = inlineSave.querySelector('[data-count="save"]');
            if (countEl) {
                countEl.textContent = fmtCount(post.saves || 0);
                countEl.classList.toggle('active-save', isSaved);
            }
        }
        if (inlineShare) {
            inlineShare.classList.toggle('active', isShared);
            const countEl = inlineShare.querySelector('[data-count="share"]');
            if (countEl) {
                countEl.textContent = fmtCount(post.shares || 0);
                countEl.classList.toggle('active-share', isShared);
            }
        }
    }

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
    if (!postId) return;
    const post = cardsData.find(p => p.id === postId) || getActivePost();
    if (!post) return;

    if (!interactionState[post.id]) interactionState[post.id] = {};
    const state = interactionState[post.id];

    // Snapshot current state for rollback
    const prevLike = state.like;
    const prevSave = state.save;
    const prevLikes = post.likes || 0;
    const prevSaves = post.saves || 0;
    const prevShares = post.shares || 0;

    // 1. Instant Optimistic Update
    if (action === 'like') {
        state.like = !prevLike;
        post.likes = Math.max(0, prevLikes + (state.like ? 1 : -1));

        actionLikeBtn.querySelector('svg')?.classList.add('heart-beat');
        likeCount.classList.add('number-pop');
        if (btn) btn.querySelector('svg')?.classList.add('heart-beat');

        setTimeout(() => {
            actionLikeBtn.querySelector('svg')?.classList.remove('heart-beat');
            likeCount.classList.remove('number-pop');
            if (btn) btn.querySelector('svg')?.classList.remove('heart-beat');
        }, 400);
    } else if (action === 'save') {
        state.save = !prevSave;
        post.saves = Math.max(0, prevSaves + (state.save ? 1 : -1));

        saveCount.classList.add('number-pop');
        setTimeout(() => saveCount.classList.remove('number-pop'), 400);
        showToast(state.save ? '🔖 Saved!' : 'Unsaved');
    } else if (action === 'share') {
        state.share = true;
        post.shares = prevShares + 1;

        shareCount.classList.add('number-pop');
        setTimeout(() => shareCount.classList.remove('number-pop'), 400);
    }

    // Reflect new numbers and highlight classes immediately
    updateActionBar(post);

    // 2. Background Sync
    try {
        const res = await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                post_id: post.id,
                action_type: action,
                payload: { post_id: post.id },
            }),
        });

        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }
    } catch (err) {
        console.error('Interaction error:', err);
        // Rollback on network failure
        if (action === 'like') {
            state.like = prevLike;
            post.likes = prevLikes;
        } else if (action === 'save') {
            state.save = prevSave;
            post.saves = prevSaves;
        } else if (action === 'share') {
            post.shares = prevShares;
        }
        updateActionBar(post);
        showToast('⚠️ Interaction not saved');
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
    const post = cardsData.find(p => p.id === postId) || getActivePost();
    if (!post) return;

    // Trigger share action immediately
    handleInteraction(post.id, 'share', actionShareBtn);

    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    const shareText = [post.title, post.summary, shareUrl].filter(Boolean).join('\n\n');

    if (navigator.share) {
        try {
            await navigator.share({
                title: post.title || 'Snapfeed',
                text: post.summary || '',
                url: shareUrl,
            });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.debug('Web Share fallback:', err.message);
        }
    }

    // Fallback: WhatsApp link or clipboard
    try {
        const res = await fetch(`/api/share/${post.id}/whatsapp`);
        const data = await res.json();
        if (data.web_link) {
            window.open(data.web_link, '_blank');
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast('🔗 Link copied to clipboard!');
        }
    } catch (_) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl);
            showToast('🔗 Link copied to clipboard!');
        }
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
        const post = getActivePost();
        if (btn && post) {
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

// ─── Preferences ─────────────────────────────────────────────────────────────
const PREF_CATEGORIES = ['Memes', 'Culture', 'Tech', 'Entertainment', 'News', 'Sports'];
const prefsToggle = document.getElementById('prefs-toggle');
const prefsModal = document.getElementById('prefs-modal');
const prefsChips = document.getElementById('prefs-chips');
const prefsSave = document.getElementById('prefs-save');
const prefsAll = document.getElementById('prefs-all');
const prefsClose = document.getElementById('prefs-close');
let selectedPrefs = new Set();

function renderPrefsChips() {
    prefsChips.innerHTML = PREF_CATEGORIES.map(cat =>
        `<button class="prefs-chip${selectedPrefs.has(cat) ? ' selected' : ''}" data-cat="${cat}" type="button">${cat}</button>`
    ).join('');
}

function openPrefsModal() {
    renderPrefsChips();
    prefsModal.classList.add('open');
}

function closePrefsModal() {
    prefsModal.classList.remove('open');
}

function resetFeed() {
    feed.innerHTML = '';
    cardsData = [];
    currentCursor = null;
    hasMore = true;
    activeIndex = -1;
    progressDots.innerHTML = '';
    emptyState.classList.add('hidden');
    fetchFeed();
}

async function savePreferences(cats) {
    try {
        const res = await fetch(`/api/preferences/${encodeURIComponent(sessionId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorite_categories: cats }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        selectedPrefs = new Set(cats);
        closePrefsModal();
        resetFeed();
        showToast(cats.length ? 'Feed updated to your preferences' : 'Showing everything');
    } catch (err) {
        console.error('Save preferences failed:', err);
        showToast('Could not save preferences');
    }
}

async function setupPreferences() {
    prefsChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.prefs-chip');
        if (!chip) return;
        const cat = chip.dataset.cat;
        if (selectedPrefs.has(cat)) selectedPrefs.delete(cat);
        else selectedPrefs.add(cat);
        chip.classList.toggle('selected');
    });

    prefsSave.addEventListener('click', () => {
        if (selectedPrefs.size === 0) {
            showToast('Pick at least one — or choose “Show everything”');
            return;
        }
        savePreferences([...selectedPrefs]);
    });

    prefsAll.addEventListener('click', () => savePreferences([]));
    prefsClose.addEventListener('click', closePrefsModal);
    prefsModal.addEventListener('click', (e) => { if (e.target === prefsModal) closePrefsModal(); });
    prefsToggle.addEventListener('click', openPrefsModal);

    try {
        const res = await fetch(`/api/preferences/${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        selectedPrefs = new Set(data.favorite_categories || []);
        if (!data.exists) openPrefsModal();
    } catch (err) {
        console.debug('Preferences load failed:', err);
    }
}

// ─── Service Worker ───────────────────────────────────────────────────────────
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.debug('SW registration failed:', err));
    }
}

// ─── HUD Tuck (TikTok-style) ──────────────────────────────────────────────────
// Action pill + emoji trigger hide while swiping, reappear on tap.
function setupHudTuck() {
    const setTucked = (tucked) => document.body.classList.toggle('hud-tucked', tucked);

    // Swiping tucks the HUD away
    feed.addEventListener('scroll', () => {
        setTucked(true);
        // Swipe also dismisses an open emoji picker
        emojiPicker.classList.remove('open');
        emojiTrigger.setAttribute('aria-expanded', 'false');
    }, { passive: true });

    // Tapping the card area toggles the HUD back (links/buttons keep their own behavior)
    feed.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        setTucked(!document.body.classList.contains('hud-tucked'));
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
    setupEmojiPicker();
    setupHudTuck();
    setupCookieConsent();
    registerServiceWorker();
    setupPreferences().finally(() => fetchFeed());

    // Floating action buttons (right bar) - respond to both click and touch
    const onLike = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const post = getActivePost();
        if (post) handleInteraction(post.id, 'like', actionLikeBtn);
    };

    const onSave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const post = getActivePost();
        if (post) handleInteraction(post.id, 'save', actionSaveBtn);
    };

    const onShare = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const post = getActivePost();
        if (post) sharePost(post.id);
    };

    actionLikeBtn.addEventListener('click', onLike);
    actionSaveBtn.addEventListener('click', onSave);
    actionShareBtn.addEventListener('click', onShare);

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