#!/usr/bin/env node
// Parses ../sitemap/index.html, looks up the last-updated date for every link
// (git log for internal paths, the GitHub commits API for links into other
// rjayasin.github.io repos), and writes ../sitemap/dates.json mapping each
// href to an ISO timestamp. Skips hrefs whose dates can't be determined so
// the page can render them last in the "recent" view.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap', 'index.html');
const OUT = path.join(ROOT, 'sitemap', 'dates.json');
const USER_HOST = 'rjayasin.github.io';

function extractHrefs(html) {
  const ulStart = html.indexOf('<ul>');
  if (ulStart === -1) return [];
  const hrefs = [];
  const re = /<a\b[^>]*\bhref="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index < ulStart) continue;
    hrefs.push(m[1]);
  }
  return [...new Set(hrefs)];
}

function gitDate(relPath) {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', relPath],
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function internalPath(href) {
  if (href === '/') return 'index.html';
  if (!href.startsWith('/')) return null;
  const clean = href.replace(/^\/+/, '').replace(/\/+$/, '');
  return clean || 'index.html';
}

function parseUserHost(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.host !== USER_HOST) return null;
  const segs = url.pathname.split('/').filter(Boolean);
  if (!segs.length) return null;
  const repo = segs[0];
  const subPath = segs.slice(1).join('/');
  return { repo, path: subPath };
}

async function ghCommitDate(repo, subPath) {
  const params = new URLSearchParams({ per_page: '1' });
  if (subPath) params.set('path', subPath);
  const url = `https://api.github.com/repos/rjayasin/${repo}/commits?${params}`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    process.stderr.write(`  ${res.status} ${url}\n`);
    return null;
  }
  const data = await res.json();
  const iso = data?.[0]?.commit?.committer?.date || data?.[0]?.commit?.author?.date;
  return iso || null;
}

async function main() {
  const html = fs.readFileSync(SITEMAP, 'utf8');
  const hrefs = extractHrefs(html);
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const dates = {};
  for (const href of hrefs) {
    let date = null;
    const rel = internalPath(href);
    if (rel) {
      date = gitDate(rel);
    } else {
      const ext = parseUserHost(href);
      if (ext) {
        try { date = await ghCommitDate(ext.repo, ext.path); }
        catch (e) { process.stderr.write(`  ${e.message}\n`); }
      }
    }
    if (!date && existing[href]) date = existing[href];
    if (date) dates[href] = date;
    process.stdout.write(`${date || '       skip       '}  ${href}\n`);
  }
  const ordered = Object.fromEntries(
    Object.entries(dates).sort(([, a], [, b]) => (a < b ? 1 : -1))
  );
  fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n');
  process.stdout.write(`\nwrote ${Object.keys(ordered).length} entries to ${path.relative(ROOT, OUT)}\n`);
}

main().catch((e) => { process.stderr.write(e.stack + '\n'); process.exit(1); });
