// Snapfeed plugin — IoT & Open Source
// Sources (all verified to return article images):
//   • Hackster.io — hardware/IoT maker projects with cover images
//   • Arduino Blog — official IoT/embedded content, images in every post
//   • Linux.com — Linux kernel, distros, and open-source ecosystem news
//   • It's FOSS — beginner-friendly Linux/OSS with article images
//   • Raspberry Pi — SBC + IoT maker news, full image feed
//
// Mission: enlighten readers about open source technology, maker culture,
// and the connected devices shaping everyday African life and beyond.

import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { takeNewestBySource } from '../feedUtils.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

const IOT_OSS_SOURCES = RSS_SOURCES.filter(s => s.category === 'IoT & Open Source');

export default {
    name: 'iot-open-source',
    category: 'IoT & Open Source',
    async fetch() {
        const allItems = [];

        for (const source of IOT_OSS_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[iot-open-source] ${source.name}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return takeNewestBySource(allItems, 8);
    },
};
