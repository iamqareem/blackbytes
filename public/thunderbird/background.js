const FEED_URL = 'https://gossip.ugaplex.com/feed.xml';
const SYNC_INTERVAL = 30;

async function fetchAndCacheFeed() {
    try {
        const response = await fetch(FEED_URL, {
            headers: { 'Accept': 'application/xml, text/xml' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        
        const error = xml.querySelector('parsererror');
        if (error) throw new Error('Invalid XML');
        
        const items = Array.from(xml.querySelectorAll('item')).map(item => ({
            title: item.querySelector('title')?.textContent || '',
            link: item.querySelector('link')?.textContent || '',
            description: item.querySelector('description')?.textContent || '',
            category: item.querySelector('category')?.textContent || 'General',
            author: item.querySelector('author')?.textContent || '',
            pubDate: item.querySelector('pubDate')?.textContent || '',
        })).filter(item => item.title && item.link);
        
        await browser.storage.local.set({
            feedItems: items,
            feedUpdated: Date.now(),
        });
        
        console.log('[AfroAgg] Feed cached:', items.length, 'items');
        
    } catch (err) {
        console.error('[AfroAgg] Feed fetch failed:', err);
    }
}

browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'feed-sync') {
        await fetchAndCacheFeed();
    }
});

browser.runtime.onInstalled.addListener(async () => {
    await browser.alarms.create('feed-sync', { periodInMinutes: SYNC_INTERVAL });
    await fetchAndCacheFeed();
});

browser.runtime.onStartup.addListener(async () => {
    await browser.alarms.create('feed-sync', { periodInMinutes: SYNC_INTERVAL });
    await fetchAndCacheFeed();
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'get-feed') {
        browser.storage.local.get(['feedItems', 'feedUpdated']).then(result => {
            sendResponse({
                items: result.feedItems || [],
                updated: result.feedUpdated || null,
            });
        });
        return true;
    }
    
    if (message.type === 'refresh-feed') {
        fetchAndCacheFeed().then(() => {
            browser.storage.local.get(['feedItems', 'feedUpdated']).then(result => {
                sendResponse({
                    items: result.feedItems || [],
                    updated: result.feedUpdated || null,
                });
            });
        });
        return true;
    }
});

browser.action.onClicked.addListener(() => {
    // Popup handles this
});