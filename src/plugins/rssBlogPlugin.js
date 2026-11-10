// Snapfeed plugin — Entertainment & Culture
// Handles two related lifestyle categories from the shared RSS source config:
//   • Entertainment — celebrity, movies, music charts, pop culture news
//   • Culture       — African art, music stories, heritage, identity
//
// All sources in rss-sources.js under these categories are verified to
// return article images. Sources without images must NOT be added to config.

import { takeNewestBySource } from '../feedUtils.js';
import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

const ENT_SOURCES = RSS_SOURCES.filter(s => s.category === 'Entertainment');
const CULTURE_SOURCES = RSS_SOURCES.filter(s => s.category === 'Culture');

export default {
    name: 'entertainment-culture',
    category: 'Entertainment',
    async fetch() {
        const entItems = [];
        const cultureItems = [];

        for (const source of ENT_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[entertainment-culture] Entertainment: ${source.name}: ${items.length} items`);
                entItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        for (const source of CULTURE_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[entertainment-culture] Culture: ${source.name}: ${items.length} items`);
                cultureItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return [
            ...takeNewestBySource(entItems, 8),
            ...takeNewestBySource(cultureItems, 8),
        ];
    },
};
