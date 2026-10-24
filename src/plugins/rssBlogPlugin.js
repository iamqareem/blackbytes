import axios from 'axios';
import * as cheerio from 'cheerio';
import { takeNewestBySource } from '../feedUtils.js';

const RSS_SOURCES = [
    {
        name: 'BellaNaija',
        url: 'https://www.bellanaija.com/feed/',
        category: 'Entertainment',
    },
    {
        name: 'The Citizen (Tanzania)',
        url: 'https://www.thecitizen.co.tz/tanzania/rss.xml',
        category: 'News',
    },
    {
        name: 'Africanews',
        url: 'https://www.africanews.com/feed/rss',
        category: 'News',
    },
    {
        name: 'TechCabal',
        url: 'https://techcabal.com/feed/',
        category: 'Tech',
    },
    {
        name: 'Disrupt Africa',
        url: 'https://disrupt-africa.com/feed/',
        category: 'Tech',
    },
    {
        name: 'WeeTracker',
        url: 'https://weetracker.com/feed/',
        category: 'Tech',
    },
    {
        name: 'Business Daily Africa',
        url: 'https://www.businessdailyafrica.com/feed',
        category: 'News',
    },
    {
        name: 'The East African',
        url: 'https://www.theeastafrican.co.ke/feed',
        category: 'News',
    },
    {
        name: 'Daily Nation',
        url: 'https://nation.africa/kenya/rss',
        category: 'News',
    },
    {
        name: 'Mail & Guardian',
        url: 'https://mg.co.za/feed/',
        category: 'News',
    },
];

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'AfroAggregator/0.1';

async function fetchRSSFeed(source) {
    try {
        const response = await axios.get(source.url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        console.error(`RSS fetch failed for ${source.name}:`, err.message);
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
        
        // Extract content:encoded first (full content with images)
        let contentHtml = '';
        const contentEncodedMatch = itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentEncodedMatch) {
            contentHtml = contentEncodedMatch[1];
        } else {
            // Fallback to description
            const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                             itemXml.match(/<description>([\s\S]*?)<\/description>/);
            contentHtml = descMatch ? descMatch[1] : '';
        }
        
        let content = contentHtml.replace(/<[^>]+>/g, ' ').trim();
        content = content.replace(/\[\s*\.\.\.\s*\]/g, '').trim();
        
        // Extract first image from content HTML
        const mediaUrl = extractFirstImage(contentHtml);
        
        // Fallback to standard RSS media tags
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
    name: 'rss-blogs',
    category: 'Culture',
    async fetch() {
        const allItems = [];

        for (const source of RSS_SOURCES) {
            const xml = await fetchRSSFeed(source);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[rss-blogs] ${source.name}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return takeNewestBySource(allItems, 6);
    },
};