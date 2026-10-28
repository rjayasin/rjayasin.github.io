# clueward

A reverse crossword, at
[rjayasin.github.io/clueward](https://rjayasin.github.io/clueward/): the grid is
filled in and you write a clue for each answer. A clue counts if it matches a
clue the NYT crossword has run for that answer. This file is about how that
match is decided.

## Files

- `matcher.js`: the matching rules (`ClueMatcher.judge`). Shared by the page
  and the test.
- `embed-worker.js`: runs the embedding model in a web worker so the grid stays
  responsive.
- `index.html`: the game. Its `Matcher` loads the worker, caches vectors,
  embeds an entry's past clues while it's selected, and hands the model to
  `ClueMatcher.judge`.
- `data/past/*.json`: every past clue for each answer, most common first (ties
  shortest first), sharded by an FNV-1a hash of the answer. Written by
  `scripts/build-clueward.js`.

## How a guess is judged

The guess is compared with every past clue for the answer and gets one of four
results:

| Result     | Effect on the page                              |
| ---------- | ----------------------------------------------- |
| `yes`      | the entry is clued; exact matches also earn a ★ |
| `close`    | "close — try another angle", costs nothing      |
| `no`       | a miss, which lowers the entry's points         |
| `giveaway` | the guess contains the answer, costs nothing    |

### 1. Normalize

Both the guess and each past clue are lowercased, accents and punctuation are
dropped, `'s` is dropped, `&` becomes `and`, and any blank (`___`, `--`, `…`,
`blank`) becomes the token `qblank`. Content words are what's left after
dropping stop words (`a`, `the`, `of`, `for`, …) and the blank. Each content
word is crudely stemmed (`-s`, `-es`, `-ies`, `-ing`, `-ed`).

### 2. Checks that don't need the model

In order, the first that applies wins:

1. Empty, or only a blank: `no`.
2. Contains the answer as a word, a stemmed word, or, for answers of five or
   more letters, anywhere once spaces are removed: `giveaway`.
3. Identical to a past clue once normalized: `yes`, exact.
4. Within a few typos of a past clue: `yes`. None for past clues under 6
   characters, one under 12, and 12% of the length beyond that.

### 3. Checks with the model

The model is [bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5)
(quantized to 8 bits, run by transformers.js). Texts are embedded as
mean-pooled, normalized vectors, so similarity is a dot product from about 0
to 1. Phrases are embedded with their blanks removed, since otherwise any two
short fill-in-the-blank clues look alike.

Each past clue is tried two ways. The guess is `yes` as soon as one passes:

**Word by word.** Every content word of the past clue needs a counterpart in
the guess: the same stem, a one-letter typo (words of 5+ letters), or a word
the model scores at least `WORD` (0.8) against it. Words with digits only
match by stem or typo. The guess may then add up to two words of its own, but
only if every counterpart matched by stem or typo. Once any counterpart is
only a near-synonym, it may add none. The whole phrase must also score at
least `LEX_MIN` (0.7). So:

- "Twisty letter" matches "Letter": a stem match plus one extra word.
- "Mom's husband" matches "Mom's spouse": a near-synonym with no extra words.
- "vocal play" doesn't match "\_\_\_ singing": "vocal" is only a near-synonym
  for "singing", and "play" is extra.

**Whole phrase.** The guess scores at least `YES` (0.8) against the past clue,
or `YES_ONE_WORD` (0.86) if the guess has a single content word, since a lone
word sits near its category ("guitar" vs "Instrument").

**Blanks.** A past clue with a blank only matches a guess that has one too.
Without the blank, "\_\_\_ singing" is just "singing", which is far looser than
the original clue.

If nothing passes, the guess is `close` when its best whole-phrase score is at
least `CLOSE` (0.7) or it covers at least half of some past clue's words.
Otherwise it's `no`.

### 4. Which past clues are compared

Answers can have over a hundred past clues, so the model checks run first on
the `WARM` (40) most common ones, plus any rarer clue whose words the guess
covers by stem alone. Only if none of them gives `yes` is the guess compared
with all of them. While an entry stays selected, the page embeds its past
clues 40 at a time in the background, so a guess usually only needs its own
words embedded.

## Testing

`make clueward-test` judges every case in `scripts/clueward-matcher-cases.json`
with `matcher.js` and the same model in Node, and fails if any is judged the
wrong way. It needs a one-time install, and downloads the model on its first
run, so it isn't part of `make check`:

```sh
npm install --no-save --no-package-lock @huggingface/transformers@3.7.5
make clueward-test
```

Each case has an answer, a guess and `want`: `yes` if it should be accepted,
`no` if it shouldn't (`close` is fine). `why` records where the case came from.
`held: true` marks a real past clue, judged against the rest of its answer's
clues. `known` marks a wrong call that was kept because fixing it would cost
more real clues. Those are reported but don't fail the run, and the test says
when one starts passing.

When a guess is judged wrongly in the game, add it as a case before changing
anything. The browser console logs the best whole-phrase score for each guess
(`match "…" ~ ANSWER: "…" 0.000`), but not for guesses accepted word by word.
Node's scores can differ from the browser's in the third decimal.

A change to the rules or thresholds should also be checked against real clues,
not just the cases. Hold out one past clue from each of a few hundred answers,
then count how many pass and how many come back close when judged against the
rest of their answer's clues. Also count how many pass when judged against
other answers' clues. As of the last change, about 45% of held-out clues
passed, 29% came back close, and 3 of 1,600 passed against the wrong answer.

## History

- **[`c82db9ca`](https://github.com/rjayasin/rjayasin.github.io/commit/c82db9ca)**: blanks are removed before embedding, because "Alfa \_\_\_" and
  other short fill-in-the-blank clues were matching any guess with a blank.
- **[#258](https://github.com/rjayasin/rjayasin.github.io/pull/258)**: "Nixons successor" was accepted for REAGAN. A temporary probe page
  scored 20 probe guesses and held-out clues across 70 threshold combinations
  in the browser. Those probe guesses are now in the test cases.
- **[#259](https://github.com/rjayasin/rjayasin.github.io/pull/259)**: `YES` went from 0.78 to 0.8, since "Nixons successor" scored 0.775
  against "Carter's successor". Real clues passing went from 49% to 45%.
  Raising `WORD` changed none of the probes, so it stayed at 0.8. "Obama's
  predecessor" (CARTER) and "Jefferson's successor" (ADAMS) are still accepted
  on purpose.
- **[`2b83a791`](https://github.com/rjayasin/rjayasin.github.io/commit/2b83a791)**: "vocal play" was accepted for SCAT through "\_\_\_ singing".
  This added the rule against both swapping in near-synonyms and adding words,
  and the blank rule. Of 400 held-out clues, one went from passing to close:
  "Prefix for Norman or Saxon" (ANGLO), which had matched "\_\_\_-Saxon".
