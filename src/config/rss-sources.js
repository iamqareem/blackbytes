// Snapfeed RSS source configuration
// Add a new feed here with just: { name, url, category }
// category must be one of: News, Sports, Memes, Entertainment, Culture, Tech
export const RSS_SOURCES = [
  // --- News ---
  { name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', category: 'News' },
  { name: 'Al Jazeera Africa', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'News' },
  { name: 'France24 Africa', url: 'https://www.france24.com/en/africa/rss', category: 'News' },
  { name: 'The Guardian Africa', url: 'https://www.theguardian.com/world/africa/rss', category: 'News' },

  // --- Sports ---
  { name: 'BBC Football Gossip', url: 'https://feeds.bbci.co.uk/sport/football/gossip/rss.xml', category: 'Sports' },
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', category: 'Sports' },
  { name: 'The Guardian Football', url: 'https://www.theguardian.com/football/rss', category: 'Sports' },
  { name: 'Sky Sports Football', url: 'https://www.skysports.com/rss/12040', category: 'Sports' },

  // --- Entertainment / Blogs ---
  { name: 'BellaNaija', url: 'https://www.bellanaija.com/feed/', category: 'Entertainment' },
  { name: 'Africanews', url: 'https://www.africanews.com/feed/rss', category: 'Entertainment' },
  { name: 'TechCabal', url: 'https://techcabal.com/feed/', category: 'Tech' },
  { name: 'Disrupt Africa', url: 'https://disrupt-africa.com/feed/', category: 'Tech' },
  { name: 'WeeTracker', url: 'https://weetracker.com/feed/', category: 'Tech' },
];
