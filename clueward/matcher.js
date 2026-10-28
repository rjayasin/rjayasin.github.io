// Clueward's clue matcher, shared by the page and by
// scripts/test-clueward-matcher.js. The page supplies the embedding model.
//
// A clue counts when it matches any clue that has run for the entry:
//   - the same text, ignoring case, punctuation and a few typos;
//   - every content word of the past clue has a counterpart in the guess
//     (same stem, a typo, or a near-synonym by a small embedding model,
//     bge-small, run in the browser), so “curvy letter” matches “Letter” and
//     “Mom's husband” matches “Mom's spouse”. The guess can add up to two
//     words of its own, but only when it swaps none, so “vocal play” doesn't
//     match “___ singing”;
//   - or the whole guess is a close paraphrase by the same model. A lone
//     word needs to be closer, since “guitar” sits near “Instrument”.
// A past clue with a blank only matches a guess with one.
// Thresholds were tuned on held-out past clues: about 60% of real clues
// the bank hasn't seen pass outright and 25% come back close, while a
// clue for another entry in the same puzzle passes about 1 time in 400.
// YES was later raised from 0.78 to 0.8, which moved about 4% of
// held-out clues from passing to close.
const ClueMatcher = (() => {
  const YES = 0.8;
  const YES_ONE_WORD = 0.86;
  const LEX_MIN = 0.7;
  const CLOSE = 0.7;
  const WORD = 0.8;
  const WARM = 40;
  const STOP = new Set(
    'a an the of and or in on at to for from with by is are be its it this that these those as one some e g eg qblank'.split(
      ' '
    )
  );

  function norm(s) {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/_+|-{2,}|\bblank\b|…|\.{3}/g, ' qblank ')
      .replace(/&/g, ' and ')
      .replace(/['’]s\b/g, '')
      .replace(/\b([a-z])\.(?=[a-z]\.)/g, '$1')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function stem(w) {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
    return w;
  }
  const words = (n) =>
    n
      .split(' ')
      .filter((w) => w && !STOP.has(w))
      .map((w) => ({ w, s: stem(w) }));
  const same = (a, b) =>
    a.s === b.s || (Math.min(a.s.length, b.s.length) >= 5 && editDistance(a.s, b.s) <= 1);
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  const hasBlank = (n) => n.split(' ').includes('qblank');

  function givesAway(g, ans) {
    const a = ans.toLowerCase();
    if (g.split(' ').some((w) => w === a || stem(w) === a)) return true;
    return a.length >= 5 && g.replace(/ /g, '').includes(a);
  }

  // 1 when every past-clue word has a counterpart and the guess adds at
  // most two of its own (none if any counterpart is only a near-synonym),
  // else the share of past-clue words covered.
  function lexical(gw, tw, vecOf) {
    if (!gw.length || !tw.length) return 0;
    const match = (a, b) =>
      same(a, b) || (vecOf && !/\d/.test(a.w + b.w) && dot(vecOf(a.w), vecOf(b.w)) >= WORD);
    const hits = tw.filter((b) => gw.some((a) => match(a, b))).length;
    const extra = gw.filter((a) => !tw.some((b) => match(a, b))).length;
    const swapped = tw.some((b) => !gw.some((a) => same(a, b)));
    if (hits === tw.length && extra <= (swapped ? 0 : 2)) return 1;
    return hits / tw.length;
  }

  // Phrases are embedded without their blanks, which otherwise make any
  // two short fill-in-the-blank clues look alike.
  const bare = (t) =>
    t
      .replace(/\bqblank\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || t;
  const pastTexts = (clues) => {
    const ts = clues.map(norm);
    return [...ts.map(bare), ...ts.flatMap((t) => words(t).map((x) => x.w))];
  };

  // getEmbed resolves to a function from texts to a promise of unit
  // vectors, or to null when the model isn't available.
  async function judge(guess, ans, past, getEmbed) {
    const g = norm(guess);
    if (!g || g === 'qblank') return { result: 'no' };
    if (givesAway(g, ans)) return { result: 'giveaway' };
    const ts = past.map(norm);
    const k = ts.indexOf(g);
    if (k >= 0) return { result: 'yes', best: past[k], exact: true };
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const typos = t.length < 6 ? 0 : t.length < 12 ? 1 : Math.floor(t.length * 0.12);
      if (typos && editDistance(g, t) <= typos) return { result: 'yes', best: past[i] };
    }
    const embed = await getEmbed();
    const gw = words(g);
    const tws = ts.map(words);
    const fits = (i) => !hasBlank(ts[i]) || hasBlank(g);

    // Compares the guess by meaning with the past clues at idx.
    async function compare(idx) {
      let vecOf = null;
      let phrase = null;
      if (embed) {
        const texts = [bare(g), ...gw.map((x) => x.w), ...pastTexts(idx.map((i) => past[i]))];
        const vecs = await embed(texts);
        const by = new Map(texts.map((t, i) => [t, vecs[i]]));
        vecOf = (t) => by.get(t);
        phrase = new Map(idx.map((i) => [i, dot(by.get(bare(g)), by.get(bare(ts[i])))]));
      }
      let best = -1;
      let top = 0;
      let partial = 0;
      for (const i of idx) {
        const lex = lexical(gw, tws[i], vecOf);
        if (fits(i) && lex === 1 && (!phrase || phrase.get(i) >= LEX_MIN))
          return { result: 'yes', best: past[i] };
        partial = Math.max(partial, lex);
        if (!phrase) continue;
        top = Math.max(top, phrase.get(i));
        if (fits(i) && (best < 0 || phrase.get(i) > phrase.get(best))) best = i;
      }
      const s = best >= 0 ? phrase.get(best) : 0;
      console.log(`match "${guess}" ~ ${ans}: "${past[best]}" ${s.toFixed(3)}`);
      if (s >= (gw.length > 1 ? YES : YES_ONE_WORD)) return { result: 'yes', best: past[best] };
      if (top >= CLOSE || partial >= 0.5) return { result: 'close' };
      return { result: 'no' };
    }

    // The rarer clues are only embedded when the common ones miss, but
    // any of them that shares the guess's words stem for stem is
    // compared straight away.
    const all = ts.map((_, i) => i);
    const first = all.filter((i) => i < WARM || lexical(gw, tws[i], null) === 1);
    const v = await compare(first);
    return v.result === 'yes' || first.length === all.length ? v : compare(all);
  }

  function editDistance(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0];
      d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = t;
      }
    }
    return d[b.length];
  }

  return { WARM, pastTexts, judge };
})();
