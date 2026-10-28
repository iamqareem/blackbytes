#!/usr/bin/env python3
import sqlite3
import json
import sys
import os
import math
from collections import Counter
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database.sqlite')

# --- Ranking constants ---
LIKE_WEIGHT = 1.0
SHARE_WEIGHT = 2.0
SAVE_WEIGHT = 3.0
VIEW_WEIGHT = 0.0001

# Freshness: strong recency pull so the feed stays daily-latest
FRESHNESS_WINDOW_DAYS = 3.0    # posts older than this never enter the feed (kept in DB)
FRESH_WEIGHT = 30.0            # score for a post published right now
FRESH_DECAY = 1.5              # exp decay per day: 24h ~ x0.23, 48h ~ x0.05, 72h ~ x0.01

# Diversity: prevent one source/category from flooding the swipe deck
DIVERSITY_WINDOW = 25       # first N ranked posts get diversity treatment
SOURCE_CAP = 3              # max posts per source in the diversity window
CATEGORY_CAP = 6            # max posts per category in the window (favorites mode only)
VIDEO_TYPES = {'shorts', 'embed', 'video'}

# Memes are gravity — give meme content a flat boost so it trades blows
# with news RSS (which is always minutes-fresher than any video)
CATEGORY_BOOST = {'Memes': 6.0, 'Entertainment': 2.0}


def get_category_affinity(cursor, session_id):
    cursor.execute(
        "SELECT favorite_categories FROM user_preferences WHERE session_id = ?",
        (session_id,)
    )
    row = cursor.fetchone()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except json.JSONDecodeError:
            return []
    return []


def get_interaction_counts(cursor, session_id):
    cursor.execute("""
        SELECT action_type, COUNT(*) as count
        FROM user_interactions
        WHERE session_id = ?
        GROUP BY action_type
    """, (session_id,))
    return {row[0]: row[1] for row in cursor.fetchall()}


def get_global_post_stats(cursor):
    cursor.execute("""
        SELECT id, title, summary, media_url, media_type, source_url, source_name, category, likes, shares, saves, views, created_at

        FROM posts
    """)
    return cursor.fetchall()


def parse_post_time(created_at):
    """Parse both date formats the DB stores:
    - RFC-2822 from RSS feeds: 'Fri, 02 Oct 2026 23:56:21 GMT'
    - ISO-8601 from TikTok/YouTube/ESPN: '2026-10-28T13:55:33.735Z'
    datetime.fromisoformat() cannot handle the RFC format (and used to make
    every RSS post look brand-new, flooding the feed with stale content).
    """
    if not created_at:
        return None
    s = str(created_at).strip()
    # RFC-2822 (email feed dates)
    try:
        dt = parsedate_to_datetime(s)
        # Unknown zone abbrevs (e.g. BST) come back naive — assume UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        pass
    # ISO-8601
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def apply_diversity(items, favorites):
    """Reorder the top of the ranked list so the swipe deck stays varied:
    1. Cap posts per source (always on)
    2. Cap posts per category (only when the user picked favorite categories)
    Dropped items keep their rank and are appended after the window.
    Video spreading happens afterwards across the whole feed.
    """
    window = items[:DIVERSITY_WINDOW]
    tail = items[DIVERSITY_WINDOW:]

    # 1) source cap
    kept, dropped = [], []
    src_counts = Counter()
    for item in window:
        if src_counts[item['source_name']] < SOURCE_CAP:
            kept.append(item)
            src_counts[item['source_name']] += 1
        else:
            dropped.append(item)

    # 2) category cap (favorites mode only — an all-categories feed should stay open)
    if favorites:
        cat_kept, cat_dropped = [], []
        cat_counts = Counter()
        for item in kept:
            if cat_counts[item['category']] < CATEGORY_CAP:
                cat_kept.append(item)
                cat_counts[item['category']] += 1
            else:
                cat_dropped.append(item)
        kept, dropped = cat_kept, cat_dropped + dropped

    return kept + dropped + tail


