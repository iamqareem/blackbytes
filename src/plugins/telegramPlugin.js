import axios from 'axios';
import * as cheerio from 'cheerio';

const TELEGRAM_CHANNELS = [
    // Channels that are known to work and have media
    { username: 'kenyanhumor', category: 'Memes', name: 'Kenyan Humor' },
    { username: 'africanmemesdaily', category: 'Memes', name: 'African Memes Daily' },
    { username: 'naijamemesofficial', category: 'Memes', name: 'Naija Memes' },
    { username: 'southafricanmemes', category: 'Memes', name: 'South African Memes' },
    { username: 'ghanamemes', category: 'Memes', name: 'Ghana Memes' },
    { username: 'africanculturehub', category: 'Culture', name: 'African Culture Hub' },
    { username: 'africatechnews', category: 'Tech', name: 'Africa Tech News' },
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
    const $ = cheerio.load(html);
    
    $('.tgme_widget_message').each((_, element) => {
        const msgEl = $(element);
        
        const postMatch = msgEl.attr('data-post');
        const postId = postMatch ? postMatch : null;
        
        const textEl = msgEl.find('.tgme_widget_message_text').first();
        const textContent = textEl ? textEl.text().trim() : '';
        
        // Check for photo
        const photoEl = msgEl.find('.tgme_widget_message_photo_wrap').first();
        let mediaUrl = null;
        if (photoEl.length) {
            const style = photoEl.attr('style') || '';
            const urlMatch = style.match(/background-image:url\('([^']+)'\)/);
            if (urlMatch) mediaUrl = urlMatch[1];
        }
        
        // Check for video
        const videoEl = msgEl.find('video').first();
        if (videoEl.length) {
            mediaUrl = videoEl.attr('src') || videoEl.find('source').attr('src') || mediaUrl;
        }
        
        // Check for document/link preview images
        if (!mediaUrl) {
            const docEl = msgEl.find('.tgme_widget_message_document_wrap').first();
            if (docEl.length) {
                const imgEl = docEl.find('img').first();
                if (imgEl.length) mediaUrl = imgEl.attr('src');
            }
        }
        
        const linkEl = msgEl.find('.tgme_widget_message_date').first();
        const sourceUrl = linkEl.attr('href') || `https://t.me/${channel.username}/${postId}`;
        
        const dateEl = msgEl.find('time').first();
        const publishedAt = dateEl.attr('datetime') || new Date().toISOString();

        if (postId && (textContent || mediaUrl)) {
            items.push({
                title: textContent.substring(0, 100) || `${channel.name} Post`,
                content: textContent,
                media_url: mediaUrl,
                media_type: mediaUrl ? (mediaUrl.includes('.mp4') || mediaUrl.includes('video') ? 'video' : 'image') : 'text',
                source_url: sourceUrl,
                source_name: channel.name,
                category: channel.category,
                published_at: publishedAt,
            });
        }
    });

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
                console.log(`[telegram] @${channel.username}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        return allItems.slice(0, 20);
    },
};