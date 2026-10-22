import axios from 'axios';
import * as cheerio from 'cheerio';

const FLIPBOARD_MAGAZINES = [
    { id: 'african-culture', category: 'Culture', name: 'African Culture' },
    { id: 'african-memes-humor', category: 'Memes', name: 'African Memes & Humor' },
    { id: 'tech-africa', category: 'Tech', name: 'Tech Africa' },
    { id: 'afrobeats-music', category: 'Entertainment', name: 'Afrobeats & Music' },
    { id: 'african-news', category: 'News', name: 'African News' },
    { id: 'african-sports', category: 'Sports', name: 'African Sports' },
];

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'AfroAggregator/0.1';

async function fetchFlipboardMagazine(magazine) {
    const url = `https://flipboard.com/@${magazine.id}`;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        console.error(`Flipboard fetch failed for ${magazine.id}:`, err.message);
        return null;
    }
}

function parseFlipboardHTML(html, magazine) {
    const items = [];
    const $ = cheerio.load(html);
    
    $('article[class*="story"]').each((_, element) => {
        const articleHtml = $(element);
        
        const linkEl = articleHtml.find('a[class*="title"]').first();
        const sourceUrl = linkEl.attr('href') ? `https://flipboard.com${linkEl.attr('href')}` : null;
        
        const titleEl = articleHtml.find('h3').first();
        const title = titleEl.text().trim();
        
        const descEl = articleHtml.find('p[class*="excerpt"]').first();
        const content = descEl.text().trim();
        
        const imgEl = articleHtml.find('img').first();
        const mediaUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
        
        const timeEl = articleHtml.find('time').first();
        const publishedAt = timeEl.attr('datetime') || new Date().toISOString();

        if (sourceUrl && title) {
            items.push({
                title,
                content: content || title,
                media_url: mediaUrl,
                media_type: mediaUrl ? 'image' : 'text',
                source_url: sourceUrl,
                source_name: magazine.name,
                category: magazine.category,
                published_at: publishedAt,
            });
        }
    });

    return items;
}

export default {
    name: 'flipboard',
    category: 'Culture',
    async fetch() {
        const allItems = [];
        const magazines = FLIPBOARD_MAGAZINES.slice(0, 4);

        for (const magazine of magazines) {
            const html = await fetchFlipboardMagazine(magazine);
            if (html) {
                const items = parseFlipboardHTML(html, magazine);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        return allItems.slice(0, 20);
    },
};