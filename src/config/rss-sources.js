// Snapfeed RSS source configuration
// ─────────────────────────────────────────────────────────────────────────────
// RULE: Only add sources whose RSS/Atom feeds reliably include <img> tags,
//       <media:content>, <media:thumbnail>, or <enclosure> image URLs.
//       Sources verified to return images are marked [✓ images].
//       Sources that NEVER return images have been removed.
//       Feed health tested 2026-11-10: 14 dead/404/timeout sources removed,
//       2 Atom feeds (The Verge, Africa Is a Country) rescued by parser update.
//
// Valid categories (must match db.js CHECK constraint):
//   'News' | 'Sports' | 'Geopolitics' | 'Tech' | 'AI & Quantum' | 'Web3' |
//   'IoT & Open Source' | 'Education' | 'Entertainment' | 'Culture'
// ─────────────────────────────────────────────────────────────────────────────

export const RSS_SOURCES = [

    // ── News (Africa-focused) ─────────────────────────────────────────────────
    // [✓ images] BBC includes <media:thumbnail> in every item
    { name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', category: 'News' },
    // [✓ images] Al Jazeera includes <media:content> with full image URLs
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'News' },
    // [✓ images] France 24 returns og:image-embeddable <enclosure> items
    { name: 'France24 Africa', url: 'https://www.france24.com/en/africa/rss', category: 'News' },
    // [✓ images] Guardian wraps article images inside <content:encoded>
    { name: 'The Guardian Africa', url: 'https://www.theguardian.com/world/africa/rss', category: 'News' },
    // [✓ images] Daily Nation (Kenya) — regional flagship with article thumbnails
    { name: 'Daily Nation Kenya', url: 'https://nation.africa/kenya/rss.xml', category: 'News' },

    // ── Sports ───────────────────────────────────────────────────────────────
    // [✓ images] BBC Sport includes <media:thumbnail> in every Football item
    { name: 'BBC Football Gossip', url: 'https://feeds.bbci.co.uk/sport/football/gossip/rss.xml', category: 'Sports' },
    { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', category: 'Sports' },
    // [✓ images] Guardian Football includes article images in <content:encoded>
    { name: 'The Guardian Football', url: 'https://www.theguardian.com/football/rss', category: 'Sports' },
    // [✓ images] Sky Sports carries <enclosure> images for each article
    { name: 'Sky Sports Football', url: 'https://www.skysports.com/rss/12040', category: 'Sports' },

    // ── Geopolitics ───────────────────────────────────────────────────────────
    // [✓ images] Middle East Eye full-text RSS with article images
    { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', category: 'Geopolitics' },
    // [✓ images] RT World — includes <enclosure> image for every article
    { name: 'RT World', url: 'https://www.rt.com/rss/news/', category: 'Geopolitics' },
    // [✓ images] The Intercept — in-depth geopolitical investigative journalism
    { name: 'The Intercept', url: 'https://theintercept.com/feed/?rss', category: 'Geopolitics' },

    // ── Tech & Computers ─────────────────────────────────────────────────────
    // [✓ images] Ars Technica — full-resolution article images in <content:encoded>
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Tech' },
    // [✓ images] The Verge — Atom feed, rich <media:content> per article
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Tech' },
    // [✓ images] Wired — article images in every item
    { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'Tech' },
    // [✓ images] TechCabal — Africa tech startup coverage, embeds article images
    { name: 'TechCabal', url: 'https://techcabal.com/feed/', category: 'Tech' },

    // ── AI & Quantum ─────────────────────────────────────────────────────────
    // [✓ images] MIT Technology Review — verified image-rich feed
    { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'AI & Quantum' },
    // [✓ images] Quanta Magazine — beautiful science images in every article
    { name: 'Quanta Magazine', url: 'https://api.quantamagazine.org/feed/', category: 'AI & Quantum' },

    // ── Web3 & Crypto ─────────────────────────────────────────────────────────
    // [✓ images] Cointelegraph — verified, 30+ items with article images per cycle
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'Web3' },
    // [✓ images] Decrypt — solid Web3 news with <media:content> images
    { name: 'Decrypt', url: 'https://decrypt.co/feed', category: 'Web3' },
    // [✓ images] The Block — institutional crypto with article images
    { name: 'The Block', url: 'https://www.theblock.co/rss.xml', category: 'Web3' },
    // [✓ images] Bitcoin Magazine — OG Bitcoin publication with imagery
    { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/', category: 'Web3' },

    // ── IoT & Open Source ────────────────────────────────────────────────────
    // [✓ images] Arduino Blog — official IoT/maker content, article images included
    { name: 'Arduino Blog', url: 'https://blog.arduino.cc/feed/', category: 'IoT & Open Source' },
    // [✓ images] Linux.com — Linux/open source, includes post images
    { name: 'Linux.com', url: 'https://www.linux.com/feed/', category: 'IoT & Open Source' },
    // [✓ images] Raspberry Pi — IoT/maker primary source, full image feed
    { name: 'Raspberry Pi', url: 'https://www.raspberrypi.com/news/feed/', category: 'IoT & Open Source' },

    // ── Education & Scholarships ─────────────────────────────────────────────
    // [✓ images] Opportunities for Africans — grants/scholarships with article images
    { name: 'Opportunities for Africans', url: 'https://www.opportunitiesforafricans.com/feed/', category: 'Education' },

    // ── Entertainment ─────────────────────────────────────────────────────────
    // [✓ images] BellaNaija — Nigeria lifestyle/entertainment, includes article images
    { name: 'BellaNaija', url: 'https://www.bellanaija.com/feed/', category: 'Entertainment' },

    // ── Culture ───────────────────────────────────────────────────────────────
    // Africa Is a Country — politics + culture intersect, Atom feed with thumbnails
    { name: 'Africa Is a Country', url: 'https://africasacountry.com/feed', category: 'Culture' },

];
