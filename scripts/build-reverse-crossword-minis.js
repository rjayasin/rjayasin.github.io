#!/usr/bin/env node
// Builds reverse-crossword/data/minis/ from the past clues already in
// reverse-crossword/data/past/ (so run build-reverse-crossword.js first) and
// the matcher model's word list, vocab.txt from
// https://huggingface.co/BAAI/bge-small-en-v1.5:
//   node scripts/build-reverse-crossword-minis.js path/to/vocab.txt
// Fills 5x5 grids, NYT Mini style, with answers that have run at least
// MIN_PAST times, so each entry has plenty to match against, and that are
// in the word list (or a plural of a word in it), which keeps out
// crosswordese like OTOES. Answers mostly clued as abbreviations, affixes or
// foreign words (SSR, ESA) are left out too, and no answer is used more than
// MAX_USES times. Each mini is written in the same shape as a full puzzle,
// with the answer's most common past clue standing in as the puzzle's clue.
// The fill is seeded, so a rebuild writes the same minis. Prints the mini
// count, which MINIS in the page must match.

const fs = require('node:fs');
const path = require('node:path');

const DATA = path.resolve(__dirname, '..', 'reverse-crossword', 'data');
const OUT = path.join(DATA, 'minis');
const COUNT = 1000;
const MIN_PAST = 12;
const SIZE = 5;
const MAX_USES = 6;
const OBSCURE =
  /abbr|\borg\b|for short|initials|prefix|suffix|, in [A-Z]|french|spanish|german|latin|italian/i;
const BLOCK = new Set(['ASS', 'ANAL', 'NATES', 'RAPE', 'RAPED', 'PENIS', 'SLUT', 'NAZI', 'NAZIS']);

// Block patterns, '#' for a black square, each symmetric under a half turn.
const PATTERNS = [
  ['#....', '.....', '.....', '.....', '....#'],
  ['....#', '.....', '.....', '.....', '#....'],
  ['##...', '#....', '.....', '....#', '...##'],
  ['...##', '....#', '.....', '#....', '##...'],
  ['#...#', '.....', '.....', '.....', '#...#'],
  ['.....', '.....', '.....', '.....', '.....'],
].map((rows) => rows.join(''));

// mulberry32
let seed = 0x5eed;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const [vocabFile] = process.argv.slice(2);
if (!vocabFile) {
  console.error('usage: build-reverse-crossword-minis.js <vocab.txt>');
  process.exit(1);
}
const vocab = new Set(fs.readFileSync(vocabFile, 'utf8').split('\n'));
const known = (ans) => {
  const w = ans.toLowerCase();
  return vocab.has(w) || (w.length > 3 && w.endsWith('s') && vocab.has(w.slice(0, -1)));
};

const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const past = {};
for (const f of fs.readdirSync(path.join(DATA, 'past')))
  Object.assign(past, JSON.parse(fs.readFileSync(path.join(DATA, 'past', f), 'utf8')));
const byLen = {};
for (const [ans, clues] of Object.entries(past)) {
  if (ans.length < 3 || ans.length > SIZE || clues.length < MIN_PAST) continue;
  if (!/^[A-Z]+$/.test(ans) || !known(ans) || BLOCK.has(ans)) continue;
  if (clues.filter((c) => OBSCURE.test(c)).length > clues.length * 0.3) continue;
  (byLen[ans.length] ||= []).push(ans);
}

// byPos[len][k] maps a letter to the answers of that length with it at k.
const byPos = {};
for (const [len, words] of Object.entries(byLen)) {
  byPos[len] = Array.from({ length: +len }, () => new Map());
  for (const w of words)
    [...w].forEach((ch, k) => {
      const m = byPos[len][k];
      if (!m.has(ch)) m.set(ch, []);
      m.get(ch).push(w);
    });
}

