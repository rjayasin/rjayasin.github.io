// Etymology engine: Wiktionary fetching + wikitext/etytree parsing into a
// descent tree. Shared by the viewer (/etymology/) and the game
// (/etymology/game/). A node is { form, lang, rel, gloss, tr, children }, where
// a node's children are its ancestors (the forms it descends from). Everything
// here is pure logic + network; no DOM. Loaded as a classic script so its
// top-level declarations are visible to each page's inline script.

// ---------- Language codes ----------
// Wiktionary language codes seen in etymology templates → display names.
// Anything missing falls back to showing the raw code.
const LANGS = {
  en: 'English',
  enm: 'Middle English',
  ang: 'Old English',
  sco: 'Scots',
  'gmw-pro': 'Proto-West Germanic',
  'gem-pro': 'Proto-Germanic',
  'ine-pro': 'Proto-Indo-European',
  non: 'Old Norse',
  is: 'Icelandic',
  fo: 'Faroese',
  da: 'Danish',
  sv: 'Swedish',
  no: 'Norwegian',
  nb: 'Norwegian Bokmål',
  nn: 'Norwegian Nynorsk',
  de: 'German',
  goh: 'Old High German',
  gmh: 'Middle High German',
  nds: 'Low German',
  gml: 'Middle Low German',
  osx: 'Old Saxon',
  nl: 'Dutch',
  dum: 'Middle Dutch',
  odt: 'Old Dutch',
  af: 'Afrikaans',
  fy: 'West Frisian',
  ofs: 'Old Frisian',
  frk: 'Frankish',
  got: 'Gothic',
  yi: 'Yiddish',
  lb: 'Luxembourgish',
  fr: 'French',
  frm: 'Middle French',
  fro: 'Old French',
  xno: 'Anglo-Norman',
  oc: 'Occitan',
  pro: 'Old Occitan',
  ca: 'Catalan',
  es: 'Spanish',
  osp: 'Old Spanish',
  pt: 'Portuguese',
  'roa-opt': 'Old Galician-Portuguese',
  gl: 'Galician',
  it: 'Italian',
  ro: 'Romanian',
  rm: 'Romansch',
  scn: 'Sicilian',
  vec: 'Venetian',
  nap: 'Neapolitan',
  la: 'Latin',
  'la-cla': 'Classical Latin',
  'la-lat': 'Late Latin',
  'la-vul': 'Vulgar Latin',
  'la-med': 'Medieval Latin',
  'la-new': 'New Latin',
  'la-ecc': 'Ecclesiastical Latin',
  'VL.': 'Vulgar Latin',
  'LL.': 'Late Latin',
  'ML.': 'Medieval Latin',
  'NL.': 'New Latin',
  'EL.': 'Ecclesiastical Latin',
  'itc-pro': 'Proto-Italic',
  'itc-ola': 'Old Latin',
  grc: 'Ancient Greek',
  'grc-koi': 'Koine Greek',
  gkm: 'Byzantine Greek',
  el: 'Greek',
  'grk-pro': 'Proto-Hellenic',
  'cel-pro': 'Proto-Celtic',
  'cel-bry-pro': 'Proto-Brythonic',
  sga: 'Old Irish',
  mga: 'Middle Irish',
  ga: 'Irish',
  gd: 'Scottish Gaelic',
  gv: 'Manx',
  cy: 'Welsh',
  br: 'Breton',
  kw: 'Cornish',
  ru: 'Russian',
  orv: 'Old East Slavic',
  cu: 'Old Church Slavonic',
  'sla-pro': 'Proto-Slavic',
  'ine-bsl-pro': 'Proto-Balto-Slavic',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  uk: 'Ukrainian',
  be: 'Belarusian',
  bg: 'Bulgarian',
  sh: 'Serbo-Croatian',
  sl: 'Slovene',
  mk: 'Macedonian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  prg: 'Old Prussian',
  sa: 'Sanskrit',
  pi: 'Pali',
  'inc-pro': 'Proto-Indo-Aryan',
  'iir-pro': 'Proto-Indo-Iranian',
  'ira-pro': 'Proto-Iranian',
  'inc-hnd': 'Hindustani',
  hi: 'Hindi',
  ur: 'Urdu',
  pal: 'Middle Persian',
  peo: 'Old Persian',
  fa: 'Persian',
  'fa-cls': 'Classical Persian',
  ps: 'Pashto',
  ku: 'Kurdish',
  bn: 'Bengali',
  or: 'Odia',
  mr: 'Marathi',
  omr: 'Old Marathi',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ne: 'Nepali',
  si: 'Sinhalese',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  dra: 'Dravidian',
  'dra-pro': 'Proto-Dravidian',
  ar: 'Arabic',
  'sem-pro': 'Proto-Semitic',
  'afa-pro': 'Proto-Afroasiatic',
  he: 'Hebrew',
  hbo: 'Biblical Hebrew',
  arc: 'Aramaic',
  syc: 'Classical Syriac',
  akk: 'Akkadian',
  phn: 'Phoenician',
  egy: 'Egyptian',
  cop: 'Coptic',
  mt: 'Maltese',
  am: 'Amharic',
  gez: 'Geʽez',
  tr: 'Turkish',
  ota: 'Ottoman Turkish',
  'trk-pro': 'Proto-Turkic',
  az: 'Azerbaijani',
  kk: 'Kazakh',
  ky: 'Kyrgyz',
  uz: 'Uzbek',
  tt: 'Tatar',
  mn: 'Mongolian',
  zh: 'Chinese',
  ltc: 'Middle Chinese',
  och: 'Old Chinese',
  cmn: 'Mandarin',
  yue: 'Cantonese',
  'sit-pro': 'Proto-Sino-Tibetan',
  bo: 'Tibetan',
  my: 'Burmese',
  ja: 'Japanese',
  ojp: 'Old Japanese',
  ko: 'Korean',
  okm: 'Middle Korean',
  vi: 'Vietnamese',
  th: 'Thai',
  km: 'Khmer',
  lo: 'Lao',
  ms: 'Malay',
  id: 'Indonesian',
  jv: 'Javanese',
  tl: 'Tagalog',
  'poz-pro': 'Proto-Malayo-Polynesian',
  'map-pro': 'Proto-Austronesian',
  haw: 'Hawaiian',
  mi: 'Maori',
  sm: 'Samoan',
  to: 'Tongan',
  fj: 'Fijian',
  hu: 'Hungarian',
  fi: 'Finnish',
  et: 'Estonian',
  'urj-pro': 'Proto-Uralic',
  eu: 'Basque',
  ka: 'Georgian',
  hy: 'Armenian',
  xcl: 'Old Armenian',
  sq: 'Albanian',
  sw: 'Swahili',
  zu: 'Zulu',
  'bnt-pro': 'Proto-Bantu',
  yo: 'Yoruba',
  ha: 'Hausa',
  wo: 'Wolof',
  nci: 'Classical Nahuatl',
  qu: 'Quechua',
  gn: 'Guaraní',
  ay: 'Aymara',
  tnq: 'Taíno',
  arw: 'Lokono',
  awd: 'Arawakan',
  'sai-car-pro': 'Proto-Cariban',
  chr: 'Cherokee',
  oj: 'Ojibwe',
  'alg-pro': 'Proto-Algonquian',
  ett: 'Etruscan',
  sux: 'Sumerian',
  hit: 'Hittite',
  xto: 'Tocharian A',
  txb: 'Tocharian B',
  eo: 'Esperanto',
  mul: 'Translingual',
  und: 'Undetermined',
};
// Etymology-only varieties live under their parent language's heading.
const SECTION_OVERRIDES = {
  'la-cla': 'Latin',
  'la-lat': 'Latin',
  'la-vul': 'Latin',
  'la-med': 'Latin',
  'la-new': 'Latin',
  'la-ecc': 'Latin',
  'VL.': 'Latin',
  'LL.': 'Latin',
  'ML.': 'Latin',
  'NL.': 'Latin',
  'EL.': 'Latin',
  'grc-koi': 'Ancient Greek',
  'fa-cls': 'Persian',
  cmn: 'Chinese',
  yue: 'Chinese',
};
// Languages whose entry titles drop the vowel-length marks shown in
// etymology templates (Latin macrons, Old English macrons/dots, …).
const STRIP_MARKS = new Set([
  'la',
  'la-cla',
  'la-lat',
  'la-vul',
  'la-med',
  'la-new',
  'la-ecc',
  'VL.',
  'LL.',
  'ML.',
  'NL.',
  'EL.',
  'itc-ola',
  'ang',
  'grc',
  'grc-koi',
]);

