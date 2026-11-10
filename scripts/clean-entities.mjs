// scripts/clean-entities.mjs
// One-time maintenance: decode HTML entities in existing titles/summaries
// (posts + raw_posts). The glitch was caused by feeds emitting raw entities
// (&#039; etc.) outside CDATA before rssParser learned to decode them.
// Safe to re-run: skipped rows that decode identically, or look double-escaped.
import dbPkg from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import { decodeEntities } from '../src/rssParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new dbPkg(path.join(__dirname, '..', 'database.sqlite'));

const glitched = /&#x?[0-9a-fA-F]+;|&[a-zA-Z]{2,8};/;
const totals = {};

for (const [table, col] of [['posts', 'title'], ['posts', 'summary'], ['raw_posts', 'title'], ['raw_posts', 'content']]) {
    // LIKE pre-filter to avoid a full table scan through JS, then decode-check in JS
    const rows = db.prepare(
        `SELECT id, ${col} AS val FROM ${table} WHERE ${col} LIKE '%&#%' OR ${col} LIKE '%&%;&%'`
    ).all();
    const upd = db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`);
    let fixed = 0;
    for (const row of rows) {
        if (!glitched.test(row.val)) continue;
        const decoded = decodeEntities(row.val);
        if (decoded === row.val) continue;        // nothing to change
        if (glitched.test(decoded)) continue;      // double-escaped — leave for manual review
        upd.run(decoded, row.id);
        fixed++;
    }
    totals[`${table}.${col}`] = fixed;
    if (rows.length) console.log(`${table}.${col}: fixed ${fixed}/${rows.length} entity-glitched rows`);
}

console.log('Summary:', JSON.stringify(totals, null, 2));
