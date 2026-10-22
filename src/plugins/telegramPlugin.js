import axios from 'axios';
import * as cheerio from 'cheerio';

const TELEGRAM_CHANNELS = [
    // Top 6 fetched — verified working, image-rich (meme gravity first)
    { username: 'habeshan_memes', category: 'Memes', name: 'Habeshan Memes 🇪🇹' },
    { username: 'Plantainchipps', category: 'Memes', name: 'Kenyan Memes' },
    { username: 'ghanamemes', category: 'Memes', name: 'Ghana Memes 🇬🇭' },
    { username: 'thememetimes', category: 'Memes', name: 'The Meme Times' },
    { username: 'naijamemes', category: 'Memes', name: 'Naija Memes' },
    { username: 'BBCAfrica', category: 'Culture', name: 'BBC Africa' },

    // Backup channels (not fetched by default — promote to top 6 after verifying)
    { username: 'TechCabal', category: 'Tech', name: 'TechCabal' },
    { username: 'DisruptAfrica', category: 'Tech', name: 'Disrupt Africa' },
    { username: 'AlJazeeraAfrica', category: 'News', name: 'Al Jazeera Africa' },
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
        // Use only the top 6 channels for performance
        const channels = TELEGRAM_CHANNELS.slice(0, 6);

        for (const channel of channels) {
            const html = await fetchTelegramChannel(channel);
            if (html) {
                const items = parseTelegramHTML(html, channel).slice(-8);
                console.log(`[telegram] @${channel.username}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        return allItems.slice(0, 48);
    },
};