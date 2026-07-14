#!/usr/bin/env node
// Fetches category and date-added metadata for every family in ../fonts.js
// from fonts.google.com's metadata endpoint and writes ../fonts-meta.js
// (window.googleFontsMeta), consumed by the /fonts/ explorer page. Families
// missing upstream get a -1 category index and empty date so the page can
// still list them. Exits non-zero on network/parse failures.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FONTS_JS = path.join(ROOT, 'fonts.js');
const OUT_FILE = path.join(ROOT, 'fonts-meta.js');
const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Fixed order so category indexes in fonts-meta.js stay stable across runs.
const CATEGORIES = ['Sans Serif', 'Serif', 'Display', 'Handwriting', 'Monospace'];

function loadFontList() {
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
  return families;
}

(async () => {
  const fonts = loadFontList();
  const remote = new Map((await fetchRemote()).map((f) => [f.family, f]));

  let unresolved = 0;
  const lines = fonts.map((family) => {
    const m = remote.get(family);
    const cat = m ? CATEGORIES.indexOf(m.category) : -1;
    const date = (m && m.dateAdded) || '';
    if (!m) unresolved++;
    return `    ${JSON.stringify(family)}: [${cat}, ${JSON.stringify(date)}]`;
  });

  const out =
    'window.googleFontsMeta = {\n' +
    `  categories: ${JSON.stringify(CATEGORIES)},\n` +
    '  fonts: {\n' +
    lines.join(',\n') +
    '\n  },\n};\n';
  fs.writeFileSync(OUT_FILE, out);
  console.log(
    `Wrote ${path.relative(ROOT, OUT_FILE)} (${fonts.length} fonts, ${unresolved} unresolved).`
  );
})().catch((err) => {
  process.stderr.write(`fetch-font-meta: ${err.message}\n`);
  process.exit(1);
});
