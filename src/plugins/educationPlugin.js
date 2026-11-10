// Snapfeed plugin — Education & Scholarships
// Sources (all verified to return article images):
//   • Scholarship Positions — Africa-targeted scholarship aggregator
//   • Opportunities for Africans — grants + scholarships for Africans
//   • Study Portals — international study/career opportunities
//   • EdSurge — EdTech, career readiness & future-of-work coverage
//   • University World News Africa — higher education policy + research
//
// This category enlightens readers on academic and career advancement —
// especially grants, fellowships, and emerging skills demanded in the
// digital economy.

import { fetchRSSFeed, parseRSSFeed } from '../rssParser.js';
import { takeNewestBySource } from '../feedUtils.js';
import { RSS_SOURCES } from '../config/rss-sources.js';

const EDU_SOURCES = RSS_SOURCES.filter(s => s.category === 'Education');

export default {
    name: 'education',
    category: 'Education',
    async fetch() {
        const allItems = [];

        for (const source of EDU_SOURCES) {
            const xml = await fetchRSSFeed(source.url);
            if (xml) {
                const items = parseRSSFeed(xml, source);
                console.log(`[education] ${source.name}: ${items.length} items`);
                allItems.push(...items);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return takeNewestBySource(allItems, 8);
    },
};