// Names fetched from Wiktionary for codes missing from LANGS above, so a
// language is always written out in full rather than left as a bare code.
// Populated by resolveLangNames(); consulted only for display.
const RESOLVED = {};
const langResolveFailed = new Set();

function langName(code) {
  return LANGS[code] || RESOLVED[code] || code;
}
// Seed the display cache with code→name pairs resolved elsewhere — e.g. the
// game feeding in its build-time langs.json so static play never has to fall
// back to a bare code for a language missing from LANGS.
function registerLangNames(map) {
  if (map) for (const [code, name] of Object.entries(map)) if (name) RESOLVED[code] = name;
}
function sectionName(code) {
  return SECTION_OVERRIDES[code] || LANGS[code] || null;
}
function stripMarks(s) {
  return s.normalize('NFD').replace(/[̄̆̇]/g, '').normalize('NFC');
}

// ---------- Wikitext parsing ----------
// Etymology sections describe descent with a small set of templates:
//   {{inh|en|enm|water}}  inherited   {{bor|en|fr|ballet}}  borrowed
//   {{der|en|la|aqua}}    derived     {{m|grc|λόγος}}       mention
// Successive templates in the "From X, from Y, from Z" prose form the
// ancestry chain; a "+" between them (or a compound/affix template)
// splits the tree into branches.
// Every relation template has an abbreviated name and a spelled-out alias on
// Wiktionary ({{bor}} = {{borrowed}}, {{der}} = {{derived}}, {{lbor}} =
// {{learned borrowing}}, …), plus {{uder}} ("ultimately derived"). Accept them
// all: when only the abbreviations were listed, an ancestor written with the
// long form fell out of CHAIN_REL and was silently dropped from the chain —
// e.g. "rhinoceros" ("From {{uder|en|la}}, from {{derived|en|grc}}, …") lost
// both its Latin and Greek-compound steps, jumping straight to the two roots.
const CHAIN_REL = {
  inh: 'inherited',
  'inh+': 'inherited',
  inherited: 'inherited',
  der: 'derived',
  'der+': 'derived',
  derived: 'derived',
  uder: 'derived', // "ultimately derived from" — an ancestor, like {{der}}
  bor: 'borrowed',
  'bor+': 'borrowed',
  borrowed: 'borrowed',
  lbor: 'learned borrowing',
  'learned borrowing': 'learned borrowing',
  slbor: 'semi-learned borrowing',
  'semi-learned borrowing': 'semi-learned borrowing',
  obor: 'orthographic borrowing',
  'orthographic borrowing': 'orthographic borrowing',
  ubor: 'unadapted borrowing',
  'unadapted borrowing': 'unadapted borrowing',
  cal: 'calque',
  calque: 'calque',
  clq: 'calque',
  pcal: 'partial calque',
  'partial calque': 'partial calque',
  psm: 'phono-semantic match',
  'phono-semantic matching': 'phono-semantic match',
  m: 'from',
  mention: 'from',
  'm+': 'from',
  l: 'from',
  link: 'from',
};
// First positional param of {{m}}/{{l}} is already the language.
const MENTION_NAMES = new Set(['m', 'mention', 'm+', 'l', 'link']);
const COMPOUND_NAMES = new Set([
  'compound',
  'com',
  'affix',
  'af',
  'surf',
  'suffix',
  'suf',
  'prefix',
  'pre',
  'confix',
  'con',
  'blend',
  'univerbation',
  'univ',
]);

