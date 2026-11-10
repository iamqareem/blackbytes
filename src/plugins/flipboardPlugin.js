// Snapfeed plugin — News & Tech (RSS)
// Handles two categories from the shared RSS source config:
//   • News — Africa-focused world news
//   • Tech — Computers, startups, digital economy
//
// All sources must return images — see rss-sources.js for verified sources.

import { takeNewestBySource } from '../feedUtils.js';
import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

const NEWS_SOURCES = RSS_SOURCES.filter(s => s.category === 'News');
const TECH_SOURCES = RSS_SOURCES.filter(s => s.category === 'Tech');

export default {
    name: 'news-tech-rss',
    category: 'News',
    async fetch() {
        const newsItems = [];
        const techItems = [];

        for (const source of NEWS_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[news-tech-rss] News: ${source.name}: ${items.length} items`);
                newsItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        for (const source of TECH_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[news-tech-rss] Tech: ${source.name}: ${items.length} items`);
                techItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return [
            ...takeNewestBySource(newsItems, 8),
            ...takeNewestBySource(techItems, 8),
        ];
    },
};
