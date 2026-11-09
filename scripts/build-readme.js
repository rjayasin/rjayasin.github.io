#!/usr/bin/env node
// Writes README.md from the tree view in sitemap/index.html, so the sitemap is
// the single list of pages. `--check` exits non-zero instead of writing when
// README.md is out of date.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap', 'index.html');
const README = path.join(ROOT, 'README.md');
const ORIGIN = 'https://rjayasin.github.io';

function build(html) {
  const start = html.indexOf('<div id="tree-view">');
  const end = html.indexOf('</div>', start);
  if (start === -1 || end === -1) throw new Error('tree-view not found in sitemap/index.html');
  const tree = html.slice(start, end);

  const out = [
    '<!-- Generated from sitemap/index.html by `make readme`; edit the sitemap instead. -->',
  ];
  const re =
    /<h2>([^<]+)<\/h2>|<li><span class="branch">([^<]*)<\/span>(?:<span class="subheading">([^<]+)<\/span>|<a\b[^>]*\bhref="([^"]+)"[^>]*>([^<]+)<\/a>)<\/li>/g;
  let m;
  while ((m = re.exec(tree)) !== null) {
    const [, heading, branch, subheading, href, label] = m;
    if (heading) {
      out.push('', `\`${heading}\``, '');
      continue;
    }
    const indent = branch.length > 4 ? '  ' : '';
    if (subheading) {
      out.push(`${indent}- \`${subheading}\``);
    } else {
      const url = href.startsWith('/') ? ORIGIN + href : href;
      out.push(`${indent}- [\`${label}\`](${url})`);
    }
  }
  return out.join('\n') + '\n';
}

const next = build(fs.readFileSync(SITEMAP, 'utf8'));
const current = fs.existsSync(README) ? fs.readFileSync(README, 'utf8') : '';

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('README.md is out of sync with sitemap/index.html; run `make readme`.');
    process.exit(1);
  }
} else if (next !== current) {
  fs.writeFileSync(README, next);
  console.log('README.md updated');
}
