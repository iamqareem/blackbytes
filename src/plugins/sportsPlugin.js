import axios from 'axios';
import * as cheerio from 'cheerio';
import { takeNewestBySource } from '../feedUtils.js';

// Big European clubs — curated focus (PL elite + European giants)
const BIG_CLUB_RE = /(manchester\s+united|man\s+united|manchester\s+city|man\s+city|liverpool|arsenal|chelsea|tottenham|spurs|newcastle|aston\s+villa|west\s+ham|everton|leicester|leeds|barcelona|real\s+madrid|atletico|bayern|dortmund|juventus|ac\s+milan|inter\s+milan|psg|paris\s+saint)/i;

const FOOTBALL_SOURCES = [
    { name: 'BBC Football Gossip', url: 'https://feeds.bbci.co.uk/sport/football/gossip/rss.xml' },
    { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
    { name: 'The Guardian Football', url: 'https://www.theguardian.com/football/rss' },
    { name: 'Sky Sports Football', url: 'https://www.skysports.com/rss/12040' },
];

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard';
const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const PL_LOGO = 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png';
// -2..-1 recent results; 0..+3 upcoming fixtures
const MATCH_DAY_OFFSETS = [-2, -1, 0, 1, 2, 3];
const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Blackbytes/1.0 (+https://gossip.ugaplex.com)';

async function fetchXml(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
        });
        return response.data;
    } catch (err) {
        console.error(`[sports] RSS failed for ${url}:`, err.message);
        return null;
    }
}

function extractFirstImage(html) {
    if (!html) return null;
    const $ = cheerio.load(html);
    const img = $('img').first();
    if (img.length) return img.attr('src') || img.attr('data-src') || null;
    return null;
}

function parseRss(xml) {
    const items = [];
    for (const match of xml.matchAll(/<item>[\s\S]*?<\/item>/g)) {
        const itemXml = match[0];

        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                           itemXml.match(/<title>([\s\S]*?)<\/title>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
        const sourceUrl = linkMatch ? linkMatch[1].trim() : '';

        let contentHtml = '';
        const encodedMatch = itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (encodedMatch) {
            contentHtml = encodedMatch[1];
        } else {
            const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                             itemXml.match(/<description>([\s\S]*?)<\/description>/);
            contentHtml = descMatch ? descMatch[1] : '';
        }

        let content = contentHtml.replace(/<[^>]+>/g, ' ').trim().replace(/\[\s*\.\.\.\s*\]/g, '').trim();
        const mediaUrl = extractFirstImage(contentHtml);

        const pubMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
        const publishedAt = pubMatch ? pubMatch[1] : new Date().toISOString();

        if (sourceUrl && title) items.push({ title, content: content || title, mediaUrl, sourceUrl, publishedAt });
    }
    return items;
}

async function fetchClubGossip() {
    const results = await Promise.allSettled(FOOTBALL_SOURCES.map(async (source) => {
        const xml = await fetchXml(source.url);
        if (!xml) return [];
        const items = parseRss(xml)
            .filter(item => BIG_CLUB_RE.test(`${item.title} ${item.content}`))
            .slice(0, 8)
            .map(item => ({
                title: item.title,
                content: item.content.substring(0, 500),
                media_url: item.mediaUrl,
                media_type: item.mediaUrl ? 'image' : 'text',
                source_url: item.sourceUrl,
                source_name: source.name,
                category: 'Sports',
                published_at: item.publishedAt,
            }));
        console.log(`[sports] ${source.name}: ${items.length} big-club items`);
        return items;
    }));

    const all = [];
    for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);
    return takeNewestBySource(all, 6);
}

async function fetchMatchUpdates() {
    const items = [];

    for (const dayOffset of MATCH_DAY_OFFSETS) {
        const dateStr = new Date(Date.now() + dayOffset * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
        try {
            const response = await axios.get(`${ESPN_SCOREBOARD}?dates=${dateStr}`, {
                headers: { 'User-Agent': ESPN_UA, 'Accept-Encoding': 'identity' },
                timeout: 12000,
            });
            const events = response.data?.events || [];

            for (const ev of events) {
                const state = ev.status?.type?.state;
                if (state !== 'in' && state !== 'post' && state !== 'pre') continue;

                const comp = (ev.competitions || [])[0];
                if (!comp) continue;
                const home = comp.competitors.find(c => c.homeAway === 'home');
                const away = comp.competitors.find(c => c.homeAway === 'away');
                if (!home || !away) continue;

                const homeTeamId = home.team?.id;
                const awayTeamId = away.team?.id;
                const statusDesc = ev.status?.type?.description || '';
                const live = state === 'in';
                const scoreLine = `${home.team.displayName} ${home.score ?? 0}\u2013${away.score ?? 0} ${away.team.displayName}`;
                const kickoff = ev.date
                    ? new Date(ev.date).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })
                    : '';

                let title, summary;
                if (state === 'pre') {
                    title = `${home.team.displayName} v ${away.team.displayName} \u2014 ${kickoff} UTC`;
                    summary = `Premier League fixture \u2014 ${statusDesc || 'Scheduled'}. Kick-off ${kickoff} UTC.`;
                } else {
                    title = `${scoreLine} \u2014 ${live ? `LIVE (${statusDesc})` : statusDesc || 'Full Time'}`;

                    const teamName = (teamId) =>
                        teamId === homeTeamId ? home.team.displayName :
                        teamId === awayTeamId ? away.team.displayName : '';

                    const goals = (comp.details || [])
                        .filter(d => d.scoringPlay)
                        .map(d => {
                            const names = (d.athletesInvolved || []).map(a => a.displayName).join(', ');
                            const minute = d.clock?.displayValue || '';
                            return `${teamName(d.team?.id)}: ${names || 'Goal'} ${minute}`;
                        });

                    summary = `Premier League \u2014 ${statusDesc || 'Full Time'}. ${scoreLine}.`;
                    if (goals.length) summary += ` Goals: ${goals.join('; ')}.`;
                }

                // Fixtures shouldn't rank as "fresh" from a future kickoff time
                const publishedAt = state === 'pre' ? new Date().toISOString() : (ev.date || new Date().toISOString());

                items.push({
                    title: title.substring(0, 120),
                    content: summary,
                    media_url: PL_LOGO,
                    media_type: 'image',
                    source_url: `https://www.espn.com/soccer/match/_/gameId/${ev.id}`,
                    source_name: 'Premier League',
                    category: 'Sports',
                    published_at: publishedAt,
                    upsert: true,
                });
            }
        } catch (err) {
            console.error(`[sports] ESPN scoreboard ${dateStr} failed:`, err.message);
        }
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[sports] ESPN match updates: ${items.length} items`);
    return items;
}

export default {
    name: 'sports',
    category: 'Sports',
    async fetch() {
        const [gossip, matches] = await Promise.allSettled([
            fetchClubGossip(),
            fetchMatchUpdates(),
        ]);

        const allItems = [];
        if (gossip.status === 'fulfilled') allItems.push(...gossip.value);
        else console.error('[sports] gossip failed:', gossip.reason?.message);
        if (matches.status === 'fulfilled') allItems.push(...matches.value);
        else console.error('[sports] matches failed:', matches.reason?.message);

        // Gossip capped to 6 newest; match updates pass through full (upsert lifecycle refresh)
        return [...allItems];
    },
};
