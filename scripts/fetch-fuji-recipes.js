#!/usr/bin/env node
// Scrapes Film Simulation Recipes from fujixweekly.com's per-sensor index
// pages and writes ../fuji-viewer/recipes.js (window.fujiRecipes), which the
// fuji-viewer page uses to name the recipe a dropped photo was shot with.
// Each recipe records the sensors whose index page lists it, plus the
// camera settings parsed from its post. Set CACHE_DIR to reuse downloads.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'fuji-viewer', 'recipes.js');
const BASE = 'https://fujixweekly.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CACHE_DIR = process.env.CACHE_DIR;

const SENSORS = {
  'X-Trans V': '/fujifilm-x-trans-v-recipes/',
  'X-Trans IV': '/fujifilm-x-trans-iv-recipes/',
  'X-Trans III': '/fujifilm-x-trans-iii-recipes/',
  'X-Trans II': '/fujifilm-x-trans-ii-recipes/',
  'X-Trans I': '/fujifilm-x-trans-i-recipes/',
};

// Recipes fujixweekly has since declared compatible with another sensor
// without listing them on that sensor's index page. `variants` are extra
// accepted settings on the added sensors.
const EXTRA = {
  '/2022/06/11/fujifilm-x-trans-iv-film-simulation-recipe-reggies-portra/': {
    // https://fujixweekly.com/2025/12/03/reggies-portra-in-x-trans-v-cameras/
    sensors: ['X-Trans V'],
    variants: [{ ccfxb: 'off' }],
  },
};

async function get(url) {
  const key = CACHE_DIR && path.join(CACHE_DIR, url.replace(/[^a-z0-9]+/gi, '_') + '.html');
  if (key && fs.existsSync(key)) return fs.readFileSync(key, 'utf8');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const text = await res.text();
      if (key) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(key, text);
      }
      return text;
    }
    if (attempt >= 3) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const textOf = (html) =>
  decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[−–—]/g, '-')
    .replace(/ /g, ' ');

function articleBody(html) {
  const a = html.indexOf('<article');
  const b = html.indexOf('</article>', a);
  if (a < 0 || b < 0) return '';
  const body = html.slice(a, b);
  const share = body.indexOf('sharedaddy');
  return share > 0 ? body.slice(0, share) : body;
}

function indexLinks(html) {
  const out = [];
  const re = /<a[^>]*href="(https:\/\/fujixweekly\.com\/20[^"#?]*)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const [, url, label] of articleBody(html).matchAll(re)) {
    const name = textOf(label).replace(/\s+/g, ' ').trim();
    if (name) out.push({ url, name });
  }
  return out;
}

// ---- Setting parsers: each returns a normalised value or undefined --------

function filmKey(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9+]+/g, ' ');
  const filter = (t) =>
    /\+\s*r\b|\bred\b/.test(t)
      ? '-r'
      : /\+\s*ye?\b|yellow/.test(t)
        ? '-ye'
        : /\+\s*g\b|green/.test(t)
          ? '-g'
          : '';
  if (/acros/.test(s)) return 'acros' + filter(s);
  if (/sepia/.test(s)) return 'sepia';
  if (/monochrome|\bb ?w\b/.test(s)) return 'mono' + filter(s);
  if (/bleach/.test(s)) return 'bleach-bypass';
  if (/eterna/.test(s)) return 'eterna';
  if (/classic chrome/.test(s)) return 'classic-chrome';
  if (/classic neg/.test(s)) return 'classic-neg';
  if (/nostalgic/.test(s)) return 'nostalgic-neg';
  if (/reala/.test(s)) return 'reala-ace';
  if (/pro neg\w* hi/.test(s)) return 'pro-neg-hi';
  if (/pro neg\w* std|pro neg\w* standard/.test(s)) return 'pro-neg-std';
  if (/velvia|vivid/.test(s)) return 'velvia';
  if (/astia|soft/.test(s)) return 'astia';
  if (/provia|standard/.test(s)) return 'provia';
}

