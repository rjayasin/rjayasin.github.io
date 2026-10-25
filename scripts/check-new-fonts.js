#!/usr/bin/env node
// Fetches the live Google Fonts family list from fonts.google.com's metadata
// endpoint and appends any families missing from ../fonts.js. Preserves the
// file's existing codepoint sort order and formatting. Families listed in
// culled-fonts.json (near-duplicates of a family we keep, or families with no
// English letters) are never re-added, and neither are families that share a
// cached file name with a typefree.org font.
// Exits non-zero on network/parse failures; exits 0 with no file changes when
// nothing is new.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FONTS_JS = path.join(ROOT, 'fonts.js');
// Maps each culled family to the kept family it's indistinguishable from, or
// to null when its Latin subset has no English letters to show.
const CULLED_JSON = path.join(__dirname, 'culled-fonts.json');
const TYPEFREE_JS = path.join(ROOT, 'typefree-fonts.js');
const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function loadLocal() {
  const src = fs.readFileSync(FONTS_JS, 'utf8');
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandbox.window);
  const list = sandbox.window.googleFonts;
  if (!Array.isArray(list) || !list.length) {
    throw new Error('Could not read window.googleFonts from fonts.js');
  }
  return list;
}

async function fetchRemote() {
  const res = await fetch(METADATA_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`metadata fetch ${res.status}`);
  let text = await res.text();
  // Google's JSON endpoints prefix responses with )]}' to defeat XSSI.
  if (text.startsWith(")]}'")) text = text.replace(/^\)\]\}'\s*/, '');
  const data = JSON.parse(text);
  const families = data.familyMetadataList;
  if (!Array.isArray(families) || !families.length) {
    throw new Error('familyMetadataList missing or empty');
  }
  const names = families.map((f) => f.family).filter(Boolean);
  if (!names.length) throw new Error('no family names in metadata');
  return names;
}

// Matches Common.slugifyFont in common.js, which names the cached files.
function slugifyFont(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Slugs of the typefree.org fonts, so a new Google family can't take over
// one's cached .woff2.
function loadTypefreeSlugs() {
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', fs.readFileSync(TYPEFREE_JS, 'utf8'))(sandbox.window);
  return new Set(Object.keys(sandbox.window.typefreeFonts || {}).map(slugifyFont));
}

function renderFontsJs(names) {
  const body = names.map((n) => `  ${JSON.stringify(n)}`).join(',\n');
  return `window.googleFonts = [\n${body}\n];\n`;
}

(async () => {
  const local = loadLocal();
  const localSet = new Set(local);
  const culled = new Set(Object.keys(JSON.parse(fs.readFileSync(CULLED_JSON, 'utf8'))));
  const typefree = loadTypefreeSlugs();
  const remote = await fetchRemote();
  const newFonts = remote.filter(
    (f) => !localSet.has(f) && !culled.has(f) && !typefree.has(slugifyFont(f))
  );

  if (newFonts.length === 0) {
    console.log('ADDED=0');
    console.log('No new fonts.');
    return;
  }

  const merged = [...local, ...newFonts].sort();
  fs.writeFileSync(FONTS_JS, renderFontsJs(merged));

  console.log(`ADDED=${newFonts.length}`);
  for (const f of newFonts) console.log(`  + ${f}`);
})().catch((err) => {
  process.stderr.write(`check-new-fonts: ${err.message}\n`);
  process.exit(1);
});
