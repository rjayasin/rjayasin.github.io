#!/usr/bin/env node
// Rewrites `?v=<anything>` on root-relative .css/.js references inside the
// given HTML files to `?v=<8-char content hash>` of the referenced file.
//
// The deploy workflow runs this over the Pages artifact so HTML and assets
// always ship as a matched set: the URL changes exactly when the file content
// changes, and nobody has to remember to bump versions by hand. The literal
// `?v=N` committed in source is a dev-only placeholder (servers ignore the
// query string), so it never needs touching.
//
// Usage: node scripts/rewrite-asset-versions.js <file.html> [...]
// (the workflow feeds it `git ls-files '*.html'` via xargs)

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Root-relative path ending in .css/.js, followed by ?v=<token>. Anchoring on
// the leading `/` keeps external URLs (e.g. youtube.com/watch?v=) untouched.
const REF = /(\/[\w./-]+\.(?:css|js))\?v=[\w-]+/g;

const hashes = new Map();
function hashFor(ref, htmlFile) {
  if (!hashes.has(ref)) {
    const file = path.join(ROOT, ref);
    if (!fs.existsSync(file)) {
      process.stderr.write(`${htmlFile}: versioned asset not found: ${ref}\n`);
      process.exit(1);
    }
    hashes.set(
      ref,
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 8)
    );
  }
  return hashes.get(ref);
}

let rewrites = 0;
for (const htmlFile of process.argv.slice(2)) {
  const src = fs.readFileSync(htmlFile, 'utf8');
  const out = src.replace(REF, (_, ref) => {
    rewrites++;
    const versioned = `${ref}?v=${hashFor(ref, htmlFile)}`;
    process.stdout.write(`  ${htmlFile}: ${versioned}\n`);
    return versioned;
  });
  if (out !== src) fs.writeFileSync(htmlFile, out);
}
process.stdout.write(`rewrote ${rewrites} asset reference${rewrites === 1 ? '' : 's'}\n`);
