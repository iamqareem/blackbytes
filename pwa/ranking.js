// Snapfeed ranking engine — JavaScript port of python/ranking_engine.js
// Runs client-side in the PWA (Cloudflare Workers) to rank the synced feed.

const VIDEO_TYPES = new Set(['shorts', 'embed', 'video']);
const CATEGORY_BOOST = { Memes: 6.0, Entertainment: 2.0 };

// Ranking constants
const LIKE_WEIGHT = 1.0;
const SHARE_WEIGHT = 2.0;
const SAVE_WEIGHT = 3.0;
const VIEW_WEIGHT = 0.0001;

// Freshness
const FRESHNESS_WINDOW_DAYS = 3.0;   // posts older than this never enter the feed
const FRESH_WEIGHT = 30.0;           // score for a post published right now
const FRESH_DECAY = 1.5;             // exp decay per day

// Diversity
const DIVERSITY_WINDOW = 25;         // first N ranked posts get diversity treatment
const SOURCE_CAP = 3;                // max posts per source in the diversity window
const CATEGORY_CAP = 6;              // max posts per category in the window (favorites mode only)

function parsePostTime(createdAt) {
    if (!createdAt) return null;
    const s = String(createdAt).trim();

    // ISO-8601 (TikTok/YouTube/ESPN/Turso-synced posts)
    try {
        const dt = new Date(s.replace('Z', '+00:00'));
        if (!isNaN(dt.getTime())) return dt;
    } catch (_) {}

    // RFC-2822 (raw RSS before normalization) — fall back to Date.parse
    try {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) return dt;
    } catch (_) {}

    return null;
}

function applyDiversity(items, favorites) {
    const window = items.slice(0, DIVERSITY_WINDOW);
    const tail = items.slice(DIVERSITY_WINDOW);

    // 1) source cap (always on)
    const kept = [];
    const dropped = [];
    const srcCounts = {};
    for (const item of window) {
        if ((srcCounts[item.source_name] || 0) < SOURCE_CAP) {
            kept.push(item);
            srcCounts[item.source_name] = (srcCounts[item.source_name] || 0) + 1;
        } else {
            dropped.push(item);
        }
    }

    // 2) category cap (favorites mode only)
    if (favorites && favorites.length) {
        const catKept = [];
        const catDropped = [];
        const catCounts = {};
        for (const item of kept) {
            if ((catCounts[item.category] || 0) < CATEGORY_CAP) {
                catKept.push(item);
                catCounts[item.category] = (catCounts[item.category] || 0) + 1;
            } else {
                catDropped.push(item);
            }
        }
        return catKept.concat(catDropped.concat(dropped).concat(tail));
    }

    return kept.concat(dropped).concat(tail);
}

function interleaveVideos(items) {
    const videos = items.filter(i => VIDEO_TYPES.has(i.media_type));
    if (!videos.length) return items;

    const others = items.filter(i => !VIDEO_TYPES.has(i.media_type));
    const interleaved = [];
    let vi = 0;
    const nOut = items.length;

    for (let pos = 0; pos < nOut; pos++) {
        const target = Math.floor(((pos + 1) * videos.length) / nOut);
        if (vi < videos.length && target > vi) {
            interleaved.push(videos[vi]);
            vi += 1;
        } else if (others.length) {
            interleaved.push(others.shift());
        }
    }
    while (vi < videos.length) {
        interleaved.push(videos[vi]);
        vi += 1;
    }
    return interleaved;
}

export function rankPosts(posts, { limit = 20, cursor = 0, sessionId = 'default', favorites = [], interactions = {} } = {}) {
    const now = new Date();
    const liked = interactions.like || 0;
    const shared = interactions.share || 0;
    const saved = interactions.save || 0;

    const viewedIds = new Set((interactions.viewed || []).map(String));

    const scoredPosts = [];

    for (const post of posts) {
        const postTime = parsePostTime(post.created_at);
        const ageDays = postTime
            ? Math.max(0, (now - postTime) / 86400000)
            : 0;

        // Freshness window: hide posts older than 3 days
        if (ageDays > FRESHNESS_WINDOW_DAYS) continue;

        const engagementScore =
            (post.likes || 0) * LIKE_WEIGHT +
            (post.shares || 0) * SHARE_WEIGHT +
            (post.saves || 0) * SAVE_WEIGHT +
            (post.views || 0) * VIEW_WEIGHT;

        const recencyScore = FRESH_WEIGHT * Math.exp(-FRESH_DECAY * ageDays);
        const score = engagementScore + recencyScore + (CATEGORY_BOOST[post.category] || 0);

        scoredPosts.push({
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
            views: post.views || 0,
            created_at: post.created_at,
            score: Math.round(score * 100) / 100,
        });
    }

    scoredPosts.sort((a, b) => b.score - a.score);

    // Only push preferred categories when the user has saved preferences
    if (favorites && favorites.length) {
        scoredPosts = scoredPosts.filter(p => favorites.includes(p.category));
    }

    const diversified = applyDiversity(scoredPosts, favorites);
    const interleaved = interleaveVideos(diversified);

    const totalAvailable = interleaved.length;
    const offset = Math.max(0, parseInt(cursor, 10) || 0);
    const paginated = interleaved.slice(offset, offset + limit);

    for (const post of paginated) {
        post.viewed = viewedIds.has(String(post.id));
    }

    return {
        posts: paginated,
        session_id: sessionId,
        favorite_categories: favorites,
        interaction_counts: interactions,
        total_available: totalAvailable,
    };
}
