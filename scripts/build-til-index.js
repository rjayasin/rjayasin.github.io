#!/usr/bin/env node
// Scans til/*.md (flat, no subfolders) and writes til/tils.json — the index the
// TIL page fetches at runtime instead of a hand-maintained array. Each entry is
// { slug, title, tags, added }, where:
//   - slug   comes from the filename (foo.md -> foo)
//   - title  is the first `# ` heading in the body
//   - tags   / added come from a small YAML-ish frontmatter block
//
// tils.json is deliberately NOT committed (see .gitignore): the deploy workflow
// regenerates it into the Pages artifact on every build, and `make til` writes
// it locally for previewing. So the .md files are the single source of truth.
//
// Entries are sorted oldest-first for a stable file; the page re-sorts by date
// (newest first) at render time, so this order is purely cosmetic.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TIL_DIR = path.join(ROOT, 'til');
const OUT = path.join(TIL_DIR, 'tils.json');

// Splits leading `---\n...\n---` frontmatter from the rest of the document.
// Returns { fm, body } with fm='' when there is no frontmatter block.
function splitFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: '', body: src };
  return { fm: m[1], body: src.slice(m[0].length) };
}

// Minimal frontmatter parser: `key: value` per line, where value is either a
// scalar or an inline `[a, b, c]` array. Enough for `added` and `tags`; not a
// general YAML parser.
function parseFrontmatter(fm) {
  const out = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    const arr = value.match(/^\[(.*)\]$/);
    if (arr) {
      out[key] = arr[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      out[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

function firstHeading(body) {
  for (const line of body.split('\n')) {
    const m = line.match(/^#\s+(.*)$/);
    if (m) return m[1].trim();
  }
  return null;
}

function main() {
  const files = fs
    .readdirSync(TIL_DIR)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');

  const tils = [];
  for (const file of files) {
    const slug = file.slice(0, -3);
    const src = fs.readFileSync(path.join(TIL_DIR, file), 'utf8');
    const { fm, body } = splitFrontmatter(src);
    const meta = parseFrontmatter(fm);
    const title = firstHeading(body);
    if (!title) {
      process.stderr.write(`  skip ${file}: no '# ' heading\n`);
      continue;
    }
    if (!meta.added) {
      process.stderr.write(`  skip ${file}: no 'added' in frontmatter\n`);
      continue;
    }
    tils.push({ slug, title, tags: meta.tags || [], added: meta.added });
    process.stdout.write(`  ${meta.added}  ${slug}\n`);
  }

  tils.sort((a, b) => a.added.localeCompare(b.added) || a.slug.localeCompare(b.slug));
  fs.writeFileSync(OUT, JSON.stringify(tils, null, 2) + '\n');
  process.stdout.write(`\nwrote ${tils.length} entries to ${path.relative(ROOT, OUT)}\n`);
}

main();
