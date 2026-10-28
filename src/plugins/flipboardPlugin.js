import axios from 'axios';
import * as cheerio from 'cheerio';
import { takeNewestBySource } from '../feedUtils.js';

const NEWS_SOURCES = [
    {
        name: 'BBC Africa',
        url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
        category: 'News',
    },
    {
        name: 'Al Jazeera Africa',
        url: 'https://www.aljazeera.com/xml/rss/all.xml',
        category: 'News',
    },
    {
        name: 'France24 Africa',
        url: 'https://www.france24.com/en/africa/rss',
        category: 'News',
    },
    {
        name: 'The Guardian Africa',
        url: 'https://www.theguardian.com/world/africa/rss',
        category: 'News',
    },
];

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'AfroAggregator/0.1';

async function fetchNewsSource(source) {
    try {
        const response = await axios.get(source.url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        console.error(`News source fetch failed for ${source.name}:`, err.message);
        return null;
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

function parseRSSFeed(xml, source) {
    const items = [];
    const itemMatches = xml.matchAll(/<item>[\s\S]*?<\/item>/g);

    for (const match of itemMatches) {
        const itemXml = match[0];
        
        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                          itemXml.match(/<title>([\s\S]*?)<\/title>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
        const sourceUrl = linkMatch ? linkMatch[1].trim() : '';
        
        let contentHtml = '';
        const contentEncodedMatch = itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentEncodedMatch) {
            contentHtml = contentEncodedMatch[1];
        } else {
            const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                             itemXml.match(/<description>([\s\S]*?)<\/description>/);
            contentHtml = descMatch ? descMatch[1] : '';
        }
        
        let content = contentHtml.replace(/<[^>]+>/g, ' ').trim();
        content = content.replace(/\[\s*\.\.\.\s*\]/g, '').trim();
        
        const mediaUrl = extractFirstImage(contentHtml);
        
        const fallbackMediaMatch = itemXml.match(/<media:content[^>]*url="([^"]+)"/) ||
                                  itemXml.match(/<media:thumbnail[^>]*url="([^"]+)"/) ||
                                  itemXml.match(/<enclosure[^>]*url="([^"]+)"/);
        const finalMediaUrl = mediaUrl || (fallbackMediaMatch ? fallbackMediaMatch[1] : null);
        
        const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/) ||
                            itemXml.match(/<published>(.*?)<\/published>/);
        const publishedAt = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
        
        const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/);
        const guid = guidMatch ? guidMatch[1] : sourceUrl;

        if (sourceUrl && title) {
            items.push({
                title,
                content: content || title,
                media_url: finalMediaUrl,
                media_type: finalMediaUrl ? (finalMediaUrl.includes('.mp4') || finalMediaUrl.includes('video') ? 'video' : 'image') : 'text',
                source_url: sourceUrl,
                source_name: source.name,
                category: source.category,
                published_at: publishedAt,
            });
        }
    }

    return items;
}

export default {
    name: 'news-rss',
    category: 'News',
    async fetch() {
        const allItems = [];

        for (const source of NEWS_SOURCES) {
            const xml = await fetchNewsSource(source);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[news-rss] ${source.name}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return takeNewestBySource(allItems, 6);
    },
};