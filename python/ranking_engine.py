#!/usr/bin/env python3
import sqlite3
import json
import sys
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database.sqlite')

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
        SELECT id, category, likes, shares, saves, views, created_at
        FROM posts
    """)
    return cursor.fetchall()

def calculate_scores(posts, favorite_categories, now):
    scored = []
    for post in posts:
        post_id, category, likes, shares, saves, views, created_at = post
        
        category_weight = 5.0 if category in favorite_categories else 1.0
        
        global_likes = likes + shares + saves
        
        try:
            post_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            if post_time.tzinfo is not None:
                post_time = post_time.replace(tzinfo=None)
        except:
            post_time = now
        
        age_hours = (now - post_time).total_seconds() / 3600
        age_penalty = age_hours * 0.1
        
        final_score = (category_weight * 5.0) + (global_likes * 1.5) - age_penalty
        
        scored.append({
            'id': post_id,
            'score': final_score,
            'category': category,
            'likes': likes,
            'shares': shares,
            'saves': saves,
            'views': views,
            'created_at': created_at,
        })
    
    scored.sort(key=lambda x: x['score'], reverse=True)
    return scored

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "session_id required"}))
        sys.exit(1)
    
    session_id = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    cursor_id = sys.argv[3] if len(sys.argv) > 3 else None
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        favorite_categories = get_category_affinity(cursor, session_id)
        interaction_counts = get_interaction_counts(cursor, session_id)
        posts = get_global_post_stats(cursor)
        
        now = datetime.now()
        scored = calculate_scores(posts, favorite_categories, now)
        
        if cursor_id:
            scored = [p for p in scored if p['id'] > int(cursor_id)]
        
        result = scored[:limit]
        
        cursor.execute("""
            SELECT post_id FROM user_interactions 
            WHERE session_id = ? AND action_type = 'view'
        """, (session_id,))
        viewed_ids = {row[0] for row in cursor.fetchall()}
        
        for post in result:
            post['viewed'] = post['id'] in viewed_ids
        
        print(json.dumps({
            'posts': result,
            'session_id': session_id,
            'favorite_categories': favorite_categories,
            'interaction_counts': interaction_counts,
        }))
    
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()