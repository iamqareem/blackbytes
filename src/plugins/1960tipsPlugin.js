// Snapfeed scraping plugin — 1960Tips daily sports predictions.
//
// Fetches https://www.1960tips.com/todays-predictions ("Today's Football
// Predictions" for the current day) and curates the best two daily picks
// from the prediction table. The table rows carry:
//   - a country flag image (/pictures/flags/<country>.png)
//   - kick-off time (tb-time)
//   - league (tb-league)
//   - match name (tb-match)
//   - tip (tb-tip, e.g. OV2.5)
//
// Curatorial rule: highest-tier league first (Premier League, La Liga,
// Bundesliga, Serie A, Ligue 1, Champions League), then earliest kick-off.
// This yields "the best two" picks for the day. If fewer than two rows are
// parseable, fewer are returned (no padding).
//
// Data shape per row:
//   <div class="tb-flag"><img alt="football-prediction" src="/pictures/flags/<country>.png"/></div>
//   <div class="tb-time">17:00</div>
//   <div class="tb-league">ENG PR</div>
//   <div class="tb-match">Man Utd vs Liverpool</div>
//   <div class="tb-tip">&nbsp;OV2.5</div>
//
// Item shape (consumed by src/scraper.js): same as other plugins.

import axios from 'axios';

const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Snapfeed/1.0 (+https://gossip.ugaplex.com)';

// Top-5 European leagues (ranked as "best two" picks).
const TOP_EUROPEAN = new Set([
  'ENG PR', 'CLA', 'EL 1', 'LA LIG', 'BBCH', 'SER A', 'LIG 1', 'CHAMP', 'CUEC', 'WC 1',
]);

function extractRow(html) {
  const flag = html.match(/<div class="tb-flag"><img[^>]*src="([^"]+)"/);
  const time = html.match(/<div[^>]*class="tb-time">([^<]+)<\/div>/);
  const league = html.match(/<div[^>]*class="tb-league">([^<]+)<\/div>/);
  const match = html.match(/<div[^>]*class="tb-match">([^<]+)<\/div>/);
  const tip = html.match(/<div[^>]*class="tb-tip">&nbsp;([^<]+)<\/div>/);
  return {
    flag: flag ? flag[1] : null,
    time: time ? time[1].trim() : null,
    league: league ? league[1].trim() : 'N/A',
    match: match ? match[1].trim() : '',
    tip: tip ? tip[1].trim() : '',
  };
}

function rowScore(row) {
  if (!row.match) return -Infinity;
  if (TOP_EUROPEAN.has(row.league)) return 10 + TOP_EUROPEAN.size - Array.from(TOP_EUROPEAN).indexOf(row.league);
  if (row.league && row.league !== 'N/A') return 5;
  return 0;
}

async function fetchTodayPredictions() {
  const { data } = await axios.get('https://www.1960tips.com/todays-predictions', {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
  });

  const rows = [];
  // Split on each table-row div start; first chunk is header, rest are rows.
  const parts = data.split('<div class="table-row');
  for (const part of parts) {
    if (!part.includes('tb-match')) continue;
    const row = extractRow('<div class="table-row' + part);
    if (row.match) rows.push(row);
  }

  // Rank: best league tier first, then earliest kick-off.
  rows.sort((a, b) => {
    const sa = rowScore(a);
    const sb = rowScore(b);
    if (sa !== sb) return sb - sa;
    return (a.time || '').localeCompare(b.time || '');
  });

  const topTwo = rows.slice(0, 2);

  return topTwo.map((row) => {
    const flag = row.flag || '/pictures/flags/Default.png';
    const mediaUrl = flag.startsWith('http') ? flag : `https://www.1960tips.com${flag}`;
    return {
      title: `[1960Tips] ${row.match} — ${row.league}`,
      content: `Prediction: ${row.match}. Kick-off ${row.time}. Tip: ${row.tip || 'N/A'}. League: ${row.league}.`,
      media_url: mediaUrl,
      media_type: 'image',
      source_url: 'https://www.1960tips.com/todays-predictions',
      source_name: '1960Tips',
      category: 'Sports',
      published_at: new Date().toISOString(),
    };
  });
}

export default {
  name: '1960tips',
  category: 'Sports',
  async fetch() {
    return await fetchTodayPredictions();
  },
};
