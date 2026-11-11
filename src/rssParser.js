// Shared RSS/Atom parser — used by any plugin that scrapes XML feeds.
// To add a new source, just add { name, url, category } to src/config/rss-sources.js
// Supports RSS 2.0 (<item>) and Atom (<entry>) feeds.
// NOTE: titles/descriptions are entity-decoded here — several feeds emit raw
// HTML entities (&#39; &amp;) outside CDATA which caused garbled titles.
import axios from 'axios';
import * as cheerio from 'cheerio';

export const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Snapfeed/1.0';

export async function fetchRSSFeed(url) {
    // Some CDNs (e.g. africasacountry.com) reject custom bot UAs with
    // ECONNRESET — degrade to a browser-style UA on the first failure.
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                timeout: 15000,
            });
            return res.data;
        } catch (err2) {
            console.error(`RSS fetch failed for ${url}:`, err2.message);
            return null;
        }
    }
}

function extractFirstImage(html) {
    if (!html) return null;
    const $ = cheerio.load(html);
    const img = $('img').first();
    if (img.length) {
        return img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || null;
    }
    return null;
}

// ── HTML entity decoding (the "Don&#039;t" title glitch) ────────────────────
const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™',
    eacute: 'é', egrave: 'è', agrave: 'à', ugrave: 'ù', ccedil: 'ç',
};

export function decodeEntities(text) {
    if (!text) return '';
    return String(text)
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeFromCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => safeFromCode(parseInt(dec, 10)))
        .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function safeFromCode(code) {
    // Guard against invalid/out-of-range control codes
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
    try { return String.fromCodePoint(code); } catch { return ''; }
}

