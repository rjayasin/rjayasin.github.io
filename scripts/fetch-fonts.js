#!/usr/bin/env node
// Downloads one regular-weight, latin-subset woff2 for every font in
// ../fonts.js and writes it to ../fonts/<slug>.woff2. Idempotent: skips
// fonts whose woff2 already exists. Exits non-zero if any font failed.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FONTS_JS = path.join(ROOT, 'fonts.js');
const OUT_DIR = path.join(ROOT, 'fonts');

const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 12;

function slugifyFont(name) {
    return name.toLowerCase().replace(/ /g, '-');
}

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

// Most fonts respond to css2 with no axes (defaults to wght=400). A handful
// of families don't ship 400 (italic-only, single-weight, etc.) and return
// 400; for those we try a series of common alternative axes.
const AXIS_FALLBACKS = [
    '',
    ':wght@300',
    ':wght@500',
    ':wght@700',
    ':ital@1',
    ':wght@200',
    ':wght@800',
    ':wght@900',
    ':wght@100',
];

async function fetchCss(font) {
    let lastStatus = 0;
    for (const axis of AXIS_FALLBACKS) {
        const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font) + axis}&display=block`;
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (res.ok) return res.text();
        lastStatus = res.status;
        if (res.status !== 400) break;
    }
    throw new Error(`css ${lastStatus} for ${font}`);
}

function pickWoff2Url(css) {
    // Each @font-face block has its own unicode-range. The "latin" subset
    // is the one whose range covers basic latin (U+0000-00FF). If no block
    // declares unicode-range (some fonts return a single block), take the
    // only url. Fall back to the first url as a last resort.
    const blocks = css
        .split(/@font-face\s*{/)
        .slice(1)
        .map((b) => b.split('}')[0]);
    let latin = null;
    let any = null;
    for (const block of blocks) {
        const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
        if (!urlMatch) continue;
        const url = urlMatch[1];
        if (!any) any = url;
        const range = block.match(/unicode-range:\s*([^;]+);/);
        if (!range) {
            // Single-subset font: this is what we want.
            return url;
        }
        if (/U\+0000-00FF/i.test(range[1])) {
            latin = url;
            break;
        }
    }
    return latin || any;
}

async function downloadFont(font) {
    const slug = slugifyFont(font);
    const out = path.join(OUT_DIR, `${slug}.woff2`);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return { font, status: 'skipped' };

    const css = await fetchCss(font);
    const url = pickWoff2Url(css);
    if (!url) throw new Error(`no woff2 url in css for ${font}`);

    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`woff2 ${res.status} for ${font}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error(`empty woff2 for ${font}`);
    fs.writeFileSync(out, buf);
    return { font, status: 'downloaded', bytes: buf.length };
}

async function runPool(items, worker, concurrency) {
    const results = [];
    let next = 0;
    let done = 0;
    const total = items.length;
    async function take() {
        while (next < items.length) {
            const i = next++;
            try {
                const r = await worker(items[i]);
                results.push(r);
            } catch (err) {
                results.push({ font: items[i], status: 'failed', error: err.message });
                process.stderr.write(`FAIL ${items[i]}: ${err.message}\n`);
            }
            done++;
            if (done % 25 === 0 || done === total) {
                process.stdout.write(`  ${done}/${total}\n`);
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, take));
    return results;
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const fonts = loadFontList();
    console.log(`Found ${fonts.length} fonts. Output: ${OUT_DIR}`);
    const results = await runPool(fonts, downloadFont, CONCURRENCY);
    const downloaded = results.filter((r) => r.status === 'downloaded').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed');
    console.log(`Downloaded: ${downloaded}, skipped: ${skipped}, failed: ${failed.length}`);
    if (failed.length) {
        console.log('Failed fonts:');
        for (const f of failed) console.log(`  ${f.font}: ${f.error}`);
        process.exit(1);
    }
})();
