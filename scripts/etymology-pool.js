#!/usr/bin/env node
// Scheduled pool update for the etymology game (etymology/game/).
//
// The game's word bank lives in etymology/game/ as:
//   manifest.json      the banded word list ("words"), player-discovered words
//                      awaiting promotion ("pending"), the blocklist, and the
//                      shape of the tree store ("chunks": per band, the tree
//                      count of each chunk file)
//   trees/<band>-<n>.json
//                      minified {word: tree} chunk files, CHUNK_SIZE trees
//                      apiece, append-only: once a chunk is full it is never
//                      rewritten, so browsers and the CDN keep old chunks
//                      cached forever and each update invalidates only the
//                      manifest and the one open chunk
//
// Invariant: every word in manifest.words has its tree cached in a chunk, so
// playing a pool word never touches Wiktionary. This script is the only
// writer of chunks; it runs from the etymology-pool workflow and does, in one
// commit per run at most:
//   1. promote pending words: build each one's tree, band it by node count,
//      append it to its band's open chunk
//   2. discover new words while bands are below BAND_CAP, within a small
//      per-run budget, keeping the bands roughly even
//
// Run with --offline to skip both network phases (used for the one-time
// migration from the legacy words.json/trees.json layout, which this script
// performs automatically when manifest.json doesn't exist yet).

const fs = require('fs');
const path = require('path');

const GAME_DIR = path.join(__dirname, '..', 'etymology', 'game');
const TREES_DIR = path.join(GAME_DIR, 'trees');
const MANIFEST_PATH = path.join(GAME_DIR, 'manifest.json');
const LEGACY_WORDS = path.join(GAME_DIR, 'words.json');
const LEGACY_TREES = path.join(GAME_DIR, 'trees.json');
const ENGINE_PATH = path.join(__dirname, '..', 'etymology', 'engine.js');

// Difficulty bands, mirrored from the game (see DIFFS in game/index.html).
const BANDS = {
  easy: { min: 3, max: 5 },
  medium: { min: 6, max: 8 },
  hard: { min: 9, max: 99 },
};
const CHUNK_SIZE = 50; // trees per chunk file
const BAND_CAP = 200; // stop growing a band here — bounds total cache size
const MAX_BAND_SKEW = 5; // keep bands within this many words of each other
// Per-run budgets. Every tree build is a couple of Wiktionary requests, so
// the caps keep a single run polite; the schedule provides the volume.
const MAX_BUILDS = Number(process.env.POOL_MAX_BUILDS || 30);
const MAX_NEW_WORDS = Number(process.env.POOL_MAX_NEW_WORDS || 8);

