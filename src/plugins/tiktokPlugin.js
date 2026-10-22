import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

// African TikTok creators — verified extractable via yt-dlp (2026-10)
const TIKTOK_CHANNELS = [
    { username: 'brodashaggi', category: 'Memes', name: 'Broda Shaggi' },
    { username: 'markangelcomedy', category: 'Memes', name: 'Mark Angel Comedy' },
    { username: 'wode_maya', category: 'Culture', name: 'Wode Maya' },
];

const PER_CHANNEL = 5;
const MAX_DURATION = 300;

function resolveYtDlp() {
    const candidates = [
        process.env.YT_DLP_PATH,
        path.join(os.homedir(), '.local/bin/yt-dlp'),
        'yt-dlp',
    ].filter(Boolean);
    for (const c of candidates) {
        if (c !== 'yt-dlp' && fs.existsSync(c)) return c;
        if (c === 'yt-dlp') return c;
    }
    return null;
}

function cleanTitle(text, fallback) {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return fallback;
    return cleaned.length > 120 ? cleaned.slice(0, 117) + '…' : cleaned;
}

async function fetchChannel(channel, bin) {
    const url = `https://www.tiktok.com/@${channel.username}`;
    const { stdout } = await execFileAsync(
        bin,
        ['--flat-playlist', '-J', '--playlist-end', String(PER_CHANNEL), url],
        { timeout: 120000, maxBuffer: 20 * 1024 * 1024 }
    );
    const data = JSON.parse(stdout);
    const entries = Array.isArray(data.entries) ? data.entries : [];

    return entries
        .filter(e => e && e.id && e.url && e.url.includes('/video/'))
        .filter(e => !e.duration || e.duration <= MAX_DURATION)
        .map(e => ({
            title: cleanTitle(e.title, `${channel.name} TikTok`),
            content: cleanTitle(e.description || e.title, channel.name),
            media_url: null,
            media_type: 'shorts',
            source_url: e.url,
            source_name: channel.name,
            category: channel.category,
            published_at: e.timestamp
                ? new Date(e.timestamp * 1000).toISOString()
                : new Date().toISOString(),
        }));
}

export default {
    name: 'tiktok',
    category: 'Memes',
    async fetch() {
        const bin = resolveYtDlp();
        if (!bin) {
            console.warn('[tiktok] yt-dlp not found (set YT_DLP_PATH or install to ~/.local/bin) — skipping');
            return [];
        }

        const results = await Promise.allSettled(
            TIKTOK_CHANNELS.map(channel => fetchChannel(channel, bin))
        );

        const allItems = [];
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const channel = TIKTOK_CHANNELS[i];
            if (r.status === 'fulfilled') {
                console.log(`[tiktok] @${channel.username}: ${r.value.length} items`);
                allItems.push(...r.value);
            } else {
                console.error(`[tiktok] @${channel.username} failed:`, r.reason?.message || r.reason);
            }
        }

        return allItems.slice(0, 15);
    },
};
