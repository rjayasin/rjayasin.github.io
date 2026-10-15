#!/usr/bin/env node
// Builds reverse-jeopardy/data/*.json from a jwolle1/jeopardy_clue_dataset TSV:
//   node scripts/build-reverse-jeopardy.js combined_season1-42.tsv
// Keeps only complete five-clue categories from the first two rounds that
// stand on their own (no host comments, no quoted wordplay titles, no media
// clues, no catch-alls), then writes a random sample of them as fixed-size
// shards; the page draws a board's six categories from one shard.

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '..', 'reverse-jeopardy', 'data');
const SHARDS = 100;
const PER_SHARD = 100;

const CATCH_ALL =
  /^(POTPOURRI|HODGEPODGE|GRAB BAG|MIXED BAG|ODDS & ENDS|POT LUCK|POTLUCK|MISCELLANY|MISCELLANEOUS|ALL OVER THE MAP|TRIVIA|POT POURRI|POT-POURRI)$/;
const MEDIA =
  /seen here|shown here|highlighted here|pictured here|heard here|seen in|clue crew|\(hint:|\[|on the monitor|you see|you hear/i;

function clean(s) {
  return s.replace(/\\(["'\\])/g, '$1').trim();
}

const [src] = process.argv.slice(2);
if (!src) {
  console.error('usage: build-reverse-jeopardy.js <combined.tsv>');
  process.exit(1);
}

const groups = new Map();
const lines = fs.readFileSync(src, 'utf8').split('\n');
const head = lines.shift().split('\t');
const col = Object.fromEntries(head.map((h, i) => [h, i]));
for (const line of lines) {
  const f = line.split('\t');
  if (f.length < head.length) continue;
  const round = f[col.round];
  if (round !== '1' && round !== '2') continue;
  const key = `${f[col.air_date]}|${round}|${f[col.category]}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
}

const pool = [];
for (const [key, rows] of groups) {
  if (rows.length !== 5) continue;
  const [date, , cat] = key.split('|');
  if (cat.includes('"') || CATCH_ALL.test(cat)) continue;
  if (rows.some((r) => r[col.comments].trim())) continue;
  if (rows.some((r) => MEDIA.test(r[col.answer]) || !r[col.answer].trim())) continue;
  rows.sort((a, b) => +a[col.clue_value] - +b[col.clue_value]);
  pool.push({
    c: clean(cat),
    d: date,
    q: rows.map((r) => [clean(r[col.answer]), clean(r[col.question])]),
  });
}

for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (let s = 0; s < SHARDS; s++) {
  const shard = pool.slice(s * PER_SHARD, (s + 1) * PER_SHARD);
  fs.writeFileSync(path.join(OUT, `${s}.json`), JSON.stringify(shard));
}
console.log(`${pool.length} eligible categories; wrote ${SHARDS} shards of ${PER_SHARD}`);