// The newer {{ety}}/{{etymon}} "etymon" templates encode descent as a
// language code followed by derivation keywords (each prefixed with ":")
// and etymons of the form "lang:term<modifiers>". A keyword applies to
// every etymon after it. Each template names only the immediate
// ancestor(s); deeper ancestry is recovered by tracing each one.
//   {{ety|en|:bor|es:tortilla}}  English borrowed from Spanish tortilla
const ETYMON_NAMES = new Set(['ety', 'etymon']);
const ETYMON_REL = {
  from: 'from',
  der: 'derived',
  derived: 'derived',
  uder: 'derived',
  inh: 'inherited',
  inherited: 'inherited',
  bor: 'borrowed',
  borrowed: 'borrowed',
  lbor: 'learned borrowing',
  slbor: 'semi-learned borrowing',
  obor: 'orthographic borrowing',
  ubor: 'unadapted borrowing',
  cal: 'calque',
  calque: 'calque',
  clq: 'calque',
  pcal: 'partial calque',
  sl: 'semantic loan',
  'semantic loan': 'semantic loan',
  psm: 'phono-semantic match',
};
// Keywords that join etymons with a "+" (compound parts), rendered like
// the {{affix}}/{{compound}} templates above.
const ETYMON_AFFIX = new Set([
  'af',
  'affix',
  'afeq',
  'compound',
  'com',
  'con',
  'confix',
  'blend',
  'univ',
  'univerbation',
]);

// Extract top-level {{…}} templates with positional/named params.
function parseTemplates(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{{', i);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    let close = -1;
    while (j < text.length - 1) {
      if (text[j] === '{' && text[j + 1] === '{') {
        depth++;
        j += 2;
      } else if (text[j] === '}' && text[j + 1] === '}') {
        depth--;
        j += 2;
        if (depth === 0) {
          close = j;
          break;
        }
      } else {
        j++;
      }
    }
    if (close === -1) break;
    const inner = text.slice(open + 2, close - 2);
    const parts = splitTop(inner);
    const name = (parts.shift() || '').trim().toLowerCase();
    const pos = [];
    const named = {};
    for (const part of parts) {
      const eq = topLevelEq(part);
      if (eq !== -1) named[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      else pos.push(part.trim());
    }
    out.push({ name, pos, named, start: open, end: close });
    i = close;
  }
  return out;
}

// Split template params on | ignoring nested {{…}} and [[…]].
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth--;
      cur += two;
      i++;
    } else if (s[i] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += s[i];
    }
  }
  parts.push(cur);
  return parts;
}

function topLevelEq(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth--;
      i++;
    } else if (s[i] === '=' && depth === 0) {
      return i;
    }
  }
  return -1;
}

function cleanText(s) {
  return (s || '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// The ==Language== section of a page's wikitext.
function extractLangSection(wikitext, language) {
  const text = wikitext.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, '');
  const esc = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|\\n)==\\s*' + esc + '\\s*==\\s*\\n');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = /\n==[^=]/.exec(text.slice(start));
  return next ? text.slice(start, start + next.index) : text.slice(start);
}

// The first Etymology subsection (handles "Etymology" and "Etymology 1").
function extractEtymology(section) {
  const m = /(^|\n)(={3,})\s*Etymology(\s+1)?\s*\2\s*\n/.exec(section);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = /\n=/.exec(section.slice(start));
  return (next ? section.slice(start, start + next.index) : section.slice(start)).trim();
}

// Prose after these markers lists cognates and cross-references,
// not ancestors — cut before extracting the chain.
const STOP_RE =
  /\b(?:[Cc]ognate|[Cc]ompare|[Rr]elated to|[Mm]ore at|[Dd]oublet|[Ss]ee also|[Aa]kin to|[Dd]isplaced|[Ss]uperseded|[Ss]ynchronically)\b/;

function makeNode(form, lang, rel, gloss, tr) {
  return {
    form: cleanText(form),
    lang,
    rel,
    gloss: cleanText(gloss),
    tr: tr || '',
    children: [],
  };
}

