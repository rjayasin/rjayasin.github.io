#!/usr/bin/env node
// Fetches the live Google Fonts family list from fonts.google.com's metadata
// endpoint and appends any families missing from ../fonts.js. Preserves the
// file's existing codepoint sort order and formatting. Exits non-zero on
// network/parse failures; exits 0 with no file changes when nothing is new.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FONTS_JS = path.join(ROOT, 'fonts.js');
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

function renderFontsJs(names) {
  const body = names.map((n) => `  ${JSON.stringify(n)}`).join(',\n');
  return `window.googleFonts = [\n${body}\n];\n`;
}

(async () => {
  const local = loadLocal();
  const localSet = new Set(local);
  const remote = await fetchRemote();
  const newFonts = remote.filter((f) => !localSet.has(f));

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