function num(v) {
  const m = v.match(/^\s*([+-]?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

const strength = (v) => (/^\s*(off|weak|strong)/i.exec(v) || [])[1]?.toLowerCase();

function grain(v) {
  const r = strength(v);
  if (!r || r === 'off') return r;
  const size = (/small|large/i.exec(v) || [])[0]?.toLowerCase();
  return size ? `${r} ${size}` : r;
}

function dynamicRange(v) {
  if (/auto/i.test(v)) return 'auto';
  const m = v.match(/(100|200|400)/);
  return m ? 'DR' + m[1] : undefined;
}

function drPriority(v) {
  const m = /^\s*(off|auto|weak|strong)/i.exec(v);
  return m ? m[1].toLowerCase() : undefined;
}

function whiteBalance(v) {
  const wb = {};
  const k = v.match(/(\d{4,5})\s*k/i);
  if (k) wb.kelvin = Number(k[1]);
  else if (/white priority/i.test(v)) wb.mode = 'auto-white';
  else if (/ambien|ambian/i.test(v)) wb.mode = 'auto-ambience';
  else if (/^\s*(auto|awb)/i.test(v)) wb.mode = 'auto';
  else if (/daylight|sunny|\bfine\b/i.test(v)) wb.mode = 'daylight';
  else if (/shade|cloudy/i.test(v)) wb.mode = 'shade';
  else if (/fluorescent\s*(\d)/i.test(v))
    wb.mode = 'fluorescent' + v.match(/fluorescent\s*(\d)/i)[1];
  else if (/incandescent|tungsten/i.test(v)) wb.mode = 'incandescent';
  else if (/underwater/i.test(v)) wb.mode = 'underwater';
  else return undefined;
  const red = v.match(/([+-]?\d+)\s*(?:red|r\b)/i) || v.match(/\bR\s*:?\s*([+-]?\d+)/);
  const blue = v.match(/([+-]?\d+)\s*(?:blue|b\b)/i) || v.match(/\bB\s*:?\s*([+-]?\d+)/);
  wb.r = red ? Number(red[1]) : 0;
  wb.b = blue ? Number(blue[1]) : 0;
  return wb;
}

function monochromatic(v) {
  const wc = v.match(/(?:wc|warm)\s*:?\s*([+-]?\d+)/i);
  const mg = v.match(/(?:mg|magenta)\s*:?\s*([+-]?\d+)/i);
  if (!wc && !mg) return undefined;
  return { wc: wc ? Number(wc[1]) : 0, mg: mg ? Number(mg[1]) : 0 };
}

// Ordered: the first matching key pattern wins.
const FIELDS = [
  [/^film simulation/, 'film', filmKey],
  [/^(d-?range|dr|dynamic range) priority/, 'drp', drPriority],
  [/^dynamic range|^dr$/, 'dr', dynamicRange],
  [/^highlight/, 'highlight', num],
  [/^shadow/, 'shadow', num],
  [/^colou?r chrome (effect |fx )?blue|^ccfx ?b/, 'ccfxb', strength],
  [/^colou?r chrome/, 'cce', strength],
  [/^monochromatic|^toning/, 'mono', monochromatic],
  [/^colou?r$|^saturation/, 'color', num],
  [/^sharp/, 'sharpness', num],
  [/noise reduction|^nr$|^high iso nr/, 'nr', num],
  [/^clarity/, 'clarity', num],
  [/^grain/, 'grain', grain],
  [/^white balance|^wb$/, 'wb', whiteBalance],
];

function parseSettings(text) {
  const s = {};
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) {
      if (!s.film && line.length < 40) {
        const f = filmKey(line);
        if (f) s.film = f;
      }
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    const field = FIELDS.find(([re]) => re.test(key));
    if (!field || s[field[1]] !== undefined) continue;
    const parsed = field[2](value);
    if (parsed !== undefined) s[field[1]] = parsed;
  }
  const core = ['dr', 'highlight', 'shadow', 'sharpness', 'nr', 'wb'].filter((k) => k in s);
  if (core.length < 4) return null;
  if (s.film) return s;
  // "Film Simulation: Any (See Below)" sets list a name per film sim after.
  return /film simulation:\s*any/i.test(text) ? { ...s, film: 'any' } : null;
}

const SENSOR_IN_LABEL = /\(?\b(X-Trans (?:V|IV|III|II|I))\b\)?/;
// Labels that are photo captions, bylines, camera lists or prose, not names.
const NOT_A_NAME = /posted on| - .+ - |fujifilm x-|^x-|recipe|\.$/i;

// Splits a post into recipe blocks, labelling each by the nearest heading or
// short paragraph above it (posts with several recipes title each that way).
function recipeBlocks(html) {
  const body = articleBody(html);
  const out = [];
  let label = '';
  let anySet = null;
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const [, tag, inner] of body.matchAll(re)) {
    const text = textOf(inner);
    const settings = parseSettings(text);
    if (settings && settings.film === 'any') {
      anySet = settings;
    } else if (settings) {
      anySet = null;
      out.push({ label, settings });
    } else {
      const line = text.replace(/\s+/g, ' ').trim();
      const named = anySet && line.match(/^(.+?)\s+-\s+["“](.+?)["”]$/);
      if (named) {
        for (const part of named[1].split(',')) {
          const film = filmKey(part);
          if (film) out.push({ label: named[2], settings: { ...anySet, film } });
        }
      } else if (line && (/^h/i.test(tag) || (line.length < 70 && !line.includes(':')))) {
        label = line;
      }
    }
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const n = i++;
        results[n] = await fn(items[n], n);
      }
    })
  );
  return results;
}

