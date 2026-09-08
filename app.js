/* ============================================================================
   SPSITKNM · TERÉN — app.js
   Téma · command palette · progres čítania · prečítané · kopírovanie · checklist
   · vrstevnicové kresby · aktuality. Bez frameworku, bez buildu.
   ========================================================================= */
(function () {
  'use strict';

  var BASE = ''; // relatívne — funguje lokálne aj na Pages
  var RAW = 'https://raw.githubusercontent.com/SPSITKNM';
  var CDN = {
    marked: 'https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.7/marked.min.js',
    purify: 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js',
    mini: 'https://cdnjs.cloudflare.com/ajax/libs/minisearch/7.1.1/umd/index.min.js',
    prism: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/'
  };
  var SUBJECTS = {
    pro: { name: 'Programovanie', repo: 'SPSITKNM' },
    sxg: { name: 'SMART technológie', repo: 'SXG' },
    oop: { name: 'Opakovanie OOP', repo: 'oop_opakovanie' }
  };

  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    getJSON: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } },
    setJSON: function (k, v) { ls.set(k, JSON.stringify(v)); }
  };

  var scriptCache = {};
  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  /* ── Emoji preč (display vrstva — zdrojové .md ostávajú kompatibilné s GitHubom) ── */
  // pictografy, emotikony, doprava, doplnkové symboly, vlajky, dingbaty + VS16/ZWJ.
  // Zámerne NEchytá  →  ←  ↗  §  —  ·  ⌘  ©  ™  ani číslice/#.
  var EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}\u{231B}\u{23E9}-\u{23FA}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  function stripEmojiDom(root) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) {
        // kód nechávame tak, ako je (emoji v string literáli / komentári neriešime)
        return t.parentElement && t.parentElement.closest('pre,code')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = w.nextNode())) if (EMOJI.test(n.nodeValue)) { EMOJI.lastIndex = 0; nodes.push(n); }
    nodes.forEach(function (t) {
      var v = t.nodeValue.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ');
      if (t.parentElement && /^H[1-6]$/.test(t.parentElement.tagName)) v = v.replace(/^[\s·:–—-]+/, '');
      t.nodeValue = v;
    });
  }

  /* ── Téma ──────────────────────────────────────────────────────────────── */
  var THEMES = ['system', 'light', 'dark'];
  var THEME_LABEL = { system: 'Systém', light: 'Papier', dark: 'Plot' };

  function applyTheme(t) {
    var root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
  }
  function currentTheme() { return ls.get('teren-theme', 'system'); }
  function cycleTheme() {
    var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    ls.set('teren-theme', next); applyTheme(next); paintThemeButtons();
  }
  function paintThemeButtons() {
    var t = currentTheme();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.textContent = THEME_LABEL[t];
      b.setAttribute('aria-label', 'Prepnúť tému (teraz: ' + THEME_LABEL[t] + ')');
    });
  }
  applyTheme(currentTheme()); // JS-cesta; inline snippet v <head> rieši pre-paint

  /* ── Prečítané / pozícia ───────────────────────────────────────────────── */
  function readKey(s, slug) { return 'read:' + s + '/' + slug; }
  function isRead(s, slug) { return ls.get(readKey(s, slug)) === '1'; }
  function toggleRead(s, slug) {
    var v = !isRead(s, slug);
    if (v) ls.set(readKey(s, slug), '1'); else ls.del(readKey(s, slug));
    return v;
  }
  function readCount(s, slugs) {
    return slugs.reduce(function (n, sl) { return n + (isRead(s, sl) ? 1 : 0); }, 0);
  }
  function savePos(slug, ratio) { ls.set('pos:' + slug, String(Math.round(ratio * 1000) / 1000)); }
  function lastRead() {
    var best = null, bestT = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf('seen:') === 0) {
          var t = +ls.get(k, 0);
          if (t > bestT) { bestT = t; best = k.slice(5); }
        }
      }
    } catch (e) {}
    return best; // "pro/algoritmizacia"
  }
  function markSeen(s, slug) { ls.set('seen:' + s + '/' + slug, String(Date.now())); }

  /* ── Kopírovanie kódu ──────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.copy');
    if (!btn) return;
    var box = btn.closest('.code') || btn.parentElement;
    var pre = box && box.querySelector('pre');
    if (!pre) return;
    var txt = pre.innerText;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    else { var r = document.createRange(); r.selectNodeContents(pre); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    var old = btn.textContent;
    btn.textContent = 'skopírované'; btn.setAttribute('data-done', '');
    var live = document.getElementById('teren-live'); if (live) live.textContent = 'Kód skopírovaný do schránky';
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.textContent = old; btn.removeAttribute('data-done'); }, 1500);
  });

  /* ── Vrstevnicová kresba ───────────────────────────────────────────────── */
  function contourSVG(lines, hot, w, h) {
    lines = Math.max(3, Math.min(lines || 6, 14)); w = w || 1200; h = h || 260;
    var gap = h / (lines + 1), out = '';
    for (var i = 0; i < lines; i++) {
      var y = h - (i + 1) * gap, amp = 10 + (i % 3) * 4, isHot = (i === hot);
      var stroke = isHot ? 'var(--acc)' : 'var(--line)';
      var d = 'M-20,' + y.toFixed(0);
      for (var x = 0; x <= w + 40; x += 140) {
        var yy = y + Math.sin((x / 140) + i * 0.7) * amp;
        d += ' L' + x + ',' + yy.toFixed(1);
      }
      out += '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (isHot ? 1.6 : 1) + '"' + (isHot ? ' class="hot"' : '') + '></path>';
    }
    return '<svg class="contours" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' + out + '</svg>';
  }

  /* ── Aktuality (fetch .md, skryť pri chybe) ─────────────────────────────── */
  function loadNews(el, repo, file) {
    if (!el) return;
    Promise.all([loadScript(CDN.marked), loadScript(CDN.purify)])
      .then(function () { return fetch(RAW + '/' + repo + '/main/' + encodeURIComponent(file) + '?_=' + Date.now(), { cache: 'default' }); })
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (md) {
        var body = el.querySelector('[data-news-body]') || el;
        body.innerHTML = window.DOMPurify.sanitize(window.marked.parse(md));
        stripEmojiDom(body);
        var first = body.firstElementChild;
        if (first && /^H[1-3]$/.test(first.tagName)) first.remove(); // blok má vlastný štítok
        el.hidden = false;
        var st = el.querySelector('[data-news-stamp]');
        if (st) st.textContent = file;
      })
      .catch(function () { el.hidden = true; });
  }

  /* ── Command palette ───────────────────────────────────────────────────── */
  var pal = { open: false, idx: 0, results: [], mini: null, opener: null, built: false };

  function buildCorpusFromContent() {
    return Promise.all(Object.keys(SUBJECTS).map(function (s) {
      return fetch(BASE + '/content/' + s + '.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    })).then(function (sets) {
      var docs = [];
      sets.forEach(function (set, i) {
        if (!set) return;
        var s = Object.keys(SUBJECTS)[i];
        (set.docs || []).forEach(function (d) {
          docs.push({
            id: s + '/' + d.slug, subject: s, title: d.title,
            snippet: d.desc || '', file: d.file, kind: d.kind || 'skripta',
            headings: (d.headings || []).join(' '),
            url: BASE + '/citacka.html?s=' + s + '&doc=' + d.slug
          });
        });
      });
      return docs;
    });
  }

  function ensureIndex() {
    if (pal.built) return Promise.resolve();
    return loadScript(CDN.mini)
      .then(function () {
        return fetch(BASE + '/search-index.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      })
      .then(function (idx) { return idx && idx.length ? idx : buildCorpusFromContent(); })
      .then(function (docs) {
        var MS = window.MiniSearch;
        pal.mini = new MS({
          fields: ['title', 'snippet', 'headings', 'file', 'body'],
          storeFields: ['title', 'snippet', 'file', 'subject', 'url', 'kind'],
          searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, headings: 2, snippet: 1.5 } }
        });
        pal.mini.addAll(docs.map(function (d, i) { return Object.assign({ _id: i }, d, { id: i }); }));
        pal._docs = docs;
        pal.built = true;
      });
  }

  function palNode() {
    var n = document.getElementById('teren-palette');
    if (n) return n;
    n = document.createElement('div');
    n.id = 'teren-palette'; n.hidden = true;
    n.innerHTML =
      '<div class="pal-overlay" data-pal-overlay>' +
      '  <div class="pal" role="dialog" aria-modal="true" aria-label="Hľadať v obsahu">' +
      '    <div class="pal__in"><span>&gt;</span>' +
      '      <input type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant="" ' +
      '        placeholder="Hľadaj v obsahu — „Big O“, „dedičnosť“, „docker compose“, „fork“" aria-label="Hľadať v obsahu" autocomplete="off" spellcheck="false">' +
      '      <button type="button" class="kbd" data-pal-close>esc</button>' +
      '    </div>' +
      '    <div class="pal__list" id="pal-list" role="listbox" aria-label="Výsledky"></div>' +
      '    <div class="pal__ft"><span>↑↓ pohyb</span><span>⏎ otvoriť</span><span>esc zavrieť</span>' +
      '      <span aria-live="polite" data-pal-count></span></div>' +
      '  </div></div>';
    document.body.appendChild(n);
    n.querySelector('[data-pal-overlay]').addEventListener('mousedown', function (e) {
      if (e.target === e.currentTarget) closePalette();
    });
    n.querySelector('[data-pal-close]').addEventListener('click', closePalette);
    var input = n.querySelector('input');
    input.addEventListener('input', function () { runQuery(input.value); });
    input.addEventListener('keydown', palKeydown);
    return n;
  }

  function renderResults() {
    var list = document.getElementById('pal-list');
    var count = document.querySelector('[data-pal-count]');
    if (!pal.results.length) {
      list.innerHTML = '<div class="pal__empty">Nič som nenašiel. Skús kratší výraz — index je nad nadpismi a popismi všetkých dokumentov.</div>';
      if (count) count.textContent = '0 výsledkov';
      return;
    }
    list.innerHTML = pal.results.map(function (r, i) {
      return '<a class="pal__opt" role="option" id="pal-o' + i + '" href="' + r.url + '" aria-selected="' + (i === pal.idx) + '">' +
        '<span class="sub s-' + r.subject + '">' + r.subject.toUpperCase() + '</span>' +
        '<span style="min-width:0;flex:1"><span class="ti">' + esc(r.title) + '</span>' +
        '<span class="sn">' + esc(r.snippet || '') + '</span></span>' +
        '<span class="fi">' + esc(r.file || '') + '</span></a>';
    }).join('');
    if (count) count.textContent = pal.results.length + ' výsledkov';
    syncActive();
    Array.prototype.forEach.call(list.querySelectorAll('.pal__opt'), function (a, i) {
      a.addEventListener('mouseenter', function () { pal.idx = i; syncActive(); });
    });
  }
  function syncActive() {
    var list = document.getElementById('pal-list'); if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.pal__opt'), function (a, i) {
      a.setAttribute('aria-selected', i === pal.idx ? 'true' : 'false');
      if (i === pal.idx) a.scrollIntoView({ block: 'nearest' });
    });
    var input = document.querySelector('#teren-palette input');
    if (input) input.setAttribute('aria-activedescendant', pal.results.length ? 'pal-o' + pal.idx : '');
  }
  function runQuery(q) {
    q = (q || '').trim();
    if (!pal.built) {
      var list = document.getElementById('pal-list');
      if (list) list.innerHTML = '<div class="pal__empty">Načítavam index…</div>';
      return; // po dostavaní indexu sa dopyt spustí znova (ensureIndex().then)
    }
    if (!q) { pal.results = topDocs(); pal.idx = 0; renderResults(); return; }
    var hits = pal.mini.search(q).slice(0, 8);
    pal.results = hits.map(function (h) { return { title: h.title, snippet: h.snippet, file: h.file, subject: h.subject, url: h.url }; });
    pal.idx = 0; renderResults();
  }
  function topDocs() {
    return (pal._docs || []).slice(0, 6).map(function (d) {
      return { title: d.title, snippet: d.snippet, file: d.file, subject: d.subject, url: d.url };
    });
  }
  function palKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); pal.idx = Math.min(pal.results.length - 1, pal.idx + 1); syncActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pal.idx = Math.max(0, pal.idx - 1); syncActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); var r = pal.results[pal.idx]; if (r) location.href = r.url; }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  }
  function palTrap(e) {
    if (e.key !== 'Tab') return;
    var n = document.getElementById('teren-palette'); if (!n || n.hidden) return;
    var f = n.querySelectorAll('input,button,a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function openPalette() {
    pal.opener = document.activeElement;
    var n = palNode(); n.hidden = false; pal.open = true;
    document.body.style.overflow = 'hidden';
    var input = n.querySelector('input'); input.value = '';
    document.getElementById('pal-list').innerHTML = '<div class="pal__empty">Načítavam index…</div>';
    ensureIndex().then(function () { runQuery(input.value); input.focus(); })
      .catch(function () { document.getElementById('pal-list').innerHTML = '<div class="pal__empty">Index sa nepodarilo načítať. Skús obnoviť stránku.</div>'; });
    input.focus();
    document.addEventListener('keydown', palTrap, true);
  }
  function closePalette() {
    var n = document.getElementById('teren-palette'); if (n) n.hidden = true;
    pal.open = false; document.body.style.overflow = '';
    document.removeEventListener('keydown', palTrap, true);
    if (pal.opener && pal.opener.focus) pal.opener.focus();
  }

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); pal.open ? closePalette() : openPalette(); return; }
    if (k === '/' && !pal.open && !/^(input|textarea|select)$/i.test((e.target.tagName || '')) && !e.target.isContentEditable) {
      e.preventDefault(); openPalette();
    }
  });

  /* ── Progres čítania ───────────────────────────────────────────────────── */
  function initProgress() {
    var bar = document.querySelector('.pbar > i'); if (!bar) return;
    var slug = document.body.getAttribute('data-slug');
    var tick = function () {
      var d = document.documentElement;
      var max = d.scrollHeight - d.clientHeight;
      var r = max > 0 ? d.scrollTop / max : 0;
      bar.style.width = (r * 100).toFixed(1) + '%';
      if (slug) savePos(slug, r);
    };
    tick();
    addEventListener('scroll', tick, { passive: true });
    addEventListener('resize', tick);
  }

  /* ── Checklist ─────────────────────────────────────────────────────────── */
  function initChecklist() {
    var box = document.querySelector('[data-checklist]'); if (!box) return;
    var KEY = box.getAttribute('data-checklist') || 'oop-check';
    var state = ls.getJSON(KEY, {});
    var items = Array.prototype.slice.call(box.querySelectorAll('.check'));
    var total = items.length;

    function paint() {
      var done = items.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).length;
      var pct = total ? Math.round(done / total * 100) : 0;
      document.querySelectorAll('[data-ring-fg]').forEach(function (c) {
        var len = 2 * Math.PI * (+c.getAttribute('r'));
        c.style.strokeDasharray = len.toFixed(1);
        c.style.strokeDashoffset = (len * (1 - done / total)).toFixed(1);
      });
      document.querySelectorAll('[data-ring-num]').forEach(function (n) { n.textContent = done; });
      document.querySelectorAll('[data-ring-total]').forEach(function (n) { n.textContent = total; });
      document.querySelectorAll('[data-progress-label]').forEach(function (n) { n.textContent = 'zvládnuté ' + done + ' / ' + total + ' tém'; });
      document.querySelectorAll('[role="progressbar"]').forEach(function (p) {
        p.setAttribute('aria-valuenow', String(pct)); p.setAttribute('aria-valuetext', done + ' z ' + total);
      });
    }
    items.forEach(function (b) {
      var id = b.getAttribute('data-id');
      if (state[id]) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) state[id] = 1; else delete state[id];
        ls.setJSON(KEY, state); paint();
      });
    });
    var reset = document.querySelector('[data-checklist-reset]');
    if (reset) reset.addEventListener('click', function () {
      state = {}; ls.setJSON(KEY, {});
      items.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      paint();
    });
    paint();
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function readingMins(words) { return Math.max(1, Math.round(words / 190)); }
  function isNew(dateStr) {
    if (!dateStr) return false;
    return (Date.now() - Date.parse(dateStr)) / 864e5 < 21;
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  function boot() {
    if (!document.getElementById('teren-live')) {
      var live = document.createElement('div');
      live.id = 'teren-live'; live.className = 'skip'; live.setAttribute('aria-live', 'polite');
      live.style.cssText = 'position:absolute;left:-9999px'; document.body.appendChild(live);
    }
    paintThemeButtons();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', cycleTheme); });
    document.querySelectorAll('[data-open-palette]').forEach(function (b) { b.addEventListener('click', openPalette); });
    document.querySelectorAll('[data-toc-toggle]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var t = document.querySelector('.toc[data-drawer]'); if (t) t.classList.toggle('open');
      });
    });
    initProgress();
    initChecklist();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ── Verejné API ──────────────────────────────────────────────────────── */
  window.TEREN = {
    BASE: BASE, RAW: RAW, CDN: CDN, SUBJECTS: SUBJECTS, ls: ls,
    loadScript: loadScript, contourSVG: contourSVG, loadNews: loadNews, stripEmojiDom: stripEmojiDom,
    isRead: isRead, toggleRead: toggleRead, readCount: readCount,
    lastRead: lastRead, markSeen: markSeen, readingMins: readingMins, isNew: isNew,
    openPalette: openPalette, esc: esc, initChecklist: initChecklist
  };
})();
