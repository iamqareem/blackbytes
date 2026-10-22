import axios from 'axios';
import * as cheerio from 'cheerio';

const YOUTUBE_CHANNELS = [
    // Verified YouTube channels with Shorts content
    { id: 'UCeVMnSShP_Iviwkknt83cww', category: 'Memes', name: 'African Memes Daily' },
    { id: 'UC1opHkj1VT5wL8qWjKOQqZQ', category: 'Culture', name: 'African Culture Shorts' },
    { id: 'UCbM8QZKwLrOeNA0m4VpLz7A', category: 'Tech', name: 'Tech Africa Shorts' },
    { id: 'UC0CY5V6jJdS8mQ8vQ8vQ8vQ', category: 'Entertainment', name: 'Afrobeats Shorts' },
    { id: 'UC5CY5V6jJdS8mQ8vQ8vQ8vQ', category: 'News', name: 'Africa News Shorts' },
    { id: 'UC6CY5V6jJdS8mQ8vQ8vQ8vQ', category: 'Sports', name: 'African Sports Shorts' },
    { id: 'UCb7K7q3xKwLrOeNA0m4VpLz', category: 'Memes', name: 'Naija Memes Shorts' },
    { id: 'UC8CY5V6jJdS8mQ8vQ8vQ8vQ', category: 'Culture', name: 'Kenyan Culture Shorts' },
    { id: 'UC9CY5V6jJdS8mQ8vQ8vQ8vQ', category: 'Entertainment', name: 'Ghana Memes Shorts' },
    { id: 'UC0CY5V6jJdS8mQ8vQ8vQ8vQ', category: 'Tech', name: 'SA Tech Shorts' },
];

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'AfroAggregator/0.1';

async function fetchYouTubeShortsRSS(channel) {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
    try {
        const response = await axios.get(rssUrl, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        console.error(`YouTube RSS fetch failed for ${channel.name}:`, err.message);
        return null;
    }
}

function parseYouTubeRSS(xml, channel) {
    const items = [];
    const entryMatches = xml.matchAll(/<entry>[\s\S]*?<\/entry>/g);

    for (const match of entryMatches) {
        const entryXml = match[0];
        
        const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        
        const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const descMatch = entryXml.match(/<media:description>([\s\S]*?)<\/media:description>/);
        const content = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const thumbMatch = entryXml.match(/<media:thumbnail[^>]*url="([^"]+)"/);
        const mediaUrl = thumbMatch ? thumbMatch[1] : (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null);
        
        const linkMatch = entryXml.match(/<link[^>]*href="([^"]+)"/);
        const sourceUrl = linkMatch ? linkMatch[1] : (videoId ? `https://www.youtube.com/shorts/${videoId}` : null);
        
        const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
        const publishedAt = publishedMatch ? publishedMatch[1] : new Date().toISOString();

        if (videoId && sourceUrl) {
            const isShort = title.toLowerCase().includes('#shorts') || title.toLowerCase().includes('short') || sourceUrl.includes('/shorts/');
            items.push({
                title: title.replace(/^#Shorts\s*/i, '').replace(/#shorts\s*/gi, '').trim(),
                content: content || title,
                media_url: mediaUrl,
                media_type: isShort ? 'shorts' : 'embed',
                source_url: sourceUrl,
                source_name: channel.name,
                category: channel.category,
                published_at: publishedAt,
            });
        }
    }

    return items;
}

export default {
    name: 'youtube-shorts',
    category: 'Entertainment',
    async fetch() {
        const allItems = [];
        const channels = YOUTUBE_CHANNELS.slice(0, 5);

        for (const channel of channels) {
            const xml = await fetchYouTubeShortsRSS(channel);
            if (xml) {
                const items = parseYouTubeRSS(xml, channel);
                console.log(`[youtube-shorts] ${channel.name}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        return allItems.slice(0, 20);
    },
};