function chainNodeFrom(t) {
  const mention = MENTION_NAMES.has(t.name);
  const lang = mention ? t.pos[0] : t.pos[1];
  if (!lang) return null;
  let form = mention ? t.pos[1] : t.pos[2];
  const alt = mention ? t.pos[2] : t.pos[3];
  const gloss = t.named.t || t.named.gloss || (mention ? t.pos[3] : t.pos[4]) || '';
  if (form === '-') form = '';
  return makeNode(alt || form || '', lang, CHAIN_REL[t.name], gloss, t.named.tr);
}

// Language-specific romanization templates ({{ja-r}}, {{ryu-r}}, {{ko-r}}, …)
// carry the script form, its reading, and a gloss for CJK-style languages.
// The relation template just before them often hides its own term with "-"
// ("{{bor+|en|ja|-}} {{ja-r|空%手|から%て}}"), leaving these to supply it. The
// language is the template-name prefix; "%" and "^" are ruby alignment marks.
const ROMANIZATION_RE = /^([a-z][a-z0-9-]*)-r$/;
function romanizationNode(t) {
  const m = ROMANIZATION_RE.exec(t.name);
  if (!m) return null;
  const strip = (s) => (s || '').replace(/[%^]/g, '').trim();
  return {
    lang: m[1],
    form: strip(t.pos[0]),
    tr: strip(t.pos[1]),
    gloss: t.named.t || t.named.gloss || t.pos[2] || '',
  };
}

// Language-specific link templates ({{ltc-l}}, {{zh-l}}, {{och-l}}, …) are
// {{m}}/{{l}} mentions with the language baked into the name; for these CJKV
// families the second positional is the gloss, not an alternate form
// ("{{der|en|ltc|-}} {{ltc-l|藝|art, craft}}"). Like romanization templates they
// often complete a relation template whose own term was hidden with "-".
const LANGLINK_RE = /^([a-z][a-z0-9-]*)-l$/;
function langLinkNode(t) {
  const m = LANGLINK_RE.exec(t.name);
  if (!m) return null;
  return {
    lang: m[1],
    form: (t.pos[0] || '').replace(/[%^]/g, '').trim(),
    tr: t.named.tr || '',
    gloss: t.named.t || t.named.gloss || t.pos[1] || '',
  };
}

function compoundParts(t) {
  const lang = t.pos[0];
  const parts = [];
  t.pos.slice(1).forEach((raw, idx) => {
    let part = raw;
    if (!part || part === '-') return;
    if ((t.name === 'suffix' || t.name === 'suf') && idx > 0 && !part.startsWith('-')) {
      part = '-' + part;
    }
    if ((t.name === 'prefix' || t.name === 'pre') && idx === 0 && !part.endsWith('-')) {
      part = part + '-';
    }
    const gloss = t.named['t' + (idx + 1)] || t.named['gloss' + (idx + 1)] || '';
    parts.push(makeNode(part, lang, '+', gloss));
  });
  return parts;
}

// Parse one etymon spec ("lang:term<t:gloss><tr:…><alt:…>"). The
// language code is optional (defaults to the entry's); "-" hides the
// term, showing only the language.
function etymonSpec(raw, defLang) {
  const mods = {};
  const reMod = /<([a-z]+):([^<>]*)>/gi;
  let m;
  while ((m = reMod.exec(raw))) mods[m[1].toLowerCase()] = m[2];
  let base = raw;
  let prev;
  do {
    prev = base;
    base = base.replace(/<[^<>]*>/g, ''); // drop flag/value modifiers
  } while (base !== prev);
  base = base.trim();
  let lang = defLang;
  let term = base;
  const ci = base.indexOf(':');
  if (ci !== -1) {
    lang = base.slice(0, ci).trim();
    term = base.slice(ci + 1).trim();
  }
  if (term === '-') term = '';
  return {
    lang,
    form: mods.alt || term,
    gloss: mods.t || mods.gloss || '',
    tr: mods.tr || '',
  };
}

// Grow the tree from the immediate ancestors named in an {{ety}}/
// {{etymon}} template. Used as a fallback for pages that no longer
// spell the chain out in prose (e.g. "tortilla"); each ancestor is
// flagged for tracing so its own ancestry can be filled in later.
function buildFromEtymon(text, root, rootLang) {
  const t = parseTemplates(text).find((t) => ETYMON_NAMES.has(t.name));
  if (!t) return false;
  const entryLang = t.pos[0];
  let rel = 'from';
  let affix = false;
  let built = false;
  for (const raw of t.pos.slice(1)) {
    const arg = raw.trim();
    if (!arg) continue;
    if (arg.startsWith(':')) {
      const kw = arg
        .slice(1)
        .replace(/<[\s\S]*$/, '')
        .trim()
        .toLowerCase();
      affix = ETYMON_AFFIX.has(kw);
      rel = affix ? '+' : ETYMON_REL[kw] || kw;
      continue;
    }
    const spec = etymonSpec(arg, entryLang);
    if (!spec.lang) continue;
    if (spec.lang === rootLang && spec.form === root.form) continue;
    const node = makeNode(spec.form, spec.lang, rel, spec.gloss, spec.tr);
    if (!affix) node.trace = true;
    root.children.push(node);
    built = true;
  }
  return built;
}

