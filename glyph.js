const fonts = window.googleFonts;

const loadedFonts = new Set();

function injectFontCSS(families) {
  const toLoad = families.filter(f => !loadedFonts.has(f));
  if (toLoad.length === 0) return Promise.resolve();
  toLoad.forEach(f => loadedFonts.add(f));
  const params = toLoad.map(f => 'family=' + encodeURIComponent(f)).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${params}&display=block`;
  return new Promise(resolve => {
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
}

async function waitForFont(font) {
  await injectFontCSS([font]);
  try { await document.fonts.load(`1em '${font}'`); } catch (_) {}
}

let size = 32;
let spans = [];
let mode = 'single';
let currentFont = fonts[Math.floor(Math.random() * fonts.length)];

function randomFont() {
  return fonts[Math.floor(Math.random() * fonts.length)];
}

function randomLoadedFont() {
  const loaded = [...loadedFonts];
  return loaded[Math.floor(Math.random() * loaded.length)];
}

async function applySingle(font) {
  await waitForFont(font);
  spans.forEach(s => s.style.fontFamily = `'${font}', serif`);
}

function applyMulti() {
  spans.forEach(s => s.style.fontFamily = `'${randomLoadedFont()}', serif`);
}

const DENSITY = window.CELL_DENSITY || 0.65;

function rebuild() {
  const cell = Math.round(size * DENSITY);
  const cols = Math.ceil(window.innerWidth / cell);
  const rows = Math.ceil(window.innerHeight / cell);
  const total = cols * rows;

  document.body.innerHTML = '';
  spans = [];

  for (let i = 0; i < total; i++) {
    const span = document.createElement('span');
    span.className = 'glyph';
    span.textContent = window.GLYPH;
    span.style.width = cell + 'px';
    span.style.height = cell + 'px';
    span.style.fontSize = size + 'px';
    document.body.appendChild(span);
    spans.push(span);
  }

  if (mode === 'single') applySingle(currentFont); else applyMulti();
}

rebuild();

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  const isLetterOrNumber = /^[a-zA-Z0-9]$/.test(e.key);
  const isSpace = e.code === 'Space';
  if (!isLetterOrNumber && !isSpace) return;
  if (isSpace) e.preventDefault();

  if (isSpace) {
    if (mode === 'single') {
      mode = 'multi';
      applyMulti();
    } else {
      mode = 'single';
      currentFont = randomFont();
      applySingle(currentFont);
    }
  } else if (mode === 'single') {
    currentFont = randomFont();
    applySingle(currentFont);
  }
});

let tapCooldown = false;
function handleTap() {
  if (tapCooldown) return;
  tapCooldown = true;
  setTimeout(() => { tapCooldown = false; }, 500);
  if (mode === 'single') {
    currentFont = randomFont();
    applySingle(currentFont);
  }
}

document.addEventListener('touchend', e => {
  e.preventDefault();
  handleTap();
}, { passive: false });

document.addEventListener('click', e => {
  if (e.pointerType === 'touch') return;
  handleTap();
});

document.addEventListener('wheel', e => {
  e.preventDefault();
  size = Math.max(8, Math.min(512, size - Math.sign(e.deltaY) * 4));
  rebuild();
}, { passive: false });