function slotsOf(grid) {
  const open = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE && grid[r * SIZE + c] !== '#';
  const slots = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      for (const [dr, dc, dir] of [
        [0, 1, 'a'],
        [1, 0, 'd'],
      ]) {
        if (open(r - dr, c - dc) || !open(r + dr, c + dc)) continue;
        const cells = [];
        for (let i = 0; open(r + dr * i, c + dc * i); i++)
          cells.push((r + dr * i) * SIZE + c + dc * i);
        slots.push({ dir, cells });
      }
    }
  return slots;
}

// Backtracking fill, always taking the slot with the fewest candidates.
// Gives up after a step budget so a bad start doesn't stall the build.
function fill(pattern) {
  const slots = slotsOf(pattern);
  if (slots.some((s) => s.cells.length < 3)) return null;
  const cells = [...pattern].map((ch) => (ch === '#' ? '#' : ''));
  const used = new Set();
  let steps = 0;
  const fits = (s, w) => s.cells.every((i, k) => !cells[i] || cells[i] === w[k]);
  const candidates = (s) => {
    const len = s.cells.length;
    let pool = byLen[len];
    s.cells.forEach((i, k) => {
      const list = cells[i] && (byPos[len][k].get(cells[i]) || []);
      if (list && list.length < pool.length) pool = list;
    });
    return pool.filter((w) => !used.has(w) && (uses[w] || 0) < MAX_USES && fits(s, w));
  };
  function go(left) {
    if (!left.length) return true;
    if (++steps > 4000) return false;
    let best = null;
    let bestCands = null;
    for (const s of left) {
      const cands = candidates(s);
      if (!best || cands.length < bestCands.length) [best, bestCands] = [s, cands];
      if (!cands.length) return false;
    }
    const rest = left.filter((s) => s !== best);
    for (let n = 0; n < 8 && bestCands.length; n++) {
      const w = bestCands.splice(Math.floor(rand() * bestCands.length), 1)[0];
      const before = best.cells.map((i) => cells[i]);
      best.cells.forEach((i, k) => (cells[i] = w[k]));
      used.add(w);
      if (go(rest)) return true;
      used.delete(w);
      best.cells.forEach((i, k) => (cells[i] = before[k]));
    }
    return false;
  }
  return go(slots) ? cells.map((ch) => (ch === '#' ? '.' : ch)).join('') : null;
}

// Numbers the squares the standard way and pairs each entry with its
// answer's most common past clue, as [number, clue] like a full puzzle.
function entries(grid) {
  const open = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE && grid[r * SIZE + c] !== '.';
  const out = { a: [], d: [] };
  let n = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      const a = !open(r, c - 1) && open(r, c + 1);
      const d = !open(r - 1, c) && open(r + 1, c);
      if (!a && !d) continue;
      n++;
      for (const [is, dir, dr, dc] of [
        [a, 'a', 0, 1],
        [d, 'd', 1, 0],
      ]) {
        if (!is) continue;
        let ans = '';
        for (let i = 0; open(r + dr * i, c + dc * i); i++)
          ans += grid[(r + dr * i) * SIZE + c + dc * i];
        out[dir].push([n, past[ans][0], ans]);
      }
    }
  return out;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const seen = new Set();
const uses = {};
let written = 0;
let tries = 0;
while (written < COUNT) {
  if (++tries > COUNT * 20) {
    console.error(`stuck after ${written} minis; lower COUNT or raise MAX_USES`);
    process.exit(1);
  }
  const grid = fill(pick(PATTERNS));
  if (!grid || seen.has(grid)) continue;
  seen.add(grid);
  const ents = entries(grid);
  for (const dir of ['a', 'd']) for (const e of ents[dir]) uses[e[2]] = (uses[e[2]] || 0) + 1;
  for (const dir of ['a', 'd']) ents[dir] = ents[dir].map(([n, clue]) => [n, clue]);
  fs.writeFileSync(path.join(OUT, `${written}.json`), JSON.stringify({ grid, ...ents }));
  written++;
}
console.log(
  `${Object.values(byLen).flat().length} answers with ${MIN_PAST}+ past clues; ` +
    `wrote ${written} minis in ${tries} tries`
);
