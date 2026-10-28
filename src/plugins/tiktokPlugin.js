import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { takeNewestBySource } from '../feedUtils.js';

const execFileAsync = promisify(execFile);

// East African TikTok creators — verified extractable via yt-dlp (2026-10).
// Round 1 of a rotating subsaharan roster (this shot: Kenya, Tanzania, Uganda, Rwanda).
const TIKTOK_CHANNELS = [
    { username: 'mulamwah', category: 'Memes', name: 'Mulamwah 🇰🇪' },
    { username: 'terencecreative', category: 'Memes', name: 'Terence Creative 🇰🇪' },
    { username: 'diamondplatnumz', category: 'Culture', name: 'Diamond Platnumz 🇹🇿' },
    { username: 'officialzuchu', category: 'Entertainment', name: 'Zuchu 🇹🇿' },
    { username: 'tengetengeofficial', category: 'Memes', name: 'Tengetenge 🇺🇬' },
    { username: 'ghettokids_tfug256', category: 'Culture', name: 'Triplets Ghetto Kids 🇺🇬' },
    { username: 'general_benda', category: 'Memes', name: 'General Benda 🇷🇼' },
    { username: 'kilipaul', category: 'Culture', name: 'Kili Paul 🇹🇿' },
];

const PER_CHANNEL = 6;
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

        const allItems = [];
        let successCount = 0;
        // Sequential fetches with delays to avoid TikTok WAF rate-limiting
        for (const channel of TIKTOK_CHANNELS) {
            try {
                const items = await fetchChannel(channel, bin);
                console.log(`[tiktok] @${channel.username}: ${items.length} items`);
                allItems.push(...items);
                successCount++;
            } catch (err) {
                console.error(`[tiktok] @${channel.username} failed:`, err.message);
            }
            // Delay between channels to avoid rate-limit
            await new Promise(r => setTimeout(r, 1500));
        }

        console.log(`[tiktok] ${successCount}/${TIKTOK_CHANNELS.length} channels succeeded`);
        return takeNewestBySource(allItems, 6);
    },
};
