import axios from 'axios';

const RSS_SOURCES = [
    {
        name: 'OkayAfrica',
        url: 'https://www.okayafrica.com/feed/',
        category: 'Culture',
    },
    {
        name: 'BellaNaija',
        url: 'https://www.bellanaija.com/feed/',
        category: 'Entertainment',
    },
    {
        name: 'The Citizen (Tanzania)',
        url: 'https://www.thecitizen.co.tz/service/rss/',
        category: 'News',
    },
    {
        name: 'Daily Monitor (Uganda)',
        url: 'https://www.monitor.co.ug/service/rss/',
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
        
        const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                         itemXml.match(/<description>([\s\S]*?)<\/description>/) ||
                         itemXml.match(/<content:encoded><!\[CDATA\[(.*?)\]\]><\/content:encoded>/);
        let content = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        content = content.replace(/\[\s*\.\.\.\s*\]/g, '').trim();
        
        const mediaMatch = itemXml.match(/<media:content[^>]*url="([^"]+)"/) ||
                          itemXml.match(/<media:thumbnail[^>]*url="([^"]+)"/) ||
                          itemXml.match(/<enclosure[^>]*url="([^"]+)"/);
        const mediaUrl = mediaMatch ? mediaMatch[1] : null;
        
        const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/) ||
                            itemXml.match(/<published>(.*?)<\/published>/);
        const publishedAt = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
        
        const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/);
        const guid = guidMatch ? guidMatch[1] : sourceUrl;

        if (sourceUrl && title) {
            items.push({
                title,
                content: content || title,
                media_url: mediaUrl,
                media_type: mediaUrl ? (mediaUrl.includes('.mp4') || mediaUrl.includes('video') ? 'video' : 'image') : 'text',
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
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return allItems.slice(0, 20);
    },
};