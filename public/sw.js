const CACHE_NAME = 'snapfeed-v1';
const STATIC_CACHE = 'afro-static-v1';
const API_CACHE = 'afro-api-v1';
const IMAGE_CACHE = 'afro-images-v1';

const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/dist/styles.css',
    '/dist/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

const CACHE_STRATEGIES = {
    static: 'cache-first',
    api: 'stale-while-revalidate',
    images: 'cache-first',
};

async function installSW() {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    console.log('[SW] Static assets cached');
    return self.skipWaiting();
}

async function activateSW() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames
            .filter(name => ![STATIC_CACHE, API_CACHE, IMAGE_CACHE].includes(name))
            .map(name => caches.delete(name))
    );
    console.log('[SW] Activated');
    return self.clients.claim();
}

async function fetchStatic(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.log('[SW] Static fetch failed:', err);
        return new Response('Offline', { status: 503 });
    }
}

async function fetchAPI(request) {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);
    
    if (cached) {
        return cached;
    }
    
    return fetchPromise;
}

async function fetchImages(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        return new Response('', { status: 503 });
    }
}

async function handleFetch(event) {
    const { request } = event;
    const url = new URL(request.url);
    
    if (request.method !== 'GET') {
        return fetch(request);
    }
    
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetchAPI(request));
        return;
    }
    
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
        event.respondWith(fetchImages(request));
        return;
    }
    
    if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.startsWith(asset.replace('*', '')))) {
        event.respondWith(fetchStatic(request));
        return;
    }
    
    event.respondWith(fetchStatic(request));
}

async function handleMessage(event) {
    if (event.data === 'skipWaiting') {
        await self.skipWaiting();
    }
}

self.addEventListener('install', event => {
    event.waitUntil(installSW());
});

self.addEventListener('activate', event => {
    event.waitUntil(activateSW());
});

self.addEventListener('fetch', event => {
    handleFetch(event);
});

self.addEventListener('message', event => {
    handleMessage(event);
});

self.addEventListener('sync', event => {
    if (event.tag === 'sync-interactions') {
        event.waitUntil(syncInteractions());
    }
});

async function syncInteractions() {
    console.log('[SW] Syncing interactions');
}