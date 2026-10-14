(function () {
  const meta = window.googleFontsMeta || { categories: [], fonts: {} };
  const allFonts = (window.googleFonts || []).slice();

  // Generic fallback per category, shown (dimmed) until the real woff2 loads.
  const FALLBACKS = ['sans-serif', 'serif', 'serif', 'cursive', 'monospace'];

  const listEl = document.getElementById('list');
  const sentinelEl = document.getElementById('sentinel');
  const inputEl = document.getElementById('sample-input');
  const countEl = document.getElementById('count');
  const catButtonsEl = document.getElementById('cat-buttons');
  const sortButtonsEl = document.getElementById('sort-buttons');
  const sizeButtonsEl = document.getElementById('size-buttons');
  const minimalToggleEl = document.getElementById('minimal-toggle');

  const sampleEl = document.getElementById('sample');
  const sampleToggleEl = document.getElementById('sample-toggle');
  const searchEl = document.getElementById('search');
  const searchToggleEl = document.getElementById('search-toggle');
  const searchInputEl = document.getElementById('search-input');

  const BATCH = 24;
  const state = { cat: 'all', sort: 'random', text: '', query: [] };
  // Every font in the current sort order; filtered is the visible subset.
  let ordered = [];
  let filtered = [];
  let rendered = 0;

  function catOf(font) {
    const m = meta.fonts[font];
    return m ? m[0] : -1;
  }
  function dateOf(font) {
    const m = meta.fonts[font];
    return m ? m[1] : '';
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function sortFonts() {
    ordered = allFonts.slice();
    if (state.sort === 'random') {
      shuffle(ordered);
    } else if (state.sort === 'new') {
      // fonts.js is alphabetical, so the stable sort keeps same-day fonts in
      // name order; dateless (delisted) families sink to the end.
      ordered.sort((a, b) => {
        const da = dateOf(a);
        const db = dateOf(b);
        if (da === db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? 1 : -1;
      });
    }
  }

  // A font matches when its name contains every word of the query.
  function matchesQuery(font) {
    if (!state.query.length) return true;
    const name = font.toLowerCase();
    return state.query.every((word) => name.includes(word));
  }

  function buildFiltered() {
    filtered = ordered.filter(
      (f) => (state.cat === 'all' || catOf(f) === state.cat) && matchesQuery(f)
    );
    countEl.textContent = `${filtered.length} font${filtered.length === 1 ? '' : 's'}`;
  }

  function sampleFor(font) {
    return state.text || font;
  }

  function familyFor(font) {
    return `'${font}', ${FALLBACKS[catOf(font)] || 'serif'}`;
  }

  function fillInfo(el, font) {
    el.textContent = '';
    const link = document.createElement('a');
    link.href = `https://fonts.google.com/specimen/${font.replace(/ /g, '+')}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = font;
    el.appendChild(link);
    const parts = [];
    const cat = catOf(font);
    if (cat >= 0) parts.push(meta.categories[cat].toLowerCase());
    const date = dateOf(font);
    if (date) parts.push(date);
    if (parts.length) el.appendChild(document.createTextNode(` · ${parts.join(' · ')}`));
  }

  function makeCard(font) {
    const card = document.createElement('div');
    card.className = 'card';

    const sample = document.createElement('div');
    sample.className = 'sample';
    sample.style.fontFamily = familyFor(font);
    sample.textContent = sampleFor(font);
    card.appendChild(sample);

    const info = document.createElement('div');
    info.className = 'info';
    fillInfo(info, font);
    card.appendChild(info);

    // Clicking the sample itself opens the single view; the rest of the row
    // (whitespace, metadata) stays inert.
    sample.addEventListener('click', () => openSingle(font));

    Common.loadGoogleFont(font).then(() => card.classList.add('loaded'));
    return card;
  }

  function appendBatch() {
    const frag = document.createDocumentFragment();
    const end = Math.min(rendered + BATCH, filtered.length);
    for (; rendered < end; rendered++) {
      frag.appendChild(makeCard(filtered[rendered]));
    }
    listEl.appendChild(frag);
  }

  function sentinelNear() {
    return sentinelEl.getBoundingClientRect().top < window.innerHeight + 1200;
  }

  function fill() {
    while (rendered < filtered.length && sentinelNear()) {
      appendBatch();
    }
  }

  // Searching keeps the current order (no reshuffle on every keystroke);
  // changing the sort or category deals a fresh one.
  function reset({ reorder = true } = {}) {
    if (reorder) sortFonts();
    buildFiltered();
    listEl.textContent = '';
    rendered = 0;
    window.scrollTo(0, 0);
    fill();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) fill();
    },
    { rootMargin: '1200px' }
  );
  observer.observe(sentinelEl);

  // Category chips, built from the metadata so labels stay in sync.
  meta.categories.forEach((label, i) => {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.textContent = '·';
    catButtonsEl.appendChild(dot);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.cat = String(i);
    btn.textContent = label.toLowerCase();
    catButtonsEl.appendChild(btn);
  });

  catButtonsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.cat = btn.dataset.cat === 'all' ? 'all' : Number(btn.dataset.cat);
    catButtonsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    reset();
  });

  sortButtonsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // Re-clicking "random" deals a fresh shuffle; the others are no-ops.
    if (state.sort === btn.dataset.sort && btn.dataset.sort !== 'random') return;
    state.sort = btn.dataset.sort;
    sortButtonsEl
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('active', b === btn));
    reset();
  });

  // An icon button that expands into an inline field. Closing clears the
  // field (and runs onClear); blurring an empty field closes it.
  function makeExpander(el, toggleEl, fieldEl, onClear) {
    function setOpen(open, { focus = true } = {}) {
      el.classList.toggle('open', open);
      toggleEl.classList.toggle('active', open);
      toggleEl.setAttribute('aria-expanded', String(open));
      fieldEl.tabIndex = open ? 0 : -1;
      if (open) {
        if (focus) fieldEl.focus();
      } else if (fieldEl.value) {
        fieldEl.value = '';
        onClear();
      }
    }
    // Keep focus in the field when the toggle is pressed, so the blur handler
    // below doesn't close it a moment before the click toggles it.
    toggleEl.addEventListener('mousedown', (e) => e.preventDefault());
    toggleEl.addEventListener('click', () => setOpen(!el.classList.contains('open')));
    fieldEl.addEventListener('blur', () => {
      if (!fieldEl.value.trim()) setOpen(false);
    });
    return setOpen;
  }

  // Search: the magnifier expands into a name filter that applies as you type.
  makeExpander(searchEl, searchToggleEl, searchInputEl, () => applyQuery());

  function applyQuery() {
    state.query = searchInputEl.value.toLowerCase().split(/\s+/).filter(Boolean);
    reset({ reorder: false });
  }

  searchInputEl.addEventListener('input', applyQuery);

  sizeButtonsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) bumpSampleSize(Number(btn.dataset.size));
  });

  minimalToggleEl.addEventListener('click', () => {
    minimalToggleEl.classList.toggle('active', listEl.classList.toggle('minimal'));
    // Tiled cards are much shorter, so top the list back up right away.
    fill();
  });

  // Single font view: a fixed overlay over the untouched list, so closing it
  // lands back exactly where the user was.
  const singleEl = document.getElementById('single');
  const singleInfoEl = document.getElementById('single-info');
  const singleInputEl = document.getElementById('single-input');
  const singleTilesEl = document.getElementById('single-tiles');
  const singleCloseEl = document.getElementById('single-close');
  let singleFont = null;

  function retileSingle() {
    const text = sampleFor(singleFont);
    const reps = Math.max(1, Math.ceil(5000 / (text.length + 1)));
    singleTilesEl.textContent = new Array(reps).fill(text).join(' ');
  }

  function openSingle(font) {
    singleFont = font;
    fillInfo(singleInfoEl, font);
    singleTilesEl.style.fontFamily = familyFor(font);
    // Match the list's current sample size.
    const sample = listEl.querySelector('.card .sample');
    singleTilesEl.style.fontSize = sample ? getComputedStyle(sample).fontSize : '';
    singleInputEl.value = inputEl.value;
    retileSingle();
    singleTilesEl.scrollTop = 0;
    singleEl.hidden = false;
    document.body.style.overflow = 'hidden';
    Common.loadGoogleFont(font);
  }

  function closeSingle() {
    singleEl.hidden = true;
    document.body.style.overflow = '';
    // Text typed in the single view shows in the list's field too, so keep
    // the field open exactly when it holds something.
    setSampleOpen(Boolean(inputEl.value.trim()), { focus: false });
  }

  singleCloseEl.addEventListener('click', closeSingle);

  // Retype existing cards in place so edits don't reset scroll or refetch.
  function applyText(raw) {
    state.text = raw.trim();
    inputEl.style.setProperty('--chars', String(inputEl.value.length));
    const samples = listEl.querySelectorAll('.card .sample');
    for (let i = 0; i < samples.length; i++) {
      samples[i].textContent = sampleFor(filtered[i]);
    }
  }

  // Sample text: the pen hand expands into the text every card renders.
  const setSampleOpen = makeExpander(sampleEl, sampleToggleEl, inputEl, () => applyText(''));
  inputEl.addEventListener('input', () => applyText(inputEl.value));

  // The single view's input mirrors the main one, so the sample text stays
  // put when hopping between fonts or back to the list.
  singleInputEl.addEventListener('input', () => {
    inputEl.value = singleInputEl.value;
    applyText(singleInputEl.value);
    retileSingle();
  });

  // Inline style beats the stylesheet's desktop/mobile defaults for
  // --sample-size, so the first bump reads the effective size and takes over.
  function bumpSampleSize(delta) {
    const sample = listEl.querySelector('.card .sample');
    const cur = sample ? parseFloat(getComputedStyle(sample).fontSize) : 34;
    const next = Math.min(120, Math.max(10, cur + delta));
    listEl.style.setProperty('--sample-size', `${next}px`);
  }

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    // In an input, Escape/Enter just unfocus it; a second Escape (below)
    // closes the single view.
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key === 'Escape' || e.key === 'Enter') t.blur();
      return;
    }
    if (e.key === 'Escape' && !singleEl.hidden) {
      closeSingle();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      e.preventDefault();
      if (singleEl.hidden) setSampleOpen(true);
      else singleInputEl.focus();
    } else if (e.key === '+' || e.key === '=') {
      bumpSampleSize(4);
    } else if (e.key === '-' || e.key === '_') {
      bumpSampleSize(-4);
    }
  });

  reset();
})();
