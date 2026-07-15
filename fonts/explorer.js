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
  const controlsEl = document.getElementById('controls');
  const filtersEl = document.getElementById('filters');
  const filtersToggleEl = document.getElementById('filters-toggle');
  const sizeButtonsEl = document.getElementById('size-buttons');
  const minimalToggleEl = document.getElementById('minimal-toggle');

  const BATCH = 24;
  const state = { cat: 'all', sort: 'random', text: '' };
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

  function buildFiltered() {
    filtered = allFonts.filter((f) => state.cat === 'all' || catOf(f) === state.cat);
    if (state.sort === 'random') {
      shuffle(filtered);
    } else if (state.sort === 'new') {
      // fonts.js is alphabetical, so the stable sort keeps same-day fonts in
      // name order; dateless (delisted) families sink to the end.
      filtered.sort((a, b) => {
        const da = dateOf(a);
        const db = dateOf(b);
        if (da === db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? 1 : -1;
      });
    }
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

    // Anywhere on the card that isn't the specimen link opens the single view.
    card.addEventListener('click', (e) => {
      if (!e.target.closest('a')) openSingle(font);
    });

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

  function reset() {
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

  filtersToggleEl.addEventListener('click', () => {
    const collapsed = filtersEl.classList.toggle('collapsed');
    controlsEl.classList.toggle('collapsed', collapsed);
    filtersToggleEl.classList.toggle('active', !collapsed);
    filtersToggleEl.textContent = collapsed ? '▾' : '▴';
    filtersToggleEl.title = collapsed ? 'show filters' : 'hide filters';
  });

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
  const singleTilesEl = document.getElementById('single-tiles');
  const singleCloseEl = document.getElementById('single-close');

  function openSingle(font) {
    fillInfo(singleInfoEl, font);
    singleTilesEl.style.fontFamily = familyFor(font);
    // Match the list's current sample size.
    const sample = listEl.querySelector('.card .sample');
    singleTilesEl.style.fontSize = sample ? getComputedStyle(sample).fontSize : '';
    const text = sampleFor(font);
    const reps = Math.max(1, Math.ceil(5000 / (text.length + 1)));
    singleTilesEl.textContent = new Array(reps).fill(text).join(' ');
    singleTilesEl.scrollTop = 0;
    singleEl.hidden = false;
    document.body.style.overflow = 'hidden';
    Common.loadGoogleFont(font);
  }

  function closeSingle() {
    singleEl.hidden = true;
    document.body.style.overflow = '';
  }

  singleCloseEl.addEventListener('click', closeSingle);

  // Retype existing cards in place so edits don't reset scroll or refetch.
  inputEl.addEventListener('input', () => {
    state.text = inputEl.value.trim();
    const samples = listEl.querySelectorAll('.card .sample');
    for (let i = 0; i < samples.length; i++) {
      samples[i].textContent = sampleFor(filtered[i]);
    }
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
    if (e.key === 'Escape' && !singleEl.hidden) {
      closeSingle();
      return;
    }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      e.preventDefault();
      inputEl.focus();
    } else if (e.key === '+' || e.key === '=') {
      bumpSampleSize(4);
    } else if (e.key === '-' || e.key === '_') {
      bumpSampleSize(-4);
    }
  });

  reset();
})();
