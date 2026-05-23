#!/usr/bin/env node
// Parses ../sitemap/index.html, looks up the last-updated date and commit URL
// for every link (git log for internal paths, the GitHub commits API for
// links into other rjayasin.github.io repos), and writes ../sitemap/dates.json
// mapping each href to { date, url }. Skips hrefs whose dates can't be
// determined so the page can render them last in the "recent" view.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap', 'index.html');
const OUT = path.join(ROOT, 'sitemap', 'dates.json');
const USER_HOST = 'rjayasin.github.io';
const SELF_REPO = 'rjayasin/rjayasin.github.io';

// For pages whose behavior lives in a file other than their default directory
// — e.g. the grid page is served by the repo root's index.html but its logic
// lives in grid.js, so date it from grid.js.
const PATH_OVERRIDES = {
  '/': 'grid.js',
};

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

function gitEntry(relPath) {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI%x09%H', '--', relPath],
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    if (!out) return null;
    const [date, sha] = out.split('\t');
    if (!date || !sha) return null;
    return { date, url: `https://github.com/${SELF_REPO}/commit/${sha}` };
  } catch {
    return null;
  }
}

function internalPath(href) {
  if (PATH_OVERRIDES[href]) return PATH_OVERRIDES[href];
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

async function ghCommitEntry(repo, subPath) {
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
  const commit = data?.[0];
  const date = commit?.commit?.committer?.date || commit?.commit?.author?.date;
  if (!date) return null;
  return { date, url: commit.html_url || null };
}

function asEntry(v) {
  if (!v) return null;
  if (typeof v === 'string') return { date: v, url: null };
  if (typeof v === 'object' && v.date) return { date: v.date, url: v.url || null };
  return null;
}

async function main() {
  const html = fs.readFileSync(SITEMAP, 'utf8');
  const hrefs = extractHrefs(html);
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const entries = {};
  for (const href of hrefs) {
    let entry = null;
    const rel = internalPath(href);
    if (rel) {
      entry = gitEntry(rel);
    } else {
      const ext = parseUserHost(href);
      if (ext) {
        try { entry = await ghCommitEntry(ext.repo, ext.path); }
        catch (e) { process.stderr.write(`  ${e.message}\n`); }
      }
    }
    const prior = asEntry(existing[href]);
    if (!entry && prior) entry = prior;
    else if (entry && prior) {
      if (!entry.date && prior.date) entry.date = prior.date;
      if (!entry.url && prior.url) entry.url = prior.url;
    }
    if (entry?.date) entries[href] = entry;
    process.stdout.write(`${entry?.date || '       skip       '}  ${href}\n`);
  }
  const ordered = Object.fromEntries(
    Object.entries(entries).sort(([, a], [, b]) => (a.date < b.date ? 1 : -1))
  );
  fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n');
  process.stdout.write(`\nwrote ${Object.keys(ordered).length} entries to ${path.relative(ROOT, OUT)}\n`);
}

main().catch((e) => { process.stderr.write(e.stack + '\n'); process.exit(1); });