// Walk the first template-bearing paragraph and grow the tree under root.
function buildChain(etymText, root, rootLang) {
  for (const para of etymText.split(/\n{2,}/)) {
    const stop = STOP_RE.exec(para);
    const text = stop ? para.slice(0, stop.index) : para;
    const templates = parseTemplates(text).filter(
      (t) =>
        CHAIN_REL[t.name] ||
        COMPOUND_NAMES.has(t.name) ||
        ROMANIZATION_RE.test(t.name) ||
        LANGLINK_RE.test(t.name)
    );
    if (!templates.length) continue;
    let attach = root; // parent of the next chain node
    let last = null;
    let lastEnd = 0;
    let parenResume = null; // node to resume the chain from after a "(…)" aside
    for (const t of templates) {
      const gap = text.slice(lastEnd, t.start);
      lastEnd = t.end;
      if (COMPOUND_NAMES.has(t.name)) {
        // Morphological analysis describes the headword itself; an
        // ancestor-language compound belongs to the current node.
        const target = t.pos[0] === rootLang ? root : last || root;
        for (const part of compoundParts(t)) target.children.push(part);
        continue;
      }
      let node;
      const rom = romanizationNode(t) || langLinkNode(t);
      if (rom) {
        // A relation template that hid its term with "-" is completed by the
        // romanization template right after it ("borrowed from Japanese 空手"):
        // fold its script form, reading, and gloss into that node rather than
        // adding a second one. Only when it sits adjacent (no comma/"from").
        if (
          last &&
          !last.form &&
          last.lang === rom.lang &&
          !/[,;]/.test(gap) &&
          !/(from|via|through|of|ultimately|after|<)/i.test(gap)
        ) {
          last.form = cleanText(rom.form);
          if (!last.tr) last.tr = rom.tr;
          if (!last.gloss) last.gloss = cleanText(rom.gloss);
          continue;
        }
        // Otherwise it stands alone as a mention ("from {{ja-r|唐%手|から%て}}").
        node = makeNode(rom.form, rom.lang, 'from', rom.gloss, rom.tr);
      } else {
        node = chainNodeFrom(t);
        if (!node) continue;
      }
      // Skip the headword itself and repeated mentions of the same form.
      if (node.lang === rootLang && node.form === root.form && !root.children.length) continue;
      if (last && node.lang === last.lang && node.form === last.form) {
        if (!last.gloss && node.gloss) last.gloss = node.gloss;
        if (!last.tr && node.tr) last.tr = node.tr;
        continue;
      }
      // Descent steps are spelled out ("from X, from Y"); a bare comma,
      // parenthesis, or "+" introduces an alternate form or compound part — a
      // sibling branch, not an ancestor. A hard descent relation (borrowed,
      // derived, …) always introduces an ancestor unless it's joined by
      // "+"/"/"/"or"/"and" (compound parts or alternant forms/scripts); only
      // mentions fall back to the prose-gap heuristic.
      const hardRel = node.rel && node.rel !== 'from' && node.rel !== '+';
      const joined = /[+/]/.test(gap) || /(^|[\s,;])(or|and)\s/.test(gap);
      const sibling =
        last &&
        (joined ||
          (!hardRel && gap.length <= 30 && !/(from|via|through|of|ultimately|after|<)/i.test(gap)));
      // A parenthetical aside ("Hindustani (Hindi जंगल / Urdu جَن٘گَل), from
      // Sauraseni Prakrit …") elaborates the node it follows; once it closes,
      // the chain resumes from that node, not from the last alternant inside.
      if (parenResume && gap.includes(')')) {
        attach = parenResume;
        parenResume = null;
      } else if (last && !sibling) {
        attach = last;
      }
      // Components or alternants spelled "A + B" / "A / B" share one relation to
      // their descendant ("derived from 藝 + 者"); a bare mention defaults to
      // "from", so let the later part inherit the relation the first carried.
      if (sibling && /[+/]/.test(gap) && node.rel === 'from' && last.rel) node.rel = last.rel;
      if (gap.includes('(') && !gap.includes(')') && last) parenResume = last;
      attach.children.push(node);
      last = node;
    }
    return true;
  }
  return buildFromEtymon(etymText, root, rootLang);
}

// ---------- Rate limiting ----------
// Wiktionary's API answers with 429 (Too Many Requests) when we fetch too fast.
// Every request goes through wikiFetch, which (a) serialises them — one at a
// time with a small gap — so a burst of look-ups can't stampede the API, and
// (b) on a 429/503 parks all scraping for the Retry-After window instead of
// retrying, which would only deepen the throttle. While parked, requests
// short-circuit to null immediately (no network), so callers fail fast and the
// game falls back to its static word pool / pre-built queue. isRateLimited lets
// callers skip work they know will be parked. Shared by the viewer and game.
let rateLimitedUntil = 0;
let wikiChain = Promise.resolve();
const WIKI_MIN_GAP = 250; // ms to wait between consecutive requests
const RATE_LIMIT_FALLBACK = 10000; // backoff when a 429 carries no Retry-After

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}
function noteRateLimit(res) {
  const ra = res ? parseInt(res.headers.get('retry-after') || '', 10) : NaN;
  const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : RATE_LIMIT_FALLBACK;
  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + waitMs);
}

// Returns the Response, or null when we're backed off, throttled off, or the
// request failed/was rate-limited. Never rejects.
function wikiFetch(url) {
  if (isRateLimited()) return Promise.resolve(null);
  const run = wikiChain.then(async () => {
    if (isRateLimited()) return null; // parked while we waited our turn
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 503) {
        noteRateLimit(res);
        return null;
      }
      return res;
    } catch {
      return null;
    } finally {
      // Hold the chain open for a beat so the next request keeps the gap.
      await new Promise((r) => setTimeout(r, WIKI_MIN_GAP));
    }
  });
  wikiChain = run.catch(() => {}); // keep the chain alive if a link rejects
  return run;
}

