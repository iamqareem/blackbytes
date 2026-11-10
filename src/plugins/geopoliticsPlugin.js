// Snapfeed plugin — Geopolitics
// Sources: regional primary-source news agencies that return images in RSS.
//   • Middle East Eye (UK/MENA investigative)
//   • RT World (Russian state, global geopolitics)
//   • Tasnim News Agency (Iranian state English wire)
//   • The Intercept (US investigative journalism)
//   • CGTN Africa (Chinese state Africa bureau)
//
// All five feeds verified to carry article images via <media:content>,
// <enclosure>, or embedded <img> in <content:encoded>.

import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { takeNewestBySource } from '../feedUtils.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

const GEO_SOURCES = RSS_SOURCES.filter(s => s.category === 'Geopolitics');

export default {
    name: 'geopolitics',
    category: 'Geopolitics',
    async fetch() {
        const allItems = [];

        for (const source of GEO_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[geopolitics] ${source.name}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        // Keep the 8 newest across sources so every source gets a slot
        return takeNewestBySource(allItems, 8);
    },
};
