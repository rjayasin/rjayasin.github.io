#!/usr/bin/env node
// Parses ../sitemap/index.html, looks up the last-updated date and commit URL
// for every link (git log for internal paths, the GitHub commits API for
// links into other rjayasin.github.io repos, skipping bot commits for the
// hrefs in HUMAN_COMMITS_ONLY), and writes ../sitemap/dates.json
// mapping each href to { date, url }. Skips hrefs whose dates can't be
// determined so the page can render them last in the "recent" view.
//
// Key order in dates.json follows the existing file (so a typical run only
// touches the date/url values, keeping diffs small); brand-new hrefs are
// appended in the order they appear in sitemap/index.html, and hrefs no
// longer in the sitemap are dropped. The page sorts entries by date at
// render time, so the on-disk order is purely cosmetic.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap', 'index.html');
const OUT = path.join(ROOT, 'sitemap', 'dates.json');
const USER_HOST = 'rjayasin.github.io';
const SELF_REPO = 'rjayasin/rjayasin.github.io';

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

function gitEntry(pathspecs) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI%x09%H', '--', ...pathspecs], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    if (!out) return null;
    const [date, sha] = out.split('\t');
    if (!date || !sha) return null;
    return { date, url: `https://github.com/${SELF_REPO}/commit/${sha}` };
  } catch {
    return null;
  }
}

// The git pathspec(s) whose last commit dates an internal href. Usually just
// the page's own path, but a few entries need a narrower scope so a sibling's
// commits don't bump their "updated" timestamp. Returns null for non-internal
// hrefs (handled via the GitHub API instead).
function internalPathspecs(href) {
  if (href === '/') return ['index.html'];
  // The sitemap's own entry must track real page changes, not metadata churn:
  // scope it to index.html so commits that only touch sibling sitemap/dates.json
  // (regenerated on every deploy) don't bump its "updated" timestamp.
  if (href === '/sitemap/') return ['sitemap/index.html'];
  // The tree-viewer (/etymology/) and the game (/etymology/game/) share a
  // directory but are separate pages. Scope the viewer to everything under
  // etymology/ EXCEPT the game subfolder, so game-only commits (e.g. its
  // words.json growing) don't bump the viewer. The game maps to its own folder
  // below and stays independent.
  if (href === '/etymology/') return ['etymology', ':(exclude)etymology/game'];
  // The explorer page shares fonts/ with ~2k woff2 files the weekly font
  // workflow keeps adding to; scope it to its own files (plus the metadata
  // it renders) so those drops don't bump its "updated" timestamp.
  if (href === '/fonts/')
    return ['fonts/index.html', 'fonts/explorer.css', 'fonts/explorer.js', 'fonts-meta.js'];
  if (!href.startsWith('/')) return null;
  const clean = href.replace(/^\/+/, '').replace(/\/+$/, '');
  return [clean || 'index.html'];
}

function parseUserHost(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.host !== USER_HOST) return null;
  const segs = url.pathname.split('/').filter(Boolean);
  if (!segs.length) return null;
  const repo = segs[0];
  const subPath = segs.slice(1).join('/');
  return { repo, path: subPath };
}

// Dated by their last human commit, so a repo's own scheduled bot commits
// don't keep marking the page as freshly updated.
const HUMAN_COMMITS_ONLY = new Set(['https://rjayasin.github.io/dodgers-notifier/']);

function isBotCommit(commit) {
  if (commit?.author?.type === 'Bot') return true;
  return /\[bot\]$/.test(commit?.commit?.author?.name || '');
}

const HUMAN_COMMIT_MAX_PAGES = 3;

async function ghCommits(repo, subPath, { perPage = 1, page = 1 } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (subPath) params.set('path', subPath);
  const url = `https://api.github.com/repos/rjayasin/${repo}/commits?${params}`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    process.stderr.write(`  ${res.status} ${url}\n`);
    return null;
  }
  return res.json();
}

function commitEntry(commit) {
  const date = commit?.commit?.committer?.date || commit?.commit?.author?.date;
  if (!date) return null;
  return { date, url: commit.html_url || null };
}

async function ghCommitEntry(repo, subPath, humanOnly) {
  if (!humanOnly) {
    const data = await ghCommits(repo, subPath);
    return commitEntry(data?.[0]);
  }
  const perPage = 100;
  for (let page = 1; page <= HUMAN_COMMIT_MAX_PAGES; page++) {
    const data = await ghCommits(repo, subPath, { perPage, page });
    if (!data?.length) return null;
    const commit = data.find((c) => !isBotCommit(c));
    if (commit) return commitEntry(commit);
    if (data.length < perPage) return null;
  }
  return null;
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
    const rel = internalPathspecs(href);
    if (rel) {
      entry = gitEntry(rel);
    } else {
      const ext = parseUserHost(href);
      if (ext) {
        try {
          entry = await ghCommitEntry(ext.repo, ext.path, HUMAN_COMMITS_ONLY.has(href));
        } catch (e) {
          process.stderr.write(`  ${e.message}\n`);
        }
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
  const ordered = {};
  for (const href of Object.keys(existing)) {
    if (entries[href]) ordered[href] = entries[href];
  }
  for (const href of hrefs) {
    if (entries[href] && !(href in ordered)) ordered[href] = entries[href];
  }
  fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n');
  process.stdout.write(
    `\nwrote ${Object.keys(ordered).length} entries to ${path.relative(ROOT, OUT)}\n`
  );
}

main().catch((e) => {
  process.stderr.write(e.stack + '\n');
  process.exit(1);
});