// ---------- Wiktionary fetch ----------
const API =
  'https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json' +
  '&formatversion=2&redirects=1&origin=*&page=';
const pageCache = new Map();

function fetchWikitext(title) {
  if (!pageCache.has(title)) {
    pageCache.set(
      title,
      wikiFetch(API + encodeURIComponent(title))
        .then((r) => (r && r.ok ? r.json() : null))
        .then((j) => (j && j.parse && j.parse.wikitext) || null)
        .catch(() => null)
    );
  }
  return pageCache.get(title);
}

// Rendered HTML of a page. Wiktionary builds the full "Etymology tree"
// (an .etytree NavFrame) server-side here, recursively tracing every
// ancestor — so when one is present we can mirror it exactly instead of
// reconstructing the chain from wikitext templates.
const HTML_API =
  'https://en.wiktionary.org/w/api.php?action=parse&prop=text&format=json' +
  '&formatversion=2&redirects=1&origin=*&page=';
const htmlCache = new Map();

function fetchPageHtml(title) {
  if (!htmlCache.has(title)) {
    htmlCache.set(
      title,
      wikiFetch(HTML_API + encodeURIComponent(title))
        .then((r) => (r && r.ok ? r.json() : null))
        .then((j) => (j && j.parse && j.parse.text) || null)
        .catch(() => null)
    );
  }
  return htmlCache.get(title);
}

// Resolve language/family codes to their canonical names via Wiktionary's
// own language data, so the tree never has to fall back to a raw code.
// Unknown codes are batched into a single expandtemplates call; both
// successes and failures are cached so each code is fetched at most once.
const LANG_API =
  'https://en.wiktionary.org/w/api.php?action=expandtemplates&prop=wikitext' +
  '&format=json&formatversion=2&origin=*&text=';
const LANG_SEP = '␟'; // unit separator: won't occur inside a name

// Per-code lookup that covers all three flavours of code that appear in
// etymology templates: full languages and etymology-only varieties (both via
// {{langname}}, e.g. hi-mid → "Middle Hindi") and language families (via the
// families module, e.g. inc-hnd → "Hindustani"). {{langname}} and the module
// each throw a Lua error on a code of the wrong kind, so {{#iferror}} chains
// them — langname first, families on its failure — and yields an empty string
// when neither matches, which the caller treats as "unresolved".
function langNameQuery(code) {
  const lang = '{{langname|' + code + '}}';
  const fam = '{{#invoke:families/templates|getByCode|' + code + '|getCanonicalName}}';
  return '{{#iferror:' + lang + '|{{#iferror:' + fam + '||' + fam + '}}|' + lang + '}}';
}

