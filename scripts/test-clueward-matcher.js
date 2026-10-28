#!/usr/bin/env node
// Judges the guesses in scripts/clueward-matcher-cases.json with Clueward's
// matcher (clueward/matcher.js) and the same embedding model the page runs,
// and fails if any guess is judged the wrong way:
//   npm install --no-save --no-package-lock @huggingface/transformers@3.7.5
//   make clueward-test
// "want" is "yes" for a guess that should be accepted and "no" for one that
// shouldn't (close is fine). A case with "known" is a wrong call that was
// kept for the sake of other clues, so it's reported but doesn't fail. A
// case with "held" is a real past clue, judged against the rest of its bank.
// Scores can differ from the browser's in the third decimal.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SHARDS = 256;

const ClueMatcher = new Function(
  `${fs.readFileSync(path.join(ROOT, 'clueward', 'matcher.js'), 'utf8')}\nreturn ClueMatcher;`
)();

// FNV-1a hash of the answer, as in scripts/build-clueward.js.
function pastOf(ans) {
  let h = 0x811c9dc5;
  for (let i = 0; i < ans.length; i++) h = Math.imul(h ^ ans.charCodeAt(i), 0x01000193);
  const s = ((h >>> 0) % SHARDS).toString(16).padStart(2, '0');
  const past = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'clueward', 'data', 'past', `${s}.json`), 'utf8')
  )[ans];
  if (!past) throw new Error(`no past clues for ${ans}`);
  return past;
}

async function main() {
  let pipeline;
  try {
    ({ pipeline } = await import('@huggingface/transformers'));
  } catch {
    console.error('needs: npm install --no-save --no-package-lock @huggingface/transformers@3.7.5');
    process.exit(1);
  }
  const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
    dtype: 'q8',
  });
  const cache = new Map();
  async function embed(texts) {
    const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
    for (let i = 0; i < missing.length; i += 32) {
      const batch = missing.slice(i, i + 32);
      const out = await extractor(batch, { pooling: 'mean', normalize: true });
      out.tolist().forEach((v, n) => cache.set(batch[n], v));
    }
    return texts.map((t) => cache.get(t));
  }

  const cases = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'clueward-matcher-cases.json'), 'utf8')
  );
  let failed = 0;
  for (const c of cases) {
    const logs = [];
    const log = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    let v;
    try {
      const past = pastOf(c.ans).filter((p) => !c.held || p !== c.guess);
      v = await ClueMatcher.judge(c.guess, c.ans, past, async () => embed);
    } finally {
      console.log = log;
    }
    const ok = (v.result === 'yes') === (c.want === 'yes');
    const mark = ok ? (c.known ? '!' : '✓') : c.known ? '~' : '✗';
    if (!ok && !c.known) failed++;
    const via = v.best ? ` via "${v.best}"` : '';
    console.log(`${mark} ${c.ans} "${c.guess}": ${v.result}${via}, want ${c.want}`);
    if (!ok || (ok && c.known)) {
      for (const l of logs) console.log(`    ${l}`);
      if (c.why) console.log(`    why: ${c.why}`);
      if (c.known)
        console.log(ok ? '    now right, so its "known" note can go' : `    known: ${c.known}`);
    }
  }
  console.log(`\n${cases.length - failed} of ${cases.length} as expected`);
  // process.exit() while the model's threads are up aborts the process.
  await extractor.dispose();
  process.exitCode = failed ? 1 : 0;
}

main();