/** Decode entities + strip any lingering tags; shared by RSS and Atom paths. */
function cleanField(text) {
    return decodeEntities(String(text || '').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ').trim();
}

// ── Field extractors shared by both formats ─────────────────────────────────

function matchOne(itemXml, patterns) {
    for (const re of patterns) {
        const m = itemXml.match(re);
        if (m) return m;
    }
    return null;
}

function unwrapCdata(value) {
    return String(value || '').replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function normalizeItem({ rawTitle, rawContent, rawMedia, rawSourceUrl, rawPublished, source, youtube = null }) {
    const title = cleanField(rawTitle);
    let content = cleanField(rawContent);
    content = content.replace(/\[\s*\.\.\.\s*\]/g, '').trim();

    const mediaUrl = extractFirstImage(rawContent) ||
        decodeEntities(matchOne(rawMedia, [/url="([^"]+)"/])?.[1] || '');

    // YouTube Atom entries: content is the video description (no <img>), so
    // the generic image extraction only finds the media:thumbnail. Such posts
    // are stored as embeds — thumbnail in media_url, watch URL in source_url —
    // which the PWA + /post pages convert into a real player.
    if (youtube) {
        return {
            title,
            content: content || title,
            media_url: youtube.thumbnail,
            media_type: 'embed',
            source_url: youtube.watchUrl,
            source_name: source.name,
            category: source.category,
            published_at: rawPublished.trim() || new Date().toISOString(),
        };
    }

    return {
        title,
        content: content || title,
        media_url: mediaUrl || null,
        media_type: mediaUrl ? (mediaUrl.includes('.mp4') || mediaUrl.includes('video') ? 'video' : 'image') : 'text',
        source_url: rawSourceUrl.trim(),
        source_name: source.name,
        category: source.category,
        published_at: rawPublished.trim() || new Date().toISOString(),
    };
}

// YouTube channel Atom feeds (https://www.youtube.com/feeds/videos.xml?…):
// every entry carries <yt:videoId> plus <media:thumbnail url="…hqdefault.jpg">.
function extractYouTubeEntry(itemXml) {
    const videoId = matchOne(itemXml, [/<yt:videoId>([^<]+)<\/yt:videoId>/])?.[1];
    if (!videoId) return null;
    const thumbnail = matchOne(itemXml, [/media:thumbnail[^>]*url="(https:[^"]*\/vi\/[^"]*\/[^"]*\.jpg)"/])?.[1] ||
                      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    return {
        videoId,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: decodeEntities(thumbnail),
    };
}

// ── RSS 2.0 (<item>) ─────────────────────────────────────────────────────────

function parseRssItem(itemXml, source) {
    const rawTitle = unwrapCdata(matchOne(itemXml, [/<title><!\[CDATA\[(.*?)\]\]><\/title>/, /<title>([\s\S]*?)<\/title>/])?.[1]);
    const rawContent = unwrapCdata(matchOne(itemXml, [
        /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/,
        /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/,
        /<description>([\s\S]*?)<\/description>/,
    ])?.[1]);
    const rawSourceUrl = (matchOne(itemXml, [/<link>(.*?)<\/link>/])?.[1] || '');
    const rawMedia = itemXml;
    const rawPublished = (matchOne(itemXml, [/<pubDate>(.*?)<\/pubDate>/])?.[1] || '');

    if (!rawSourceUrl.trim() || !rawTitle) return null;
    return normalizeItem({ rawTitle, rawContent, rawMedia, rawSourceUrl, rawPublished, source });
}

// ── Atom (<entry>) ───────────────────────────────────────────────────────────

function parseAtomItem(itemXml, source) {
    const rawTitle = matchOne(itemXml, [/<title[^>]*>([\s\S]*?)<\/title>/])?.[1] || '';

    // Atom links live in the href attribute; prefer the canonical/alternate one
    const linkMatch = matchOne(itemXml, [
        /<link[^>]*type="text\/html"[^>]*href="([^"]+)"/,
        /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/,
        /<link[^>]*href="([^"]+)"/,
    ]);
    // Some feeds (e.g. africasacountry.com) omit <link> entirely — the entry
    // <id> IS the article URL. Use it as a fallback when it looks like a URL.
    const rawSourceUrl = linkMatch
        ? decodeEntities(linkMatch[1])
        : ((/^https?:\/\//).test(decodeEntities(matchOne(itemXml, [/<id>(.*?)<\/id>/])?.[1] || ''))
            ? decodeEntities(matchOne(itemXml, [/<id>(.*?)<\/id>/])[1])
            : '');

    // <content type="html"> usually beats <summary> for image extraction
    const rawContent = matchOne(itemXml, [
        /<content[^>]*type="html"[^>]*>([\s\S]*?)<\/content>/,
        /<content[^>]*>([\s\S]*?)<\/content>/,
        /<summary[^>]*>([\s\S]*?)<\/summary>/,
    ])?.[1] || '';
    const decodedContent = unwrapCdata(rawContent);

    const rawPublished = (matchOne(itemXml, [/<published>(.*?)<\/published>/]) ||
                          matchOne(itemXml, [/<updated>(.*?)<\/updated>/]))?.[1] || '';

    if (!rawSourceUrl || !rawTitle) return null;
    const youtube = /youtube\.com\/feeds/.test(source.url) ? extractYouTubeEntry(itemXml) : null;
    return normalizeItem({
        rawTitle,
        rawContent: decodedContent,
        rawMedia: itemXml,
        rawSourceUrl,
        rawPublished,
        source,
        youtube,
    });
}

// ── Public entry point ───────────────────────────────────────────────────────

export function parseRSSFeed(xml, source) {
    const xmlString = String(xml || '');
    const isCollection = /^<item>|\s<(?:item|entry)[>\s]/.test(xmlString.slice(0, xmlString.search(/<\/(?:channel|feed)>|$/)));
    const items = [];

    // RSS 2.0 — <item> ... </item>
    for (const match of xmlString.matchAll(/<item>[\s\S]*?<\/item>/g)) {
        const parsed = parseRssItem(match[0], source);
        if (parsed) items.push(parsed);
    }

    // Atom — <entry> ... </entry> (only if no RSS items were found)
    if (items.length === 0) {
        for (const match of xmlString.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/g)) {
            const parsed = parseAtomItem(match[0], source);
            if (parsed) items.push(parsed);
        }
    }

    void isCollection; // reserved for strict-format diagnostics
    return items;
}
