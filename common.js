window.Common = window.Common || {};

(function () {
  const FAVICON_R_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>text{fill:#000}@media(prefers-color-scheme:dark){text{fill:#fff}}</style><text x="50" y="86" font-size="90" font-family="Georgia,serif" text-anchor="middle">R</text></svg>';

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

  function paintFavicon({ glyph, font, fontSize = 52, transparent = false, dy = 0 }) {
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
    ctx.fillText(glyph, 32, 32 + dy);
    setFaviconHref(c.toDataURL());
  }

  function updateDarkToggleLabels() {
    const text = document.body.classList.contains('dark') ? 'light' : 'dark';
    document.querySelectorAll('.hb-dark-label').forEach((el) => {
      el.textContent = text;
    });
  }

  function toggleDark() {
    // Either .dark or .light is always the explicit override after init.
    if (document.body.classList.contains('dark')) {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
    }
    updateDarkToggleLabels();
    window.dispatchEvent(new CustomEvent('darkmodechange'));
  }

  function initDarkMode() {
    // CSS handles the system-pref initial paint; mirror it into a class so
    // body.dark selectors elsewhere apply without a flash.
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add('dark');
    }
    updateDarkToggleLabels();
    document.addEventListener('keydown', (e) => {
      if (e.key === '1' && !e.repeat && !e.metaKey && !e.ctrlKey) {
        toggleDark();
      }
    });
  }

  function initCursorHide(idleMs = 1500) {
    let timer = null;
    function hide() {
      document.body.classList.add('hide-cursor');
    }
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
    window.open(
      `https://fonts.google.com/specimen/${font.replace(/ /g, '+')}`,
      '_blank',
      'noopener'
    );
  }

  function parseQueryItems() {
    const raw = location.search.replace(/^\?/, '');
    return raw
      .split('/')
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch (_) {
          return s;
        }
      })
      .filter((s) => s.length > 0);
  }

  function makeCooldown(ms = 500) {
    let cooling = false;
    return function run(fn) {
      if (cooling) return false;
      cooling = true;
      setTimeout(() => {
        cooling = false;
      }, ms);
      fn();
      return true;
    };
  }

  function onTap(handler) {
    function isInteractive(target) {
      return (
        target && target.closest && target.closest('a, button, input, textarea, select, label')
      );
    }
    document.addEventListener('click', (e) => {
      if (e.pointerType === 'touch') return;
      if (isInteractive(e.target)) return;
      handler(e);
    });
    document.addEventListener(
      'touchend',
      (e) => {
        if (isInteractive(e.target)) return;
        e.preventDefault();
        handler(e);
      },
      { passive: false }
    );
  }

  function initTextEditor({ buttonEl, labelEl, getItems, onCommit, onEditStart, onEditEnd }) {
    let label = labelEl;
    function refresh() {
      if (label && label.parentNode) label.textContent = getItems().join('/');
    }
    function commit(parts) {
      const filtered = parts.filter((s) => s.length > 0);
      if (filtered.length === 0) return;
      const newSearch = '?' + filtered.map(encodeURIComponent).join('/');
      history.replaceState(null, '', location.pathname + newSearch + location.hash);
      onCommit && onCommit();
      refresh();
    }
    function start() {
      if (buttonEl.querySelector('input')) return;
      const cur = getItems().join('/');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = cur;
      input.className = 'hint-input';
      input.size = Math.max(4, cur.length);
      label.replaceWith(input);
      input.focus();
      input.select();
      onEditStart && onEditStart();
      let done = false;
      const finish = (doCommit) => {
        if (done) return;
        done = true;
        if (doCommit) commit(input.value.split('/'));
        const span = document.createElement('span');
        span.id = label.id;
        input.replaceWith(span);
        label = span;
        refresh();
        onEditEnd && onEditEnd();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('input', () => {
        input.size = Math.max(4, input.value.length);
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    }
    buttonEl.addEventListener('click', (e) => {
      e.stopPropagation();
      start();
    });
    refresh();
    return { refresh };
  }

  function openSitemap() {
    window.open('/sitemap/', '_blank', 'noopener');
  }

  function initSitemapShortcut() {
    document.addEventListener('keydown', (e) => {
      if ((e.key === 's' || e.key === 'S') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        openSitemap();
      }
    });
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

  let emojisPromise = null;
  function ensureEmojis() {
    if (!emojisPromise) emojisPromise = loadScript('/emojis.js');
    return emojisPromise;
  }

  // Wires up the footer-style hint bar shared by border/box/clock/isometric/
  // stack/wave/spiral: show on init, hide after `hideDelay`, reveal again
  // when the cursor enters the hint zone (or the bar itself), keep the bar
  // up while it's hovered. Returns { show, setLocked }. setLocked(true)
  // pins the bar open (used by the text-editor input).
  function initHintBar({ hintEl, hintZoneEl, hideDelay = 2500 }) {
    let hintTimer = null;
    let locked = false;
    function show() {
      hintEl.classList.remove('hidden');
      clearTimeout(hintTimer);
      if (locked) return;
      hintTimer = setTimeout(() => hintEl.classList.add('hidden'), hideDelay);
    }
    show();
    // A tap while the bar is hidden only reveals it: clicks (including the
    // mouse events the same tap synthesizes) are swallowed for a beat, so
    // the buttons need a second, deliberate tap.
    let revealTapAt = -Infinity;
    if (hintZoneEl) {
      hintZoneEl.addEventListener('mouseenter', show);
      hintZoneEl.addEventListener('mousemove', show);
      hintZoneEl.addEventListener(
        'touchstart',
        () => {
          if (hintEl.classList.contains('hidden')) revealTapAt = Date.now();
          show();
        },
        { passive: true }
      );
      hintZoneEl.addEventListener('touchend', (e) => e.stopPropagation());
    }
    hintEl.addEventListener(
      'click',
      (e) => {
        if (Date.now() - revealTapAt < 800) {
          revealTapAt = -Infinity;
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
    hintEl.addEventListener('click', (e) => e.stopPropagation());
    hintEl.addEventListener(
      'touchstart',
      () => {
        // A touch starting on the visible bar is a real button press.
        revealTapAt = -Infinity;
        clearTimeout(hintTimer);
      },
      { passive: true }
    );
    hintEl.addEventListener('touchend', (e) => {
      e.stopPropagation();
      show();
    });
    hintEl.addEventListener('mouseenter', () => {
      clearTimeout(hintTimer);
      hintEl.classList.remove('hidden');
    });
    hintEl.addEventListener('mouseleave', show);
    initHintUpdated({ hintEl });
    return {
      show,
      setLocked: (v) => {
        locked = v;
        if (locked) {
          clearTimeout(hintTimer);
          hintEl.classList.remove('hidden');
        } else {
          show();
        }
      },
    };
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // "MM-DD" within the current year, "YYYY-MM-DD" otherwise (commits/deploys).
  function fmtDay(iso) {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return yyyy === new Date().getFullYear() ? `${mm}-${dd}` : `${yyyy}-${mm}-${dd}`;
  }

  // "3:07pm" local time (commits/deploys).
  function fmtTime(iso) {
    const d = new Date(iso);
    let h = d.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}${ampm}`;
  }

  // Relative "5h ago" timestamp, matching the sitemap "recent" view.
  function relativeWhen(iso, now = Date.now()) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Math.max(0, now - t);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return 'just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    if (diff < 2 * day) return 'yesterday';
    if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
    if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
    return `${Math.floor(diff / (365 * day))}y ago`;
  }

  // Appends an "updated <when>" entry (the time linking to the page's last
  // commit) as the final item in the hint bar, sourced from
  // /sitemap/dates.json — the same data the sitemap "recent" view uses.
  // No-op if the page has no dates entry. Called automatically by
  // initHintBar; pages with custom hint wiring (gravity/shooter) call it
  // directly.
  async function initHintUpdated({ hintEl, href = location.pathname } = {}) {
    if (!hintEl || hintEl.querySelector('#hb-updated')) return;
    let dates;
    try {
      const r = await fetch('/sitemap/dates.json', { cache: 'no-cache' });
      if (!r.ok) return;
      dates = await r.json();
    } catch {
      return;
    }
    const trimmed = href.replace(/\/$/, '');
    const entry = dates[href] || dates[trimmed] || dates[trimmed + '/'];
    if (!entry || !entry.date) return;
    const target = hintEl.querySelector('#hint-inner') || hintEl;
    const column = getComputedStyle(hintEl).flexDirection === 'column';
    const item = document.createElement(column ? 'div' : 'span');
    item.id = 'hb-updated';
    item.style.whiteSpace = 'nowrap';
    item.append('updated ');
    const when = document.createElement(entry.url ? 'a' : 'span');
    when.textContent = relativeWhen(entry.date);
    when.title = new Date(entry.date).toLocaleString();
    if (entry.url) {
      when.className = 'hint-btn';
      when.href = entry.url;
      when.target = '_blank';
      when.rel = 'noopener';
    }
    item.append(when);
    if (!column) target.append(document.createTextNode(' · '));
    target.append(item);
  }

  // Wires up the font-cycle pattern shared by border/box/stack/isometric:
  // loads /fonts.js, cycles on tap with a 500ms cooldown, registers a 'g'
  // shortcut for the Google Fonts specimen of the current font, and logs
  // each new font for debugging. The page supplies an onChange callback to
  // run its render/rebuild step.
  function initFontCycle({ onChange }) {
    const cool = makeCooldown(500);
    let current = null;
    async function cycle() {
      if (!window.googleFonts) return;
      cool(async () => {
        const font = pickRandomGoogleFont();
        if (!font) return;
        await loadGoogleFont(font);
        current = font;
        console.log('font:', font);
        onChange && onChange(font);
      });
    }
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'g' || e.key === 'G') && !e.repeat && current) {
        openFontSpecimen(current);
      }
    });
    onTap(cycle);
    loadScript('/fonts.js').then(cycle);
    return { cycle, getCurrent: () => current };
  }

  // --- "Sign in with GitHub" (shared by the commits and snake pages) ---
  // Auth via a GitHub App, but the browser never holds the app's client
  // secret. We redirect to GitHub's authorize page, come back with a short
  // `code`, and hand that code to a tiny Cloudflare Worker that does the
  // code->token exchange (the one step that needs the secret) and returns a
  // user-to-server token. The token is the visitor's own and lives only in
  // this browser (localStorage 'gh_token') — same trust model as the old
  // paste-a-PAT flow it replaces. CLIENT_ID and WORKER_URL are public.
  // The exchange Worker lives in its own repo (github.com/rjayasin/oauth-exchange)
  // and is deployed separately from this site to oauth-exchange.rjayasin.workers.dev.
  const GH_CLIENT_ID = 'Iv23lixPSQk9WGC2qD8F';
  const GH_WORKER_URL = 'https://oauth-exchange.rjayasin.workers.dev';
  const GH_TOKEN_KEY = 'gh_token';
  const GH_STATE_KEY = 'gh_oauth_state';

  function ghGetToken() {
    return localStorage.getItem(GH_TOKEN_KEY) || '';
  }

  // GitHub returns/expects file contents as base64. TextEncoder-based (btoa
  // alone is Latin-1 only) so non-ASCII content survives the round trip.
  function ghB64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000; // stay under fromCharCode's argument limit
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  function ghB64Decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  // A friendlier line for a GitHub API rate-limit response, with the reset
  // time when the (CORS-exposed) headers carry it. Returns null for anything
  // that isn't a rate limit — notably a permissions 403 — so callers can fall
  // back to their generic error text.
  function ghRateLimitError(res) {
    if (res.status !== 403 && res.status !== 429) return null;
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    const exhausted = res.headers.get('x-ratelimit-remaining') === '0';
    if (res.status === 403 && isNaN(ra) && !exhausted) return null; // permissions, not throttling
    let mins = null;
    if (!isNaN(ra)) mins = Math.ceil(ra / 60);
    else {
      const reset = parseInt(res.headers.get('x-ratelimit-reset') || '', 10);
      if (!isNaN(reset)) mins = Math.ceil((reset * 1000 - Date.now()) / 60000);
    }
    const when = mins && mins > 0 ? ` — resets in ~${mins}m` : '';
    const hint = ghIsAuthed() ? '' : '; sign in (top right) for a higher limit';
    return 'GitHub rate limit hit' + when + hint;
  }
  function ghIsAuthed() {
    return !!ghGetToken();
  }
  function ghClearToken() {
    localStorage.removeItem(GH_TOKEN_KEY);
  }

  function ghSignIn() {
    // Random state ties the redirect back to this tab and guards against CSRF.
    const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(GH_STATE_KEY, state);
    // redirect_uri must match a callback registered on the GitHub App; both the
    // /snake/ and /commits/ paths are registered, so the current page works.
    const redirectUri = location.origin + location.pathname;
    const url =
      'https://github.com/login/oauth/authorize?client_id=' +
      encodeURIComponent(GH_CLIENT_ID) +
      '&redirect_uri=' +
      encodeURIComponent(redirectUri) +
      '&state=' +
      encodeURIComponent(state);
    location.href = url;
  }

  // Call once at startup. When returning from GitHub's authorize page
  // (?code=&state=), exchange the code for a token via the Worker, store it,
  // and scrub the query so a refresh doesn't replay the (now-spent) code.
  // Resolves true only when a fresh sign-in just completed.
  async function ghHandleRedirect() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return false;
    const state = params.get('state');
    const expected = sessionStorage.getItem(GH_STATE_KEY);
    sessionStorage.removeItem(GH_STATE_KEY);
    const clean = location.origin + location.pathname + location.hash;
    if (!state || state !== expected) {
      history.replaceState(null, '', clean);
      return false;
    }
    try {
      const r = await fetch(GH_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await r.json().catch(() => ({}));
      if (data && data.access_token) {
        localStorage.setItem(GH_TOKEN_KEY, data.access_token);
        history.replaceState(null, '', clean);
        return true;
      }
    } catch (e) {
      /* fall through to the scrub + false below */
    }
    history.replaceState(null, '', clean);
    return false;
  }

  // Wire a GitHub-icon button: signed out -> start sign-in; signed in ->
  // confirm and sign out. onChange(authed) fires after a sign-out so the page
  // can refresh auth-dependent UI. Returns { refresh } to re-sync the button
  // (e.g. after a token is rejected by the API).
  function ghInitAuthButton({ buttonEl, onChange, signedInTitle, signedOutTitle }) {
    signedInTitle = signedInTitle || 'Signed in to GitHub (click to sign out)';
    signedOutTitle = signedOutTitle || 'Sign in with GitHub';
    function refresh() {
      const authed = ghIsAuthed();
      buttonEl.classList.toggle('authed', authed);
      buttonEl.title = authed ? signedInTitle : signedOutTitle;
    }
    buttonEl.addEventListener('click', () => {
      if (ghIsAuthed()) {
        if (confirm('Sign out of GitHub?')) {
          ghClearToken();
          refresh();
          if (onChange) onChange(false);
        }
        return;
      }
      ghSignIn();
    });
    refresh();
    return { refresh };
  }

  Object.assign(window.Common, {
    setFaviconHref,
    paintFaviconR,
    paintFavicon,
    initDarkMode,
    toggleDark,
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
    ensureEmojis,
    initHintBar,
    initHintUpdated,
    initFontCycle,
    initTextEditor,
    openSitemap,
    initSitemapShortcut,
    escHtml,
    fmtDay,
    fmtTime,
    GH: {
      getToken: ghGetToken,
      isAuthed: ghIsAuthed,
      clearToken: ghClearToken,
      signIn: ghSignIn,
      handleRedirect: ghHandleRedirect,
      initAuthButton: ghInitAuthButton,
      b64encode: ghB64Encode,
      b64decode: ghB64Decode,
      rateLimitError: ghRateLimitError,
    },
  });
})();