async function resolveLangNames(codes) {
  const todo = [...new Set(codes)].filter(
    (c) => c && !LANGS[c] && !RESOLVED[c] && !langResolveFailed.has(c)
  );
  if (!todo.length || isRateLimited()) return; // leave unresolved; retry later
  const text = todo.map(langNameQuery).join(LANG_SEP);
  const r = await wikiFetch(LANG_API + encodeURIComponent(text));
  if (!r) return; // backed off / network hiccup — retry on a later build
  try {
    if (!r.ok) throw new Error('http');
    const j = await r.json();
    const out = (j && j.expandtemplates && j.expandtemplates.wikitext) || '';
    const names = out.split(LANG_SEP);
    todo.forEach((c, i) => {
      const name = (names[i] || '').trim();
      // A bad code expands to a Lua/script error or empty text; in that
      // case keep falling back to the code rather than showing noise.
      if (name && !/error|#invoke|\{\{|\[\[/i.test(name)) RESOLVED[c] = name;
      else langResolveFailed.add(c);
    });
  } catch {
    todo.forEach((c) => langResolveFailed.add(c));
  }
}

function collectLangs(node, acc = []) {
  acc.push(node.lang);
  for (const child of node.children) collectLangs(child, acc);
  return acc;
}

function walkNodes(node, fn) {
  fn(node);
  for (const child of node.children) walkNodes(child, fn);
}

// A form whose reading isn't obvious from the Latin alphabet — Devanagari,
// Arabic, Brahmi, CJK, … — wants a transliteration under it. Reconstructions
// (already Latin, marked with "*") and plain Latin forms are left alone.
const NON_LATIN_RE = /[^ -ɏḀ-ỿ]/;
function wantsTr(n) {
  return n.form && !n.tr && !n.form.startsWith('*') && NON_LATIN_RE.test(n.form);
}

// Transliterations (the romanized reading shown under a form) are produced by
// Wiktionary's modules at render time, so they never appear in raw wikitext.
// The .etytree mirror reads them off the rendered page; for the wikitext
// fallback we ask {{xlit|lang|term}} to supply them — batched into one
// expandtemplates call and cached per term so each is fetched at most once.
const XLIT_CACHE = new Map(); // "lang␟form" -> tr ('' when none/unsupported)
async function resolveTransliterations(root) {
  const todo = new Map(); // key -> { lang, form }
  walkNodes(root, (n) => {
    if (!wantsTr(n)) return;
    const key = n.lang + LANG_SEP + n.form;
    if (!XLIT_CACHE.has(key)) todo.set(key, { lang: n.lang, form: n.form });
  });
  if (todo.size && !isRateLimited()) {
    const entries = [...todo.entries()];
    const text = entries.map(([, q]) => '{{xlit|' + q.lang + '|' + q.form + '}}').join(LANG_SEP);
    const r = await wikiFetch(LANG_API + encodeURIComponent(text));
    if (!r) return; // backed off / network hiccup — leave for a later build
    try {
      if (!r.ok) throw new Error('http');
      const j = await r.json();
      const parts = ((j && j.expandtemplates && j.expandtemplates.wikitext) || '').split(LANG_SEP);
      entries.forEach(([key], i) => {
        let tr = (parts[i] || '').trim();
        // Languages without a transliteration module expand to a Lua/script
        // error or empty text; cache the miss so we never retry it. Some
        // readings (e.g. Middle Chinese tone marks) come back wrapped in
        // <sup> markup, so strip tags before caching.
        if (!tr || /error|#invoke|\{\{|\[\[/i.test(tr)) tr = '';
        XLIT_CACHE.set(key, cleanText(tr));
      });
    } catch {
      entries.forEach(([key]) => XLIT_CACHE.set(key, ''));
    }
  }
  walkNodes(root, (n) => {
    if (!wantsTr(n)) return;
    const tr = XLIT_CACHE.get(n.lang + LANG_SEP + n.form);
    if (tr) n.tr = tr;
  });
}

function pageTitleFor(form, lang) {
  const name = langName(lang);
  if (form.startsWith('*')) return 'Reconstruction:' + name + '/' + form.slice(1);
  return STRIP_MARKS.has(lang) ? stripMarks(form) : form;
}

// Fetch a word's etymology and build its tree. Compound parts are
// expanded recursively (depth-limited, shared fetch budget).
async function getTree(form, lang, depth = 0, budget = { left: 10 }) {
  if (budget.left <= 0) return null;
  budget.left--;
  const section = sectionName(lang);
  if (!section) return null;
  const wikitext = await fetchWikitext(pageTitleFor(form, lang));
  if (!wikitext) return null;
  const langSection = extractLangSection(wikitext, section);
  if (!langSection) return null;
  const ety = extractEtymology(langSection);
  if (!ety) return null;
  const root = makeNode(form, lang, '');
  if (!buildChain(ety, root, lang)) return null;
  if (depth < 2) {
    for (const child of root.children) {
      // Compound parts (+) and lone etymon-template ancestors carry no
      // ancestry of their own yet — trace each to fill in its chain.
      if ((child.rel !== '+' && !child.trace) || !child.form || child.children.length) continue;
      const sub = await getTree(child.form, child.lang, depth + 1, budget);
      if (sub) {
        child.children = sub.children;
        if (!child.gloss) child.gloss = sub.gloss;
      }
    }
  }
  // The full tree is built; fill in any names missing from LANGS before
  // it's handed off to be rendered.
  if (depth === 0) {
    await resolveLangNames(collectLangs(root));
    await resolveTransliterations(root);
  }
  return root;
}

// ---------- Wiktionary "Etymology tree" (.etytree) ----------
// Relation labels shown in the rendered tree (e.g. "der.", "bor.")
// mapped to the words our cards use. Anything unmapped falls back to the
// <abbr>'s title (its spelled-out form).
const ETYTREE_REL = {
  der: 'derived',
  inh: 'inherited',
  bor: 'borrowed',
  lbor: 'learned borrowing',
  slbor: 'semi-learned borrowing',
  obor: 'orthographic borrowing',
  ubor: 'unadapted borrowing',
  cal: 'calque',
  clq: 'calque',
  calque: 'calque',
  pcal: 'partial calque',
  psm: 'phono-semantic match',
  sl: 'semantic loan',
};

// Turn one .etytree-block into a node: its language and term come from the
// mention link; the optional label (sitting on the block) is the relation
// to the descendant directly below it — exactly what our .rel renders.
function etytreeBlockNode(block) {
  const i = block.querySelector('.etytree-term i');
  const lang = i ? i.getAttribute('lang') || '' : '';
  const form = i ? i.textContent.trim() : '';
  const trEl = block.querySelector('.mention-tr');
  const glossEl = block.querySelector('.mention-gloss');
  const labEl = block.querySelector('.etytree-label abbr');
  let rel = '';
  if (labEl) {
    const key = labEl.textContent.trim().replace(/\.$/, '').toLowerCase();
    rel = ETYTREE_REL[key] || (labEl.getAttribute('title') || '').toLowerCase();
  }
  return makeNode(
    form,
    lang,
    rel,
    glossEl ? glossEl.textContent : '',
    trEl ? trEl.textContent.trim() : ''
  );
}

// The tree is laid out bottom-up: within a container, blocks (and
// branch-groups) are stacked oldest-first and the bottom one is the
// headword. Each item is the ancestor of the item below it, so reading
// bottom-to-top yields our parent→children chain. A branch-group holds
// the several lineages that merge into the block just beneath it; each
// branch is itself such a sequence.
function parseEtytreeSeq(el) {
  const items = [];
  for (const c of el.children) {
    if (c.classList.contains('etytree-block') || c.classList.contains('etytree-branch-group'))
      items.push(c);
  }
  if (!items.length) return null;
  const root = etytreeBlockNode(items[items.length - 1]);
  let cur = root;
  for (let k = items.length - 2; k >= 0; k--) {
    const it = items[k];
    if (it.classList.contains('etytree-block')) {
      const parent = etytreeBlockNode(it);
      cur.children.push(parent);
      cur = parent;
    } else {
      for (const br of it.children) {
        if (!br.classList.contains('etytree-branch')) continue;
        const branch = parseEtytreeSeq(br);
        if (branch) cur.children.push(branch);
      }
      break; // a branch-group is the top of its sequence
    }
  }
  return root;
}

function etytreeBottomLang(frame) {
  const blocks = frame.querySelectorAll('.etytree-block');
  const last = blocks[blocks.length - 1];
  const i = last && last.querySelector('.etytree-term i');
  return i ? i.getAttribute('lang') || '' : '';
}

// Mirror the page's rendered Etymology tree, if it has one. Picks the tree
// whose headword (bottom block) is in the looked-up language.
async function treeFromEtytree(form, lang) {
  if (!sectionName(lang)) return null;
  const html = await fetchPageHtml(pageTitleFor(form, lang));
  if (!html || html.indexOf('etytree') === -1) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const frames = doc.querySelectorAll('.etytree.NavFrame');
  if (!frames.length) return null;
  // A page can carry trees for several languages (e.g. descendants
  // sections); only mirror the one whose headword is in this language.
  let frame = null;
  for (const f of frames) {
    if (etytreeBottomLang(f) === lang) {
      frame = f;
      break;
    }
  }
  if (!frame) return null;
  const body = frame.querySelector('.etytree-body');
  const root = body && parseEtytreeSeq(body);
  if (!root || !root.children.length) return null;
  await resolveLangNames(collectLangs(root));
  return root;
}

// Prefer Wiktionary's own tree; fall back to parsing the etymology prose.
async function buildTree(form, lang) {
  const mirrored = await treeFromEtytree(form, lang);
  if (mirrored) return mirrored;
  return getTree(form, lang);
}

function wiktionaryUrl(form, lang) {
  return 'https://en.wiktionary.org/wiki/' + encodeURIComponent(pageTitleFor(form, lang));
}

// ---------- Random words ----------
// Draw random main-namespace entries straight from Wiktionary rather
// than a fixed list. Titles span every language and part of speech, so
// keep just the ones that look like a plain lowercase headword.
const RANDOM_API =
  'https://en.wiktionary.org/w/api.php?action=query&list=random' +
  '&rnnamespace=0&rnlimit=20&format=json&formatversion=2&origin=*';

function fetchRandomWords() {
  return wikiFetch(RANDOM_API)
    .then((r) => (r && r.ok ? r.json() : null))
    .then((j) => ((j && j.query && j.query.random) || []).map((p) => p.title))
    .then((titles) => titles.filter((t) => /^[a-z]+$/.test(t)))
    .catch(() => []);
}

// Raw wikitext for a whole draw of titles in one query call, instead of one
// parse request per title. The response size cap means content for some
// pages can arrive only on a `continue` follow-up; a couple of those still
// beats twenty parse calls. Fetched text also seeds pageCache, so a
// follow-up buildTree for a title skips its own wikitext fetch.
const BATCH_API =
  'https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content' +
  '&rvslots=main&format=json&formatversion=2&origin=*&titles=';

async function fetchWikitextBatch(titles) {
  const out = new Map();
  let cont = '';
  for (let hop = 0; hop < 3 && titles.length; hop++) {
    const r = await wikiFetch(BATCH_API + encodeURIComponent(titles.join('|')) + cont);
    if (!r || !r.ok) break;
    let j;
    try {
      j = await r.json();
    } catch (e) {
      break;
    }
    for (const p of (j && j.query && j.query.pages) || []) {
      const rev = p.revisions && p.revisions[0];
      const text = rev && rev.slots && rev.slots.main && rev.slots.main.content;
      if (typeof text !== 'string') continue;
      out.set(p.title, text);
      if (!pageCache.has(p.title)) pageCache.set(p.title, Promise.resolve(text));
    }
    if (!j.continue) break;
    cont = Object.entries(j.continue)
      .map(([k, v]) => '&' + k + '=' + encodeURIComponent(v))
      .join('');
  }
  return out;
}

// The same test the wikitext parser will apply: an ==English== section with
// an Etymology heading. Screening a draw on already-fetched text costs
// nothing, and only survivors are worth per-word build requests.
function hasEnglishEtymology(wikitext) {
  const section = extractLangSection(wikitext, 'English');
  return !!(section && extractEtymology(section));
}

// Draw words until one has a documented history, returning its built
// tree. Most random entries have no parseable English etymology (other
// languages, missing sections), so draw fresh batches, prescreen each
// draw's wikitext in one batched call, and trace the first title that
// can actually yield a tree, within a bounded budget.
async function findRandomTree() {
  for (let batch = 0; batch < 4; batch++) {
    if (isRateLimited()) return null; // don't hunt while parked — let it lift
    const words = await fetchRandomWords();
    if (!words.length) continue;
    const texts = await fetchWikitextBatch(words);
    for (const word of words) {
      const text = texts.get(word);
      if (!text || !hasEnglishEtymology(text)) continue; // can't have a tree
      if (isRateLimited()) return null; // a 429 mid-batch: stop, don't grind
      const tree = await buildTree(word, 'en');
      if (tree) return { word, tree };
    }
  }
  return null;
}
