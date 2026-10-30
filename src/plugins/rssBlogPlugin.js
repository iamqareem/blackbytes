import { takeNewestBySource } from '../feedUtils.js';
import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

// Entertainment/blog RSS sources are filtered from the shared config by category != 'News' and != 'Sports'
const BLOG_SOURCES = RSS_SOURCES.filter(s => s.category !== 'News' && s.category !== 'Sports');

export default {
    name: 'rss-blogs',
    category: 'Culture',
    async fetch() {
        const allItems = [];

        for (const source of BLOG_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
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
