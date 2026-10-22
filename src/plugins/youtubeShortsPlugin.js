import axios from 'axios';

// Real YouTube channels with Shorts content (verified channel IDs)
const YOUTUBE_CHANNELS = [
    { id: 'UCbmNph6atAoGfqLoCL_duAg', category: 'Entertainment', name: 'Jubilee' },
    { id: 'UCX6OQ3DkcsbYNE6H8uQQuVA', category: 'Entertainment', name: 'MrBeast' },
    { id: 'UC4JX40jDee_tINbkjycV4Sg', category: 'Tech', name: 'MKBHD' },
    { id: 'UCnUYZLuoy1rq1aVMwx4aTzw', category: 'Culture', name: 'Kurzgesagt' },
    { id: 'UCHnyfMqiRRG1u-2MsSQLbXA', category: 'Entertainment', name: 'Veritasium' },
    { id: 'UCR1IuLEqb6UEA9zDORR1VWA', category: 'Memes', name: 'Daily Dose Of Internet' },
    { id: 'UCpB959t8iPrxQWj7G6n0ctQ', category: 'Sports', name: 'Bleacher Report' },
    { id: 'UCWX3yGbODI3HMCwE8TFrEEg', category: 'Culture', name: 'Vox' },
    { id: 'UC9-y-6csu5WGm29I7JiwpnA', category: 'Tech', name: 'Computerphile' },
    { id: 'UCBcRF18a7Qf58cCRy5xuWwQ', category: 'Memes', name: 'MetaDave' },
];

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Blackbytes/1.0 (+https://gossip.ugaplex.com)';

async function fetchYouTubeRSS(channel) {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
    try {
        const response = await axios.get(rssUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/xml, text/xml, */*',
            },
            timeout: 20000,
        });
        return response.data;
    } catch (err) {
        console.error(`[youtube-shorts] RSS fetch failed for ${channel.name} (${channel.id}):`, err.message);
        return null;
    }
}

function parseYouTubeRSS(xml, channel) {
    const items = [];

    // Match all <entry> blocks
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
        const entryXml = match[1];

        // Extract videoId
        const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const videoId = videoIdMatch ? videoIdMatch[1].trim() : null;
        if (!videoId) continue;

        // Extract title (CDATA-aware)
        const titleMatch = entryXml.match(/<title(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Extract description
        const descMatch = entryXml.match(/<media:description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/media:description>/);
        const rawContent = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Extract thumbnail — prefer hqdefault, fall back to maxresdefault
        const thumbMatch = entryXml.match(/<media:thumbnail[^>]*url="([^"]+)"/);
        let mediaUrl = thumbMatch
            ? thumbMatch[1]
            : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        // Always use hqdefault for better compatibility
        if (mediaUrl.includes('img.youtube.com')) {
            mediaUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }

        // Extract published date
        const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
        const publishedAt = publishedMatch ? publishedMatch[1].trim() : new Date().toISOString();

        // Determine if this is a Short
        const titleLower = rawTitle.toLowerCase();
        const contentLower = rawContent.toLowerCase();
        const isShort =
            titleLower.includes('#shorts') ||
            titleLower.includes('#short') ||
            contentLower.includes('#shorts') ||
            contentLower.includes('#short');

        // Clean title
        const title = rawTitle
            .replace(/#[Ss]horts?\s*/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim() || `${channel.name} Short`;

        const content = rawContent || title;

        const sourceUrl = isShort
            ? `https://www.youtube.com/shorts/${videoId}`
            : `https://www.youtube.com/watch?v=${videoId}`;

        items.push({
            title,
            content: content.substring(0, 500),
            media_url: mediaUrl,
            media_type: isShort ? 'shorts' : 'embed',
            source_url: sourceUrl,
            source_name: channel.name,
            category: channel.category,
            published_at: publishedAt,
        });
    }

    return items;
}

export default {
    name: 'youtube-shorts',
    category: 'Entertainment',
    async fetch() {
        const allItems = [];
        // Only use first 5 channels to keep scraping fast
        const channels = YOUTUBE_CHANNELS.slice(0, 5);

        for (const channel of channels) {
            try {
                const xml = await fetchYouTubeRSS(channel);
                if (xml && typeof xml === 'string' && xml.includes('<feed')) {
                    const items = parseYouTubeRSS(xml, channel);
                    console.log(`[youtube-shorts] ${channel.name}: parsed ${items.length} items`);
                    allItems.push(...items);
                } else {
                    console.warn(`[youtube-shorts] ${channel.name}: empty or invalid XML response`);
                }
            } catch (err) {
                console.error(`[youtube-shorts] Error processing ${channel.name}:`, err.message);
            }
            // Be polite with delays between requests
            await new Promise(r => setTimeout(r, 800));
        }

        console.log(`[youtube-shorts] Total items fetched: ${allItems.length}`);
        return allItems.slice(0, 25);
    },
};