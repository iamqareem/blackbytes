import axios from 'axios';

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
    const articleMatches = html.matchAll(/<article[^>]*class="[^"]*story[^"]*"[\s\S]*?<\/article>/g);

    for (const match of articleMatches) {
        const articleHtml = match[0];
        
        const linkMatch = articleHtml.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*title[^"]*"/);
        const sourceUrl = linkMatch ? `https://flipboard.com${linkMatch[1]}` : null;
        
        const titleMatch = articleHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const descMatch = articleHtml.match(/<p[^>]*class="[^"]*excerpt[^"]*"[^>]*>([\s\S]*?)<\/p>/);
        const content = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const imgMatch = articleHtml.match(/<img[^>]*src="([^"]+)"/);
        const mediaUrl = imgMatch ? imgMatch[1] : null;
        
        const timeMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"/);
        const publishedAt = timeMatch ? timeMatch[1] : new Date().toISOString();

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
    }

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