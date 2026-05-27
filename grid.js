let size = window.innerWidth < 640 ? 50 : 110;
let spans = [];
let mode = 'single';
let currentFont = Common.pickRandomGoogleFont();

function repaintFavicon() {
  Common.paintFavicon({ glyph: window.GRID, font: currentFont });
}

async function applySingle(font) {
  await Common.loadGoogleFont(font);
  console.log('font:', font);
  rebuild();
  repaintFavicon();
}

function applyMulti() {
  rebuild();
}

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

function measureCell(font) {
  measureCtx.font = `${size}px '${font}', serif`;
  const m = measureCtx.measureText(window.GRID);
  const w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width || 0);
  const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
  return Math.max(w, h, size * 0.4) + size * 0.2;
}

function currentCell() {
  if (mode === 'single') return Math.ceil(measureCell(currentFont));
  const measurements = [...Common.loadedGoogleFonts].map(measureCell).sort((a, b) => a - b);
  if (measurements.length === 0) return Math.ceil(size * 0.4);
  const p90 =
    measurements[Math.floor(measurements.length * 0.9)] ?? measurements[measurements.length - 1];
  return Math.ceil(p90);
}

function rebuild() {
  const cell = currentCell();
  const cols = Math.ceil(window.innerWidth / cell);
  const rows = Math.ceil(window.innerHeight / cell);
  const total = cols * rows;

  document.body.innerHTML = '';
  spans = [];

  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const span = document.createElement('span');
    span.className = 'grid';
    span.textContent = window.GRID;
    span.style.width = cell + 'px';
    span.style.height = cell + 'px';
    span.style.fontSize = size + 'px';
    frag.appendChild(span);
    spans.push(span);
  }
  document.body.appendChild(frag);
  if (mode === 'single') spans.forEach((s) => (s.style.fontFamily = `'${currentFont}', serif`));
  else spans.forEach((s) => (s.style.fontFamily = `'${Common.pickLoadedGoogleFont()}', serif`));
}

applySingle(currentFont);

window.addEventListener('darkmodechange', repaintFavicon);

let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    rebuild();
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? 4 : -4;
    size = Math.max(8, Math.min(512, size + delta));
    rebuild();
    return;
  }
  if (e.repeat) return;
  if (e.key === '1') return;
  if (e.key === 'g' || e.key === 'G') {
    Common.openFontSpecimen(currentFont);
    return;
  }
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
      currentFont = Common.pickRandomGoogleFont();
      applySingle(currentFont);
    }
  } else if (mode === 'single') {
    currentFont = Common.pickRandomGoogleFont();
    applySingle(currentFont);
  }
});

const tap = Common.makeCooldown(500);
Common.onTap(() => {
  tap(() => {
    if (mode === 'single') {
      currentFont = Common.pickRandomGoogleFont();
      applySingle(currentFont);
    }
  });
});