(async () => {
  const posts = new Map();
  for (const [sensor, slug] of Object.entries(SENSORS)) {
    const links = indexLinks(await get(BASE + slug));
    if (!links.length) throw new Error(`no recipe links on ${slug}`);
    for (const { url, name } of links) {
      const p = posts.get(url) || { url, names: new Set(), sensors: new Set() };
      p.names.add(name);
      p.sensors.add(sensor);
      posts.set(url, p);
    }
  }

  const recipes = [];
  let skipped = 0;
  await mapLimit([...posts.values()], 4, async (post) => {
    let blocks;
    try {
      blocks = recipeBlocks(await get(post.url));
    } catch (err) {
      console.warn(`skip ${post.url}: ${err.message}`);
      skipped++;
      return;
    }
    if (!blocks.length) {
      skipped++;
      return;
    }
    const names = [...post.names];
    const extra = EXTRA[post.url.slice(BASE.length)];
    const sensors = [...post.sensors, ...((extra && extra.sensors) || [])];
    blocks.forEach((b, i) => {
      // One block: the index link text is the cleanest name. Several: each
      // block's label, which may also pin it to one sensor ("... (X-Trans V)").
      let name = names[0];
      let blockSensors = sensors;
      if (blocks.length > 1) {
        const pinned = b.label.match(SENSOR_IN_LABEL);
        if (pinned) blockSensors = [pinned[1]];
        const label = b.label.replace(SENSOR_IN_LABEL, '').replace(/\s+/g, ' ').trim();
        const linkName = names.find((n) => label.toLowerCase().includes(n.toLowerCase()));
        if (linkName) name = linkName;
        else if (label && !NOT_A_NAME.test(label)) name = label;
      }
      name = name.replace(/^["“]|["”]$/g, '').trim();
      recipes.push({ name, url: post.url, sensors: blockSensors, s: b.settings });
      for (const v of (extra && extra.variants) || []) {
        recipes.push({ name, url: post.url, sensors: extra.sensors, s: { ...b.settings, ...v } });
      }
    });
  });

  recipes.sort((a, b) => a.name.localeCompare(b.name) || a.url.localeCompare(b.url));
  const out =
    '// Generated by scripts/fetch-fuji-recipes.js from fujixweekly.com. Do not edit.\n' +
    'window.fujiRecipes = [\n' +
    recipes.map((r) => '  ' + JSON.stringify(r)).join(',\n') +
    '\n];\n';
  fs.writeFileSync(OUT_FILE, out);
  console.log(
    `${recipes.length} recipes from ${posts.size} posts (${skipped} posts had no parseable recipe)`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
