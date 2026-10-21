import axios from 'axios';

const TELEGRAM_CHANNELS = [
    { username: 'africanmemeschannel', category: 'Memes', name: 'African Memes' },
    { username: 'naijaviral', category: 'Memes', name: 'Naija Viral' },
    { username: 'kenyanhumor', category: 'Memes', name: 'Kenyan Humor' },
    { username: 'afroculturehub', category: 'Culture', name: 'Afro Culture Hub' },
    { username: 'techafrica', category: 'Tech', name: 'Tech Africa' },
    { username: 'afrobeatsupdates', category: 'Entertainment', name: 'Afrobeats Updates' },
];

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'AfroAggregator/0.1';

async function fetchTelegramChannel(channel) {
    const url = `https://t.me/s/${channel.username}`;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        console.error(`Telegram fetch failed for @${channel.username}:`, err.message);
        return null;
    }
}

function parseTelegramHTML(html, channel) {
    const items = [];
    const messageMatches = html.matchAll(/<div class="tgme_widget_message[^"]*"[^>]*data-post="[^"]*"[\s\S]*?<\/div>\s*<\/div>/g);

    for (const match of messageMatches) {
        const msgHtml = match[0];
        
        const postMatch = msgHtml.match(/data-post="([^"]+)"/);
        const postId = postMatch ? postMatch[1] : null;
        
        const textMatch = msgHtml.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const textContent = textMatch ? textMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const mediaMatch = msgHtml.match(/<a class="tgme_widget_message_photo_wrap"[^>]*style="background-image:url\('([^']+)'\)"/);
        const mediaUrl = mediaMatch ? mediaMatch[1] : null;
        
        const videoMatch = msgHtml.match(/<video[^>]*src="([^"]+)"/);
        const videoUrl = videoMatch ? videoMatch[1] : null;
        
        const linkMatch = msgHtml.match(/<a class="tgme_widget_message_date"[^>]*href="([^"]+)"/);
        const sourceUrl = linkMatch ? linkMatch[1] : `https://t.me/${channel.username}/${postId}`;
        
        const dateMatch = msgHtml.match(/<time[^>]*datetime="([^"]+)"/);
        const publishedAt = dateMatch ? dateMatch[1] : new Date().toISOString();

        if (postId && (textContent || mediaUrl || videoUrl)) {
            items.push({
                title: textContent.substring(0, 100) || `${channel.name} Post`,
                content: textContent,
                media_url: videoUrl || mediaUrl,
                media_type: videoUrl ? 'video' : (mediaUrl ? 'image' : 'text'),
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
    name: 'telegram',
    category: 'Memes',
    async fetch() {
        const allItems = [];
        const channels = TELEGRAM_CHANNELS.slice(0, 4);

        for (const channel of channels) {
            const html = await fetchTelegramChannel(channel);
            if (html) {
                const items = parseTelegramHTML(html, channel);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        return allItems.slice(0, 20);
    },
};