def interleave_videos(items):
    """Spread video cards EVENLY across the whole feed so a user picking 'All'
    never swipes a wall of TikTok/YouTube (the swipe-doom effect) and videos
    keep appearing as they keep swiping. Non-video order is preserved.
    """
    videos = [i for i in items if i['media_type'] in VIDEO_TYPES]
    if not videos:
        return items
    others = [i for i in items if i['media_type'] not in VIDEO_TYPES]

    # Evenly spaced slots across the full feed instead of front-loading
    n_out = len(items)
    interleaved = []
    vi = 0
    for pos in range(n_out):
        target = int((pos + 1) * len(videos) / n_out)
        if vi < len(videos) and target > vi:
            interleaved.append(videos[vi])
            vi += 1
        elif others:
            interleaved.append(others.pop(0))
    while vi < len(videos):
        interleaved.append(videos[vi])
        vi += 1
    return interleaved


def rank_posts(limit=20, cursor_id=None, session_id='default'):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    favorites = get_category_affinity(cursor, session_id)
    interaction_counts = get_interaction_counts(cursor, session_id)
    posts = get_global_post_stats(cursor)

    viewed_ids = set()
    cursor.execute("""
        SELECT post_id FROM user_interactions
        WHERE session_id = ? AND action_type = 'view'
    """, (session_id,))
    viewed_ids = {row[0] for row in cursor.fetchall()}

    now = datetime.now(timezone.utc)

    scored_posts = []

    for post in posts:
        (post_id, title, summary, media_url, media_type, source_url,
         source_name, category, likes, shares, saves, views, created_at) = post

        # --- freshness window: hide posts older than 3 days from the feed ---
        post_time = parse_post_time(created_at)
        if post_time is None:
            age_days = 0.0  # unparseable date -> treat as fresh (normalization keeps this rare)
        else:
            age_days = max(0.0, (now - post_time).total_seconds() / 86400.0)
        if age_days > FRESHNESS_WINDOW_DAYS:
            continue

        # Engagement + freshness (both feeds and RSS-only posts get scored the same way)
        engagement_score = (
            likes * LIKE_WEIGHT
            + shares * SHARE_WEIGHT
            + saves * SAVE_WEIGHT
            + (views or 0) * VIEW_WEIGHT
        )
        recency_score = FRESH_WEIGHT * math.exp(-FRESH_DECAY * age_days)
        score = engagement_score + recency_score + CATEGORY_BOOST.get(category, 0.0)

        item = {
            'id': post_id,
            'title': title,
            'summary': summary,
            'media_url': media_url,
            'media_type': media_type,
            'source_url': source_url,
            'source_name': source_name,
            'category': category,
            'likes': likes,
            'shares': shares,
            'saves': saves,
            'views': views or 0,
            'created_at': created_at,
            'score': round(score, 2)
        }
        scored_posts.append(item)

    scored_posts.sort(key=lambda x: x['score'], reverse=True)

    # Only push preferred categories when the user has saved preferences
    if favorites:
        scored_posts = [p for p in scored_posts if p['category'] in favorites]

    scored_posts = apply_diversity(scored_posts, favorites)
    scored_posts = interleave_videos(scored_posts)

    total_available = len(scored_posts)

    # Cursor is a numeric offset (matches server.js next_cursor logic)
    offset = int(cursor_id) if cursor_id else 0
    paginated_posts = scored_posts[offset:offset + limit]

    for post in paginated_posts:
        post['viewed'] = post['id'] in viewed_ids

    result = {
        'posts': paginated_posts,
        'session_id': session_id,
        'favorite_categories': favorites,
        'interaction_counts': interaction_counts,
        'total_available': total_available,
    }

    conn.close()
    return result


if __name__ == '__main__':
    # CLI order matches src/server.js runRanker(): <session_id> <limit> [cursor]
    session_id = sys.argv[1] if len(sys.argv) > 1 else 'default'
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    cursor_id = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        result = rank_posts(limit, cursor_id, session_id)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
