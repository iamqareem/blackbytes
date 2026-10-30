import { takeNewestBySource } from '../feedUtils.js';
import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

// News RSS sources are filtered from the shared config by category == 'News'
const NEWS_SOURCES = RSS_SOURCES.filter(s => s.category === 'News');

export default {
    name: 'news-rss',
    category: 'News',
    async fetch() {
        const allItems = [];

        for (const source of NEWS_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
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