const OFFLINE = process.argv.includes('--offline');
// Resolve + bake language names but skip the tree-build phase. Lets a one-off
// run backfill names without promotes/discoveries competing for the rate limit.
const BAKE_ONLY = process.argv.includes('--bake-only');
// Language-name lookups per Wiktionary request. Each code expands to a ~200-char
// template, so keep batches small enough that the GET URL stays well under the
// ~8 KB servers accept — one giant batch is silently rejected and resolves none.
const RESOLVE_BATCH = 15;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Timestamped logging so a workflow run's phases — and any rate-limit stalls —
// are easy to follow. Prefix is seconds since the script started.
const startedAt = Date.now();
const log = (msg) => console.log(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${msg}`);

// ---------- Small helpers shared with the game ----------

function countNodes(n) {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

// Resolves a language code to its display name; wired to the engine's langName
// in main() so cleanTree can bake names in. Identity until then (offline
// legacy migration falls back to the raw code, which the game handles too).
let nameForLang = (code) => code;

// A tree stripped down to the fields worth persisting (same as the game's
// cleanTree): play-time extras are dropped so the cached JSON stays small. The
// language name is baked in from the engine's resolver so the static game never
// has to fall back to a bare code for a language missing from engine.js's
// LANGS table — the tree files carry the names, no separate lookup to maintain.
function cleanTree(node) {
  const out = { form: node.form, lang: node.lang };
  // Prefer a freshly resolved name (picks up corrections), but never strip a
  // name already baked in just because this run can't resolve the code — an
  // offline run or a transient Wiktionary failure shouldn't un-bake good names.
  const resolved = nameForLang(node.lang);
  const name = resolved !== node.lang ? resolved : node.name;
  if (name) out.name = name;
  if (node.rel) out.rel = node.rel;
  if (node.gloss) out.gloss = node.gloss;
  if (node.tr) out.tr = node.tr;
  out.children = (node.children || []).map(cleanTree);
  return out;
}

function bandFor(count) {
  for (const [name, b] of Object.entries(BANDS)) {
    if (count >= b.min && count <= b.max) return name;
  }
  return null;
}

function sortWords(arr) {
  const seen = new Set();
  return arr
    .filter((w) => {
      const k = w.toLowerCase();
      return seen.has(k) ? false : seen.add(k);
    })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// Pool names are plain single-token headwords, same rule as the game's
// recordDiscovered.
function isPlainWord(w) {
  return typeof w === 'string' && /^[\p{L}]+$/u.test(w);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function chunkFile(band, i) {
  return path.join(TREES_DIR, `${band}-${String(i).padStart(3, '0')}.json`);
}

// ---------- Store ----------
// state.words   {band: [name, ...]}         (display case, sorted)
// state.chunks  {band: [{key: tree}, ...]}  (key = name lowercased)
// state.pending [name, ...]
// Plus a lookup of every cached key so dupes are cheap to reject.

function emptyState() {
  return {
    words: { easy: [], medium: [], hard: [] },
    chunks: { easy: [], medium: [], hard: [] },
    pending: [],
    blocklist: [],
    rev: 0, // bumped when chunk contents change in place, to bust client caches
    keys: new Set(),
    dirtyChunks: new Set(), // "band/i" of chunk files needing a rewrite
    dirtyManifest: false,
  };
}

function loadState() {
  if (!fs.existsSync(MANIFEST_PATH)) return migrateLegacy();
  const m = readJson(MANIFEST_PATH);
  const state = emptyState();
  state.pending = Array.isArray(m.pending) ? m.pending.filter(isPlainWord) : [];
  state.blocklist = Array.isArray(m.blocklist) ? m.blocklist : [];
  state.rev = Number(m.rev) || 0;
  for (const band of Object.keys(BANDS)) {
    state.words[band] = Array.isArray(m.words && m.words[band]) ? m.words[band].slice() : [];
    const counts = (m.chunks && m.chunks[band]) || [];
    state.chunks[band] = counts.map((_, i) => readJson(chunkFile(band, i)));
    for (const chunk of state.chunks[band]) for (const k of Object.keys(chunk)) state.keys.add(k);
  }
  return state;
}

// One-time migration from the legacy layout: words.json (banded names +
// blocklist) and trees.json (one monolithic pretty-printed {key: tree}).
// Every cached tree is re-banded by its actual node count and chunked; pool
// words with no cached tree go to pending so the scheduled runs build them.
// The legacy files are deleted — the game now reads only the new layout.
function migrateLegacy() {
  const state = emptyState();
  const legacyWords = fs.existsSync(LEGACY_WORDS)
    ? readJson(LEGACY_WORDS)
    : { easy: [], medium: [], hard: [], blocklist: [] };
  const legacyTrees = fs.existsSync(LEGACY_TREES) ? readJson(LEGACY_TREES) : {};
  state.blocklist = Array.isArray(legacyWords.blocklist) ? legacyWords.blocklist : [];
  const blocked = new Set(state.blocklist.map((w) => w.toLowerCase()));

  const banded = { easy: [], medium: [], hard: [] };
  for (const key of Object.keys(legacyTrees).sort()) {
    const tree = cleanTree(legacyTrees[key]);
    const band = bandFor(countNodes(tree));
    const name = isPlainWord(tree.form) ? tree.form : key;
    if (!band || blocked.has(name.toLowerCase())) continue;
    banded[band].push([name.toLowerCase(), name, tree]);
  }
  for (const band of Object.keys(BANDS)) {
    for (const [key, name, tree] of banded[band]) {
      appendTree(state, band, name, key, tree);
    }
    state.words[band] = sortWords(state.words[band]);
  }

  // Legacy pool words whose trees were never cached: queue them for the
  // scheduled runs rather than shipping uncached pool entries.
  const pending = [];
  for (const band of Object.keys(BANDS)) {
    for (const name of legacyWords[band] || []) {
      const k = String(name).toLowerCase();
      if (!state.keys.has(k) && !blocked.has(k) && isPlainWord(name)) pending.push(name);
    }
  }
  state.pending = sortWords(pending);

  for (const f of [LEGACY_WORDS, LEGACY_TREES]) if (fs.existsSync(f)) fs.rmSync(f);
  state.dirtyManifest = true;
  console.log(
    `migrated legacy word bank: ${Object.values(state.words).reduce((s, a) => s + a.length, 0)} ` +
      `cached words, ${state.pending.length} queued for tree builds`
  );
  return state;
}

// Append one tree to its band's open chunk (creating a new chunk when the
// last one is full) and file the word into the band's list.
function appendTree(state, band, name, key, tree) {
  const chunks = state.chunks[band];
  if (!chunks.length || Object.keys(chunks[chunks.length - 1]).length >= CHUNK_SIZE) {
    chunks.push({});
  }
  chunks[chunks.length - 1][key] = tree;
  state.keys.add(key);
  state.words[band].push(name);
  state.dirtyChunks.add(`${band}/${chunks.length - 1}`);
  state.dirtyManifest = true;
}

function poolSize(state, band) {
  return state.words[band].length;
}

function wouldUnbalance(state, band) {
  const others = Object.keys(BANDS)
    .filter((k) => k !== band)
    .map((k) => poolSize(state, k));
  return poolSize(state, band) + 1 - Math.min(...others) > MAX_BAND_SKEW;
}

// ---------- Engine ----------
// engine.js is the game's own Wiktionary scraper — browser-flavoured but
// DOM-free except for one DOMParser use, so it runs under Node with linkedom
// supplying DOMParser. Evaluating the source keeps this script and the game
// building byte-identical trees.

function loadEngine() {
  // linkedom is only needed by buildTree's etytree mirror. Name resolution
  // (langName/resolveLangNames, used to bake names into trees) touches no DOM,
  // so tolerate its absence with a stub — an --offline run that only rebakes
  // existing chunks then works without the dependency installed.
  let DOMParser;
  try {
    ({ DOMParser } = require('linkedom'));
  } catch {
    DOMParser = function () {};
  }
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  const factory = new Function(
    'DOMParser',
    `${src}\nreturn { buildTree, findRandomTree, isRateLimited, langName, resolveLangNames };`
  );
  return factory(DOMParser);
}

// Wikimedia asks API clients to identify themselves.
function politeFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = (url, opts) =>
    real(url, {
      ...opts,
      headers: {
        'User-Agent':
          'rjayasin.github.io etymology pool updater (https://github.com/rjayasin/rjayasin.github.io)',
        ...((opts && opts.headers) || {}),
      },
    });
}

// A tree build returning null is normally "this word has no usable
// etymology" — but during an outage or a rate-limit park it means nothing.
// Probe connectivity once up front so a run that can't reach Wiktionary
// leaves the pending queue untouched instead of draining it.
async function wiktionaryReachable() {
  try {
    const r = await fetch(
      'https://en.wiktionary.org/w/api.php?action=query&meta=siteinfo&format=json&formatversion=2'
    );
    return r.ok;
  } catch {
    return false;
  }
}

// Add one built tree to the store under all the game's rules. Returns a
// short reason string when rejected, null when added.
function admitWord(state, name, rawTree, { checkSkew }) {
  const tree = cleanTree(rawTree);
  const finalName = isPlainWord(tree.form) ? tree.form : name;
  const key = finalName.toLowerCase();
  if (!isPlainWord(finalName)) return 'not a plain word';
  if (state.keys.has(key)) return 'already cached';
  if (state.blocklist.some((w) => w.toLowerCase() === key)) return 'blocklisted';
  const band = bandFor(countNodes(tree));
  if (!band) return 'tree size fits no band';
  if (poolSize(state, band) >= BAND_CAP) return `${band} band at cap`;
  if (checkSkew && wouldUnbalance(state, band)) return `${band} band too far ahead`;
  appendTree(state, band, finalName, key, tree);
  state.words[band] = sortWords(state.words[band]);
  return null;
}

// Phase 1: build trees for player-discovered words waiting in pending.
async function promotePending(state, engine, budget) {
  let promoted = 0;
  const queue = state.pending.slice();
  if (!queue.length) {
    log('promote: no pending words queued');
    return 0;
  }
  log(
    `promote: ${queue.length} pending word${queue.length > 1 ? 's' : ''} queued (budget ${budget.left})`
  );
  for (const name of queue) {
    if (budget.left <= 0 || engine.isRateLimited()) break;
    budget.left--;
    const tree = await engine.buildTree(name, 'en');
    if (!tree) {
      if (engine.isRateLimited()) break; // transient — keep it queued
      dropPending(state, name, 'no usable tree');
      continue;
    }
    const reason = admitWord(state, name, tree, { checkSkew: false });
    dropPending(state, name, reason); // added or rejected — either way it's resolved
    if (!reason) {
      promoted++;
      log(`  promoted "${name}" (${countNodes(cleanTree(tree))} nodes)`);
    }
  }
  log(`promote: added ${promoted}, ${budget.left} build budget left`);
  return promoted;
}

function dropPending(state, name, reason) {
  const before = state.pending.length;
  state.pending = state.pending.filter((w) => w.toLowerCase() !== name.toLowerCase());
  if (state.pending.length !== before) {
    state.dirtyManifest = true;
    if (reason) console.log(`  pending "${name}": ${reason}`);
  }
}

// Phase 2: grow the pool with fresh discoveries while any band has room.
async function discoverWords(state, engine, budget) {
  let added = 0;
  if (Object.keys(BANDS).every((b) => poolSize(state, b) >= BAND_CAP)) {
    log('discover: every band at cap, skipping');
    return 0;
  }
  log(`discover: hunting up to ${MAX_NEW_WORDS} new words (budget ${budget.left})`);
  while (added < MAX_NEW_WORDS && budget.left > 0 && !engine.isRateLimited()) {
    if (Object.keys(BANDS).every((b) => poolSize(state, b) >= BAND_CAP)) break;
    budget.left--;
    const item = await engine.findRandomTree();
    if (!item) continue;
    const reason = admitWord(state, item.word, item.tree, { checkSkew: true });
    if (!reason) {
      added++;
      log(`  discovered "${item.word}" (${countNodes(cleanTree(item.tree))} nodes)`);
    } else console.log(`  discovery "${item.word}": ${reason}`);
  }
  log(`discover: added ${added}, ${budget.left} build budget left`);
  return added;
}

// ---------- Output ----------

function writeState(state) {
  if (!fs.existsSync(TREES_DIR)) fs.mkdirSync(TREES_DIR, { recursive: true });
  if (!state.dirtyChunks.size && !state.dirtyManifest) {
    log('write: nothing changed, no files written');
    return;
  }
  for (const id of state.dirtyChunks) {
    const [band, i] = id.split('/');
    // Minified: chunks are prettier-ignored, and the wire cost is what counts.
    fs.writeFileSync(chunkFile(band, Number(i)), JSON.stringify(state.chunks[band][i]) + '\n');
  }
  log(
    `write: ${state.dirtyChunks.size} chunk file${state.dirtyChunks.size === 1 ? '' : 's'}` +
      `${state.dirtyManifest ? ' + manifest' : ''}`
  );
  if (state.dirtyManifest) {
    const manifest = {
      chunkSize: CHUNK_SIZE,
      rev: state.rev,
      chunks: {},
      words: {},
      pending: sortWords(state.pending),
      blocklist: state.blocklist,
    };
    for (const band of Object.keys(BANDS)) {
      manifest.chunks[band] = state.chunks[band].map((c) => Object.keys(c).length);
      manifest.words[band] = sortWords(state.words[band]);
    }
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  }
}

// ---------- Language names ----------
// Every distinct language code used anywhere in the pool.
function collectPoolLangs(state) {
  const codes = new Set();
  const walk = (n) => {
    if (n.lang) codes.add(n.lang);
    (n.children || []).forEach(walk);
  };
  for (const band of Object.keys(BANDS)) {
    for (const chunk of state.chunks[band]) for (const tree of Object.values(chunk)) walk(tree);
  }
  return codes;
}

// Resolve the display names for every pool code the engine doesn't already know
// offline, filling the engine's cache so cleanTree can bake them in. Run this
// BEFORE the tree-build phase: builds burn through the Wiktionary rate limit, and
// once the engine is parked resolveLangNames bails, leaving the codes bare. The
// lookups are chunked so no single request grows an over-long URL, and a parked
// engine is waited out between chunks rather than skipped.
async function resolvePoolLangs(state, engine) {
  const total = collectPoolLangs(state).size;
  const missing = [...collectPoolLangs(state)].filter((c) => c && engine.langName(c) === c);
  if (!missing.length) {
    log(`language names: all ${total} pool codes already known, nothing to resolve`);
    return;
  }
  const batches = Math.ceil(missing.length / RESOLVE_BATCH);
  log(
    `language names: ${missing.length}/${total} codes need resolving, ` +
      `in ${batches} batch${batches > 1 ? 'es' : ''} of up to ${RESOLVE_BATCH}`
  );
  for (let i = 0; i < missing.length; i += RESOLVE_BATCH) {
    // Bounded wait: let a rate-limit window lift so the batch actually fetches.
    for (let waited = 0; engine.isRateLimited() && waited < 60000; waited += 1000) {
      if (waited === 0) log('  rate-limited — waiting for the window to lift...');
      await sleep(1000);
    }
    const batch = missing.slice(i, i + RESOLVE_BATCH);
    await engine.resolveLangNames(batch);
    const got = batch.filter((c) => engine.langName(c) !== c);
    log(`  batch ${i / RESOLVE_BATCH + 1}/${batches}: resolved ${got.length}/${batch.length}`);
  }
  const still = missing.filter((c) => engine.langName(c) === c);
  log(
    `language names: resolved ${missing.length - still.length}/${missing.length}` +
      (still.length ? `; unresolved: ${still.join(', ')}` : '')
  );
}

// Bake language names into every cached tree so the static game never renders a
// bare code. New trees get names at build time via cleanTree; this backfills the
// ones already stored (a one-time rewrite of existing chunks) using names already
// resolved into the engine's cache by resolvePoolLangs and the tree builds. Only
// chunks that actually change are marked dirty, and a changed chunk bumps the
// manifest rev so clients holding a full (count-unchanged) chunk refetch it.
function bakeNames(state) {
  let baked = 0;
  for (const band of Object.keys(BANDS)) {
    state.chunks[band].forEach((chunk, i) => {
      let changed = false;
      for (const key of Object.keys(chunk)) {
        const next = cleanTree(chunk[key]);
        if (JSON.stringify(next) !== JSON.stringify(chunk[key])) {
          chunk[key] = next;
          changed = true;
          baked++;
        }
      }
      if (changed) state.dirtyChunks.add(`${band}/${i}`);
    });
  }
  if (baked) {
    state.rev++;
    state.dirtyManifest = true;
    log(`baking: updated ${baked} tree${baked > 1 ? 's' : ''} (manifest rev -> ${state.rev})`);
  } else {
    log('baking: all trees already carry current names, no changes');
  }
  return baked;
}

async function main() {
  const mode = OFFLINE ? 'offline' : BAKE_ONLY ? 'bake-only' : 'full';
  log(`etymology pool update starting (mode: ${mode})`);
  const hadManifest = fs.existsSync(MANIFEST_PATH);
  const engine = loadEngine();
  nameForLang = engine.langName; // cleanTree bakes names in from here on
  const state = loadState();
  const startTotal = Object.keys(BANDS)
    .map((b) => `${b} ${poolSize(state, b)}`)
    .join(', ');
  log(`loaded pool: ${startTotal}; pending ${state.pending.length}; rev ${state.rev}`);
  let promoted = 0;
  let discovered = 0;
  let online = false;

  if (!OFFLINE) {
    politeFetch();
    online = await wiktionaryReachable();
    log(`Wiktionary reachable: ${online ? 'yes' : 'no'}`);
    if (online) {
      // Names first, while the rate-limit budget is untouched, then builds.
      await resolvePoolLangs(state, engine);
      if (BAKE_ONLY) {
        log('bake-only: skipping promote/discover phases');
      } else {
        const budget = { left: MAX_BUILDS };
        promoted = await promotePending(state, engine, budget);
        discovered = await discoverWords(state, engine, budget);
      }
    } else {
      log('Wiktionary unreachable — skipping name resolution and tree builds this run');
    }
  } else {
    log('offline: skipping network phases, baking with names known offline');
  }

  const baked = bakeNames(state);
  writeState(state);

  const total = Object.keys(BANDS)
    .map((b) => `${b} ${poolSize(state, b)}`)
    .join(', ');
  log(`done: pool ${total}; pending ${state.pending.length}; rev ${state.rev}`);

  // Hand the workflow a commit message describing what actually changed.
  const parts = [];
  if (!hadManifest) parts.push('migrate to chunked tree store');
  if (promoted) parts.push(`promote ${promoted} pending word${promoted > 1 ? 's' : ''}`);
  if (discovered) parts.push(`add ${discovered} new word${discovered > 1 ? 's' : ''}`);
  if (baked) parts.push(`bake language names into ${baked} tree${baked > 1 ? 's' : ''}`);
  if (parts.length && process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `POOL_MSG=etymology game: ${parts.join(', ')}\n`);
  }
}

main().then(
  () => process.exit(0), // engine timers (rate-limit gaps) may still be live
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
