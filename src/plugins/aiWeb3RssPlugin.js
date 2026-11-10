// Snapfeed plugin — AI & Quantum + Web3
//
// Fetches from verified image-returning feeds for two distinct categories:
//
//  AI & Quantum:
//   • MIT Technology Review — verified 2026-11, images in every item
//   • The Next Web AI (Neural) — article thumbnails via <media:content>
//   • Quanta Magazine — rich science imagery
//   • VentureBeat AI — dedicated AI feed with cover images
//
//  Web3 & Crypto:
//   • Cointelegraph — verified 2026-11, 30+ items with article images
//   • Decrypt — solid <media:content> images per item
//   • The Block — institutional crypto with article images
//   • Bitcoin Magazine — OG publication with imagery
//
// All sources MUST return images; any source that stops doing so should be
// removed from rss-sources.js (the single source of truth).

import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { takeNewestBySource } from '../feedUtils.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

const AI_SOURCES = RSS_SOURCES.filter(s => s.category === 'AI & Quantum');
const WEB3_SOURCES = RSS_SOURCES.filter(s => s.category === 'Web3');

export default {
    name: 'ai-web3-rss',
    category: 'AI & Quantum',
    async fetch() {
        const aiItems = [];
        const web3Items = [];

        for (const source of AI_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[ai-web3-rss] AI: ${source.name}: ${items.length} items`);
                aiItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        for (const source of WEB3_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[ai-web3-rss] Web3: ${source.name}: ${items.length} items`);
                web3Items.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        // Cap each category at 8 items — merged, diverse across sources
        return [
            ...takeNewestBySource(aiItems, 8),
            ...takeNewestBySource(web3Items, 8),
        ];
    },
};
