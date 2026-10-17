#!/usr/bin/env node
// Builds reverse-crossword/data/ from a checkout of doshea/nyt_crosswords:
//   node scripts/build-reverse-crossword.js path/to/nyt_crosswords
// Every clue in the archive goes into a bank keyed by answer. Then every
// plain 15x15 Monday–Saturday puzzle (no rebus squares, circles or notes) is
// written, shuffled, one per file in data/puzzles/, and every past clue of
// each answer they use goes once into data/past/, most common (then shortest)
// first. Clues that only make sense inside their own puzzle (cross-references,
// theme hints) are left out of the bank. Prints the puzzle count, which
// PUZZLES in the page must match.

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '..', 'reverse-crossword', 'data');
const SHARDS = 256;
const DAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const SELF_REF =
  /\d+\s*-?\s*(across|down)\b|^see\b|this puzzle|puzzle's|\btheme|starred|circled|shaded|(italicized|preceding|following|previous|other|four|three|five) (clue|answer|entr)/i;

const [src] = process.argv.slice(2);
if (!src) {
  console.error('usage: build-reverse-crossword.js <nyt_crosswords dir>');
  process.exit(1);
}

function clean(s) {
  return s
    .replace(/^\d+\.\s*/, '')
    .replace(/^\*+\s*|\s*\*+$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.json')) files.push(p);
  }
})(src);

const bank = new Map();
const eligible = [];
for (const f of files) {
  let p;
  try {
    p = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    continue;
  }
  if (!p.clues || !p.answers || !p.grid) continue;
  for (const dir of ['across', 'down']) {
    p.clues[dir].forEach((raw, i) => {
      const ans = p.answers[dir][i];
      const clue = clean(raw);
      if (!ans || !clue || SELF_REF.test(clue)) return;
      if (!bank.has(ans)) bank.set(ans, new Map());
      const forms = bank.get(ans);
      const key = clue.toLowerCase();
      const e = forms.get(key) || { clue, n: 0 };
      e.n++;
      forms.set(key, e);
    });
  }
  if (
    DAYS.has(p.dow) &&
    p.size.rows === 15 &&
    p.size.cols === 15 &&
    !p.circles &&
    !p.shadecircles &&
    !p.notepad &&
    !p.jnotes &&
    p.grid.every((c) => c.length === 1)
  )
    eligible.push(p);
}

function pastClues(ans) {
  return [...(bank.get(ans)?.values() || [])]
    .sort((a, b) => b.n - a.n || a.clue.length - b.clue.length)
    .map((e) => e.clue);
}

// Must match shardOf in reverse-crossword/index.html.
function shardOf(ans) {
  let h = 0x811c9dc5;
  for (let i = 0; i < ans.length; i++) h = Math.imul(h ^ ans.charCodeAt(i), 0x01000193);
  return ((h >>> 0) % SHARDS).toString(16).padStart(2, '0');
}

// The entries' answers as the page reads them off the grid, in clue order.
function gridAnswers(grid) {
  const at = (r, c) => (r >= 0 && c >= 0 && r < 15 && c < 15 ? grid[r * 15 + c] : '.');
  const out = { across: [], down: [] };
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) {
      if (at(r, c) === '.') continue;
      if (at(r, c - 1) === '.' && at(r, c + 1) !== '.') {
        let s = '';
        for (let k = c; at(r, k) !== '.'; k++) s += at(r, k);
        out.across.push(s);
      }
      if (at(r - 1, c) === '.' && at(r + 1, c) !== '.') {
        let s = '';
        for (let k = r; at(k, c) !== '.'; k++) s += at(k, c);
        out.down.push(s);
      }
    }
  return out;
}

for (let i = eligible.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
}

// Puzzles go out without answers (the page reads them off the grid) and with
// each entry as [number, clue, flag]: OWN when the puzzle's own clue isn't
// among the answer's top past clues and should count too, GIVEN when there's
// nothing at all to match against.
const OWN = 1;
const GIVEN = 2;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'puzzles'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'past'), { recursive: true });
const used = new Set();
let days = '';
let written = 0;
for (const p of eligible) {
  const fromGrid = gridAnswers(p.grid);
  const entries = {};
  let given = 0;
  let ok = true;
  for (const dir of ['across', 'down']) {
    ok &&= fromGrid[dir].join() === p.answers[dir].join();
    entries[dir[0]] = p.clues[dir].map((raw, i) => {
      const ans = p.answers[dir][i];
      const clue = clean(raw);
      const past = pastClues(ans);
      const e = [+raw.match(/^(\d+)\./)?.[1], clue];
      if (!SELF_REF.test(clue) && !past.some((c) => c.toLowerCase() === clue.toLowerCase()))
        e.push(OWN);
      else if (!past.length) {
        e.push(GIVEN);
        given++;
      }
      return e;
    });
  }
  // Skip puzzles where several entries have nothing to match against.
  if (!ok || given > 2) continue;
  for (const dir of ['across', 'down']) for (const ans of p.answers[dir]) used.add(ans);
  const [m, d, y] = p.date.split('/');
  const puzzle = {
    date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    dow: p.dow,
    by: p.author,
    grid: p.grid.join(''),
    ...entries,
  };
  fs.writeFileSync(path.join(OUT, 'puzzles', `${written}.json`), JSON.stringify(puzzle));
  days += [...DAYS].indexOf(p.dow) + 1;
  written++;
}
// Each puzzle's weekday as a digit (Monday is 1), so the page can give each
// day's daily a puzzle that ran on the same weekday.
fs.writeFileSync(path.join(OUT, 'days.json'), JSON.stringify(days));

// Each answer's past clues are written once, into one of SHARDS files picked
// by a hash of the answer; the page fetches a shard when an entry needs it.
const shards = new Map();
for (const ans of [...used].sort()) {
  const past = pastClues(ans);
  if (!past.length) continue;
  const s = shardOf(ans);
  if (!shards.has(s)) shards.set(s, {});
  shards.get(s)[ans] = past;
}
for (const [s, obj] of shards)
  fs.writeFileSync(path.join(OUT, 'past', `${s}.json`), JSON.stringify(obj));

const mb = (dir) =>
  fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0) / 1e6;
console.log(
  `${eligible.length} eligible puzzles; wrote ${written} (${mb(path.join(OUT, 'puzzles')).toFixed(1)} MB) ` +
    `and past clues for ${used.size} answers in ${shards.size} shards (${mb(path.join(OUT, 'past')).toFixed(1)} MB)`
);
