#!/usr/bin/env node
// Builds reverse-crossword/data/*.json from a checkout of doshea/nyt_crosswords:
//   node scripts/build-reverse-crossword.js path/to/nyt_crosswords
// Every clue in the archive goes into a bank keyed by answer. Then a random
// sample of plain 15x15 Monday–Saturday puzzles (no rebus squares, circles or
// notes) is written one per file, each answer carrying its most common past
// clues from the bank. Clues that only make sense inside their own puzzle
// (cross-references, theme hints) are left out of the bank.

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '..', 'reverse-crossword', 'data');
const PUZZLES = 150;
const PAST = 40;
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
    .sort((a, b) => b.n - a.n)
    .slice(0, PAST)
    .map((e) => e.clue);
}

for (let i = eligible.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let written = 0;
for (const p of eligible) {
  if (written === PUZZLES) break;
  const words = [];
  for (const dir of ['across', 'down']) {
    p.clues[dir].forEach((raw, i) => {
      const n = +raw.match(/^(\d+)\./)?.[1];
      const ans = p.answers[dir][i];
      const clue = clean(raw);
      const past = pastClues(ans);
      if (!SELF_REF.test(clue) && !past.some((c) => c.toLowerCase() === clue.toLowerCase()))
        past.push(clue);
      words.push({ n, dir: dir[0], ans, clue, past });
    });
  }
  // Skip puzzles where several entries have nothing to match against.
  if (words.filter((w) => !w.past.length).length > 2) continue;
  const [m, d, y] = p.date.split('/');
  const puzzle = {
    date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    dow: p.dow,
    by: p.author,
    grid: p.grid.join(''),
    words,
  };
  fs.writeFileSync(path.join(OUT, `${written}.json`), JSON.stringify(puzzle));
  written++;
}
const size = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(
  `${bank.size} answers in the bank; ${eligible.length} eligible puzzles; wrote ${written} (${(size / 1e6).toFixed(1)} MB)`
);
