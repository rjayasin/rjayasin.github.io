#!/usr/bin/env node
// Writes fonts/added.js (window.fontsAdded, date -> slugs): when each
// fonts/<slug>.woff2 was last added in git. Generated at deploy, not committed.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const log = execFileSync(
  'git',
  ['log', '--diff-filter=A', '--format=%x00%cs', '--name-only', '--', 'fonts/*.woff2'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);

const live = new Set(
  execFileSync('git', ['ls-files', 'fonts/*.woff2'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
);
const seen = new Set();
const byDate = {};
for (const commit of log.split('\0').slice(1)) {
  const [date, ...files] = commit.trim().split('\n');
  for (const file of files) {
    if (!live.has(file) || seen.has(file)) continue;
    seen.add(file);
    (byDate[date] ||= []).push(path.basename(file, '.woff2'));
  }
}

for (const slugs of Object.values(byDate)) slugs.sort();
fs.writeFileSync(
  path.join(ROOT, 'fonts', 'added.js'),
  `window.fontsAdded = ${JSON.stringify(byDate)};\n`
);
console.log(`fonts/added.js: ${seen.size} fonts`);
