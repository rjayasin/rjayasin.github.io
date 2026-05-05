window.Common = window.Common || {};

(function() {
  const FAVICON_R_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>text{fill:#000}@media(prefers-color-scheme:dark){text{fill:#fff}}</style><text x="50" y="86" font-size="90" font-family="Georgia,serif" text-anchor="middle">R</text></svg>';

  function setFaviconHref(href) {
    let link = document.getElementById('favicon');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.id = 'favicon';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  function paintFaviconR() {
    setFaviconHref('data:image/svg+xml,' + encodeURIComponent(FAVICON_R_SVG));
  }

  function paintFavicon({ glyph, font, fontSize = 52, transparent = false }) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const isDark = document.body.classList.contains('dark');
    if (!transparent) {
      ctx.fillStyle = isDark ? '#000' : '#fff';
      ctx.fillRect(0, 0, 64, 64);
    }
    ctx.font = `${fontSize}px ${font ? `'${font}', serif` : 'serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDark ? '#fff' : '#000';
    ctx.fillText(glyph, 32, 32);
    setFaviconHref(c.toDataURL());
  }

  function initDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add('dark');
    }
    document.addEventListener('keydown', e => {
      if (e.key === '1' && !e.repeat && !e.metaKey && !e.ctrlKey) {
        document.body.classList.toggle('dark');
        window.dispatchEvent(new CustomEvent('darkmodechange'));
      }
    });
  }

  function initCursorHide(idleMs = 1500) {
    let timer = null;
    function hide() { document.body.classList.add('hide-cursor'); }
    function show() {
      document.body.classList.remove('hide-cursor');
      clearTimeout(timer);
      timer = setTimeout(hide, idleMs);
    }
    show();
    document.addEventListener('mousemove', show);
    document.addEventListener('keydown', hide);
  }

  function slugifyFont(name) {
    return name.toLowerCase().replace(/ /g, '-');
  }

  const loadedGoogleFonts = new Set();
  function loadGoogleFont(font) {
    if (loadedGoogleFonts.has(font)) {
      return document.fonts.load(`1em '${font}'`).catch(() => {});
    }
    loadedGoogleFonts.add(font);
    const slug = slugifyFont(font);
    const style = document.createElement('style');
    style.dataset.font = slug;
    style.textContent =
      `@font-face{font-family:"${font}";font-display:block;` +
      `src:url("/fonts/${slug}.woff2") format("woff2");}`;
    document.head.appendChild(style);
    return document.fonts.load(`1em '${font}'`).catch(() => {});
  }

  function pickRandomGoogleFont() {
    const list = window.googleFonts;
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickLoadedGoogleFont() {
    const arr = [...loadedGoogleFonts];
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function openFontSpecimen(font) {
    if (!font) return;
    window.open(`https://fonts.google.com/specimen/${font.replace(/ /g, '+')}`, '_blank', 'noopener');
  }

  function parseQueryItems() {
    const raw = location.search.replace(/^\?/, '');
    return raw.split('/').map(s => {
      try { return decodeURIComponent(s); } catch (_) { return s; }
    }).filter(s => s.length > 0);
  }

  function makeCooldown(ms = 500) {
    let cooling = false;
    return function run(fn) {
      if (cooling) return false;
      cooling = true;
      setTimeout(() => { cooling = false; }, ms);
      fn();
      return true;
    };
  }

  function onTap(handler) {
    document.addEventListener('click', e => {
      if (e.pointerType === 'touch') return;
      handler(e);
    });
    document.addEventListener('touchend', e => {
      e.preventDefault();
      handler(e);
    }, { passive: false });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  Object.assign(window.Common, {
    setFaviconHref,
    paintFaviconR,
    paintFavicon,
    initDarkMode,
    initCursorHide,
    loadGoogleFont,
    loadedGoogleFonts,
    slugifyFont,
    pickRandomGoogleFont,
    pickLoadedGoogleFont,
    openFontSpecimen,
    parseQueryItems,
    makeCooldown,
    onTap,
    loadScript,
  });
})();
