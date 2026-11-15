/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Energy Flow Widget V1 — shows the REAL power flow Home Assistant reports between Solar, Grid, Home, Battery and EV.
   A DISPLAY: every value is what a mapped entity says. Nothing is calculated, balanced, estimated or integrated over time.

   MaisonEnergy.create(config) → HTMLElement (.iq-energy), with el.energy = { getState(), setState(patch) }

   config = {
     id, name, subtitle, variant: 'flow' (default) | 'compact'
     gridMode: 'signed' (default) | 'separate'
     signs:    { solar: 'positive' | 'negative'  (which sign means generation; default positive)
                 grid: 'import' | 'export'        (what a positive signed grid value means; default import)
                 battery: 'charge' | 'discharge'  (what a positive battery value means; default charge)
                 ev: 'positive' | 'negative' }    (which sign means charging; default positive)
     LINKED (from the binding — Home Assistant only):
       ha:     the HOME power entity, resolved   { state: 'ready', entity, available, value, unit, text }
       mapped: { solar, grid, gridImport, gridExport, battery, batteryLevel, ev, evLevel, solarToday, gridImportToday,
                 gridExportToday, homeToday, evToday } — each null (not mapped) or { state: 'loading' | 'missing' | 'ready', … }
     DEMO (unlinked): demoHome, demoSolar, demoGrid (+ import / − export), demoBattery (+ charge / − discharge), demoLevel,
                      demoEv, demoEvLevel — in W; a node exists only when its demo value is given
     infoItems: Information lines (read-only, no energy meaning)
   }
   The sign only ever chooses a DIRECTION; the magnitude is always shown as a positive number with its HA unit and a word /
   arrow (Import / Export, Charging / Discharging). Each connection shows only what ITS entity says — never a balance.
   Motion: dots travel along each connection (the shared 'flow' animation — CSS, paused off screen, none with reduced motion);
   a static chevron always shows the direction too. 0 → the line stays, nothing moves. Unavailable → a dashed line.
   Arrangements (MaisonFit, the widget's OWN box): flow → micro (summary, no diagram) · cross (square / tall) · wide; the disc
   size (s / m / l) is the largest that fits the box and its nodes;
   compact → a list (rows hide by priority as the height runs out).
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // original IniqDash glyphs (stroke icons)
  const ICONS = {
    home: S('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5.5h4V20"/>'),
    solar: S('<circle cx="12" cy="8" r="3.2"/><path d="M12 2v1.4M6.3 4.3l1 1M17.7 4.3l-1 1M4 9h1.4M18.6 9H20"/><path d="M5 21l2-7h10l2 7z"/><path d="M6 17.5h12M12 14v7"/>'),
    grid: S('<path d="M12 3 8 21M12 3l4 18M9.2 9h5.6M8.4 13h7.2M7.2 18h9.6"/><path d="M5 6h14"/>'),
    battery: S('<rect x="6.5" y="4.5" width="11" height="16" rx="2.2"/><path d="M10 2.8h4"/><path d="M12.6 8.5 10.4 12.6h3.2l-2.2 4.1"/>'),
    ev: S('<path d="M5 16.5V12l1.8-4.2A2 2 0 0 1 8.6 6.6h6.8a2 2 0 0 1 1.8 1.2L19 12v4.5"/><path d="M4 16.5h16v2.5H4z"/><circle cx="8" cy="16.5" r="1.4"/><circle cx="16" cy="16.5" r="1.4"/><path d="M5.6 12h12.8"/>'),
  };
  const LABEL = { home: 'Home', solar: 'Solar', grid: 'Grid', battery: 'Battery', ev: 'EV' };
  const NODES = ['solar', 'grid', 'battery', 'ev'];
  const TOTAL = { solar: 'solarToday', home: 'homeToday', ev: 'evToday' };
  const fin = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));

  /** a magnitude with Home Assistant's own unit (never converted): W whole, other units up to 2 decimals */
  function fmt(abs, unit) {
    if (abs === null) return '';
    const u = unit || '';
    const t = abs.toLocaleString(undefined, { maximumFractionDigits: /^W$/i.test(u) ? 0 : 2 });
    return u ? (u === '%' ? `${t}%` : `${t} ${u}`) : t;
  }
  /** watts, ONLY to pace the animation (W / kW / MW); another unit → a steady pace */
  const watts = (abs, unit) => (abs === null ? null : ({ W: 1, kW: 1000, MW: 1e6 }[unit] ? abs * { W: 1, kW: 1000, MW: 1e6 }[unit] : null));

  function create(config) {
    if (config && config.variant === 'system') return createSystem(config);
    if (config && (config.variant === 'circles' || config.variant === 'nodes' || config.variant === 'tesla' || config.variant === 'house')) return createNodes(config);
    let s = { gridMode: 'signed', signs: {}, ...(config || {}) };
    const V = global.IniqVisuals;
    const variant = s.variant === 'compact' ? 'compact' : 'flow';
    const linked = () => !!s.ha;
    const name = () => s.name || 'Energy';
    const sign = (k, d) => (s.signs && s.signs[k]) || d;
    const separate = s.gridMode === 'separate';

    /* which nodes exist — fixed by the configuration (linked: what is MAPPED; demo: what has a demo value) */
    const has = {};
    if (s.ha) {
      const m = s.mapped || {};
      has.solar = !!m.solar; has.battery = !!m.battery || !!m.batteryLevel; has.ev = !!m.ev || !!m.evLevel;
      has.grid = separate ? !!(m.gridImport || m.gridExport) : !!m.grid;
    } else NODES.forEach((k) => { has[k] = fin(s[`demo${k === 'ev' ? 'Ev' : k.charAt(0).toUpperCase() + k.slice(1)}`]) !== null || (k === 'battery' && fin(s.demoLevel) !== null) || (k === 'ev' && fin(s.demoEvLevel) !== null); });
    const present = NODES.filter((k) => has[k]);

    const root = document.createElement('article');
    root.className = 'iq-energy';
    root.dataset.variant = variant;
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqEnergyId = s.id;
    root.innerHTML = `
      <div class="iq-energy__in">
        <header class="iq-energy__head"><h3 class="iq-energy__name"></h3><p class="iq-energy__sub"></p></header>
        <div class="iq-energy__stage"><svg class="iq-energy__lines" aria-hidden="true"></svg></div>
        <ul class="iq-energy__list"></ul>
        <p class="iq-energy__info"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const stage = $('.iq-energy__stage'), svg = $('.iq-energy__lines'), list = $('.iq-energy__list');
    const NS = 'http://www.w3.org/2000/svg';

    /* ---- nodes (Flow: circles on the stage; Compact / micro: rows) — buttons when they can open Entity Details ---- */
    const node = {}, row = {}, line = {};
    ['home', ...present].forEach((k) => {
      const n = document.createElement('button');
      n.type = 'button'; n.className = `iq-energy__node iq-energy__node--${k}`; n.dataset.node = k; n.dataset.iqControl = '';
      n.innerHTML = `<span class="iq-energy__disc"><span class="iq-energy__ring"></span><span class="iq-energy__icon">${ICONS[k]}</span></span><span class="iq-energy__txt"><b class="iq-energy__val"></b><span class="iq-energy__cap"><span class="iq-energy__label"></span><span class="iq-energy__dir"></span></span></span>`;
      n.querySelector('.iq-energy__label').textContent = LABEL[k];
      n.addEventListener('click', (e) => { e.stopPropagation(); details(k); });
      stage.append(n);
      node[k] = n;
      const r = document.createElement('li');
      r.className = `iq-energy__row iq-energy__row--${k}`; r.dataset.node = k;
      r.dataset.prio = { home: 1, solar: 2, grid: 2, battery: 3, ev: 4 }[k];
      r.innerHTML = `<span class="iq-energy__ri">${ICONS[k]}</span><span class="iq-energy__rl"></span><b class="iq-energy__rv"></b><span class="iq-energy__rd"></span>`;
      r.querySelector('.iq-energy__rl').textContent = LABEL[k];
      list.append(r);
      row[k] = r;
    });
    // levels: the shared ProgressRing round the battery / EV disc (only with a real percentage)
    const rings = {};
    ['battery', 'ev'].forEach((k) => { if (node[k] && V) { rings[k] = V.ring({ label: `${LABEL[k]} level`, thickness: 0.07, gap: 0, tone: 'success' }); node[k].querySelector('.iq-energy__ring').append(rings[k].el); } });
    // totals row (daily values Home Assistant supplies — display only)
    const totals = document.createElement('li');
    totals.className = 'iq-energy__row iq-energy__row--totals'; totals.dataset.prio = '5';
    list.append(totals);

    /* ---- connections: a track, the moving dots (shared 'flow' animation) and a static direction chevron ---- */
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([a, v]) => e.setAttribute(a, v)); return e; };
    present.forEach((k) => {
      const g = mk('g', { class: `iq-energy__link iq-energy__link--${k}` });
      const track = mk('path', { class: 'iq-energy__track' });
      const dots = mk('path', { class: 'iq-energy__dots' });
      const dots2 = mk('path', { class: 'iq-energy__dots iq-energy__dots--b' });         // grid (separate): import and export at once
      const chev = mk('path', { class: 'iq-energy__chev', d: 'M-4 -5 L3 0 L-4 5' });
      const chev2 = mk('path', { class: 'iq-energy__chev iq-energy__chev--b', d: 'M-4 -5 L3 0 L-4 5' });
      g.append(track, dots, dots2, chev, chev2);
      svg.append(g);
      line[k] = { g, track, dots, dots2, chev, chev2 };
    });
    const PACE = (k) => ({ from: `w_${k}`, range: [50, 6000], to: [3.4, 0.9] });
    const motion = V ? V.layers(present.flatMap((k) => [
      { target: line[k].dots, rules: [{ when: { key: `d_${k}`, equals: 'out' }, animate: { type: 'flow', duration: PACE(k) } },
        { when: { key: `d_${k}`, equals: 'in' }, animate: { type: 'flow', duration: PACE(k), direction: 'reverse' } },
        { when: { key: `d_${k}`, equals: 'both' }, animate: { type: 'flow', duration: PACE(`${k}i`) } }] },
      { target: line[k].dots2, rules: [{ when: { key: `d_${k}`, equals: 'both' }, animate: { type: 'flow', duration: PACE(`${k}e`), direction: 'reverse' } }] },
    ])) : null;

    /* ---- the data: Home Assistant's (linked) or the demo values (unlinked) — one shape for both ---- */
    const DEMO_UNIT = 'W';
    function src(role) {
      if (linked()) {
        const x = role === 'home' ? s.ha : (s.mapped || {})[role];
        if (!x) return null;
        if (x.state === 'loading') return { kind: 'loading' };
        if (x.state === 'missing') return { kind: 'missing', entity: x.entity };
        if (!x.available) return { kind: x.text === 'unknown' ? 'unknown' : 'unavailable', entity: x.entity };
        if (x.value === null) return { kind: 'unknown', entity: x.entity, text: x.text };
        return { kind: 'ok', value: x.value, unit: x.unit || '', entity: x.entity, text: x.text };
      }
      const key = { home: 'demoHome', solar: 'demoSolar', grid: 'demoGrid', battery: 'demoBattery', batteryLevel: 'demoLevel', ev: 'demoEv', evLevel: 'demoEvLevel' }[role];
      const v = key ? fin(s[key]) : null;
      if (v === null) return null;
      if (role === 'grid' && separate) return null;
      return { kind: 'ok', value: v, unit: /Level$/.test(role) ? '%' : DEMO_UNIT };
    }
    const word = (x) => ({ loading: '…', missing: 'Not found', unknown: 'Unknown', unavailable: 'Unavailable' })[x.kind] || '';
    /** one node: its displayed magnitude, its direction relative to Home ('out' = towards Home, 'in' = from Home) and its words */
    function nodeView(k) {
      if (k === 'home') {
        const x = src('home');
        if (!x || x.kind !== 'ok') return { k, na: true, text: x ? word(x) : 'Unavailable', dir: 'none', words: '', speak: `Home ${x ? word(x).toLowerCase() : 'unavailable'}` };
        return { k, text: fmt(Math.abs(x.value), x.unit), dir: 'none', words: '', speak: `Home ${fmt(Math.abs(x.value), x.unit)}`, entity: x.entity };
      }
      if (k === 'grid' && separate) {
        const i = src('gridImport'), e = src('gridExport');
        const iv = i && i.kind === 'ok' ? i.value : null, ev = e && e.kind === 'ok' ? e.value : null;
        const ent = (i && i.entity) || (e && e.entity);
        if (iv === null && ev === null) { const bad = i || e; return { k, na: true, text: bad ? word(bad) : 'Unavailable', dir: 'na', words: '', speak: `Grid ${(bad ? word(bad) : 'unavailable').toLowerCase()}`, entity: ent }; }
        const imp = iv !== null && iv > 0, exp = ev !== null && ev > 0;
        const parts = [imp ? `${fmt(iv, i.unit)} import` : '', exp ? `${fmt(ev, e.unit)} export` : ''].filter(Boolean);
        // both reported at once: both are shown, both directions move — nothing is netted
        const dir = imp && exp ? 'both' : imp ? 'out' : exp ? 'in' : 'none';
        const text = imp && exp ? fmt(iv, i.unit) : imp ? fmt(iv, i.unit) : exp ? fmt(ev, e.unit) : fmt(0, (i && i.unit) || (e && e.unit) || 'W');
        const sub = imp && exp ? `Import · ${fmt(ev, e.unit)} export` : imp ? 'Import' : exp ? 'Export' : 'Idle';
        const na = (iv === null ? ' · import unavailable' : '') + (ev === null ? ' · export unavailable' : '');
        return { k, text, dir, words: sub + na, w: watts(imp ? iv : ev, imp ? i.unit : e && e.unit), wi: watts(iv, i && i.unit), we: watts(ev, e && e.unit),
          speak: `Grid ${parts.length ? parts.join(' and ') : 'idle'}`, entity: ent };
      }
      const x = src(k);
      const lvl = k === 'battery' || k === 'ev' ? src(`${k}Level`) : null;
      const level = lvl && lvl.kind === 'ok' ? Math.max(0, Math.min(100, lvl.value)) : null;
      const lvlText = lvl ? (lvl.kind === 'ok' ? fmt(level, '%') : `Level ${word(lvl).toLowerCase()}`) : '';
      if (!x) return { k, text: lvlText || '—', dir: 'none', words: '', level, lvl, speak: `${LABEL[k]} ${lvlText}`, entity: lvl && lvl.entity, levelOnly: true };
      if (x.kind !== 'ok') return { k, na: true, text: word(x), dir: 'na', words: lvl && lvl.kind === 'ok' ? lvlText : '', level, lvl, speak: `${LABEL[k]} ${word(x).toLowerCase()}`, entity: x.entity };
      const v = x.value, abs = Math.abs(v), mag = fmt(abs, x.unit);
      // the sign → a direction (the configured convention); 0 → no flow
      let toHome = 0;
      if (k === 'solar') toHome = (sign('solar', 'positive') === 'positive' ? v : -v);
      else if (k === 'grid') toHome = (sign('grid', 'import') === 'import' ? v : -v);
      else if (k === 'battery') toHome = -(sign('battery', 'charge') === 'charge' ? v : -v);       // charging = from Home
      else if (k === 'ev') toHome = -(sign('ev', 'positive') === 'positive' ? v : -v);             // charging = from Home
      const dir = toHome > 0 ? 'out' : toHome < 0 ? 'in' : 'none';
      const W = {
        solar: { out: 'Generating', in: 'Consuming', none: 'Not generating' },
        grid: { out: 'Import', in: 'Export', none: 'Idle' },
        battery: { out: 'Discharging', in: 'Charging', none: 'Idle' },
        ev: { out: 'Discharging', in: 'Charging', none: 'Idle' },
      }[k][dir];
      const speak = `${LABEL[k]} ${W.toLowerCase()}${dir === 'none' && k !== 'solar' ? '' : ` ${mag}`}${level !== null ? `, ${Math.round(level)} percent` : ''}`;
      return { k, text: mag, dir, words: W, level, lvl, lvlText, w: watts(abs, x.unit), speak, entity: x.entity };
    }
    const totalOf = (role) => { const x = src(role); if (!x) return null; return x.kind === 'ok' ? fmt(Math.abs(x.value), x.unit) : word(x).toLowerCase(); };
    const ARROW = { out: '→', in: '←', both: '⇄', none: '', na: '' };   // relative to Home: see dirWord()

    function details(k) {
      if (!linked()) return;
      const v = nodeView(k);
      const entity = k === 'home' ? s.ha.entity : v.entity;
      if (!entity) return;
      root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity, info: [], label: LABEL[k] }, meta: { source: 'more' }, widget: 'details' } }));
    }

    /* ---- geometry: the Home hub in the middle, the other nodes as chips on either side (COLS) or above / below (ROWS), joined by
       smooth curves; every size comes from the OWN box (px, so the dots keep their shape at every size) ---- */
    let hasTot = false, geo = null, hasInfo = Array.isArray(s.infoItems) && s.infoItems.some((x) => x && x.line);
    const ORDER = ['solar', 'grid', 'battery', 'ev'].filter((k) => present.includes(k));
    const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));
    /** rectangles for the chips + the hub for one arrangement, or null when they do not fit the box without touching */
    function plan(w, h, arr) {
      const half = Math.ceil(ORDER.length / 2), A = ORDER.slice(0, half), B = ORDER.slice(half);
      const top = s.subtitle ? 48 : 38, bottom = hasInfo ? 24 : 10, H = h - top - bottom, pad = 12;
      const rect = {}; let hub;
      const sc = clamp(1, Math.min(w / 520, H / 240), 1.45);   // LARGE boxes: bigger chips, hub and type — not just more air
      if (arr === 'cols') {
        const m = Math.max(A.length, B.length, 1), CH = clamp(50, Math.floor((H - (m - 1) * 10) / m), Math.round(64 * sc));
        if (m * CH + (m - 1) * 10 > H + 0.5) return null;
        const Hr = clamp(34, Math.min(Math.round(48 * sc), Math.floor(H / 2) - 2, Math.floor((w - 2 * pad - 2 * 26 - 2 * 150) / 2)), Math.round(48 * sc));
        const CW = Math.min(Math.round(184 * sc), Math.floor((w - 2 * pad - 2 * 26 - 2 * Hr) / 2));
        if (CW < 124) return null;
        const colY = (n, i) => top + (H - (n * CH + (n - 1) * 10)) / 2 + i * (CH + 10);
        A.forEach((k, i) => { rect[k] = { x: pad, y: colY(A.length, i), w: CW, h: CH, side: 'a' }; });
        B.forEach((k, i) => { rect[k] = { x: w - pad - CW, y: colY(B.length, i), w: CW, h: CH, side: 'b' }; });
        const cx = B.length ? (A.length ? w / 2 : pad + CW + 30 + (w - 2 * pad - CW - 30) / 2) : (w - pad - (w - 2 * pad - CW - 30) / 2);
        hub = { x: cx, y: top + H / 2, r: Hr };
      } else {
        const CH = 54, rows = [A, B].filter((r) => r.length), gapV = 22;
        const need = rows.length * CH + (rows.length ? rows.length : 1) * gapV;
        const Hr = clamp(34, Math.min(52, Math.floor((H - rows.length * CH - rows.length * gapV) / 2)), 52);
        if (rows.length * CH + rows.length * gapV + 2 * Hr > H + 0.5) return null;
        [[A, 0], [B, 1]].forEach(([row, idx]) => {
          if (!row.length) return;
          const CW = Math.min(184, Math.floor((w - 2 * pad - (row.length - 1) * 10) / row.length));
          if (CW < 124) rect.__bad = true;
          const total = row.length * CW + (row.length - 1) * 10, x0 = (w - total) / 2;
          row.forEach((k, i) => { rect[k] = { x: x0 + i * (CW + 10), y: idx === 0 ? top : h - bottom - CH, w: CW, h: CH, side: idx ? 'b' : 'a' }; });
        });
        if (rect.__bad) return null;
        const y0 = A.length ? top + CH + gapV : top, y1 = B.length ? h - bottom - CH - gapV : h - bottom;
        hub = { x: w / 2, y: (y0 + y1) / 2, r: Hr };
        void need;
      }
      return { rect, hub, arr, sc };
    }
    const bez = (a, b, vertical) => {
      const k = vertical ? [0, (b[1] - a[1]) / 2] : [(b[0] - a[0]) / 2, 0];
      const c1 = [a[0] + k[0], a[1] + k[1]], c2 = [b[0] - k[0], b[1] - k[1]];
      return { d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)}C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`,
        mid: [(a[0] + 3 * c1[0] + 3 * c2[0] + b[0]) / 8, (a[1] + 3 * c1[1] + 3 * c2[1] + b[1]) / 8],
        ang: (Math.atan2(b[1] + c2[1] - c1[1] - a[1], b[0] + c2[0] - c1[0] - a[0]) * 180) / Math.PI };
    };
    function layout(w, h, arr) {
      const g = plan(w, h, arr);
      if (!g) return false;
      geo = g;
      const { rect, hub } = g, vertical = arr === 'rows';
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      root.dataset.iqEnergySize = hub.r >= 46 ? 'l' : hub.r >= 40 ? 'm' : 's';
      root.style.setProperty('--iq-energy-sc', String(g.sc.toFixed(2)));
      Object.entries(rect).forEach(([k, r]) => {
        const n = node[k]; if (!n) return;
        n.style.left = `${Math.round(r.x)}px`; n.style.top = `${Math.round(r.y)}px`; n.style.width = `${Math.round(r.w)}px`; n.style.height = `${Math.round(r.h)}px`;
        n.style.setProperty('--iq-energy-ch', `${Math.round(r.h)}px`);
        n.dataset.wide = r.w >= 172 ? 'true' : 'false';
        n.dataset.tall = r.h >= 62 ? 'true' : 'false';
      });
      const hn = node.home;
      hn.style.left = `${Math.round(hub.x - hub.r)}px`; hn.style.top = `${Math.round(hub.y - hub.r)}px`; hn.style.width = hn.style.height = `${Math.round(hub.r * 2)}px`;
      hn.style.setProperty('--iq-energy-r', `${hub.r}px`);
      g.centre = { home: [hub.x, hub.y] };
      present.forEach((k) => {
        const r = rect[k]; if (!r) return;
        g.centre[k] = [r.x + r.w / 2, r.y + r.h / 2];
        let a, b;
        const hx = hub.x, hy = hub.y, e = hub.r + 3;
        if (vertical) {
          a = [r.x + r.w / 2, r.side === 'a' ? r.y + r.h : r.y];
          const dx = a[0] - hx, dy = a[1] - hy, dd = Math.hypot(dx, dy) || 1;
          b = [hx + (dx / dd) * e, hy + (dy / dd) * e];
        } else {
          a = [r.side === 'a' ? r.x + r.w : r.x, r.y + r.h / 2];
          const dx = a[0] - hx, dy = a[1] - hy, dd = Math.hypot(dx, dy) || 1;
          b = [hx + (dx / dd) * e, hy + (dy / dd) * e];
        }
        const P = bez(a, b, vertical);
        line[k].track.setAttribute('d', P.d); line[k].dots.setAttribute('d', P.d); line[k].dots2.setAttribute('d', P.d);
        const off = line[k].g.dataset.both === 'true' ? 3.5 : 0;
        line[k].dots.setAttribute('transform', vertical ? `translate(${-off} 0)` : `translate(0 ${-off})`);
        line[k].dots2.setAttribute('transform', vertical ? 'translate(3.5 0)' : 'translate(0 3.5)');
        line[k].mid = [P.mid[0], P.mid[1], P.ang];
        placeChevrons(k);
      });
      return true;
    }
    function placeChevrons(k) {
      const L = line[k]; if (!L.mid) return;
      const [mx, my, ang] = L.mid, dir = L.g.dataset.dir;
      const rot = dir === 'in' ? ang + 180 : ang;                  // the chevron points the way the energy goes (the curves are drawn node → Home)
      L.chev.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${rot.toFixed(1)})${dir === 'both' ? ' translate(-7 0)' : ''}`);
      L.chev2.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${(ang + 180).toFixed(1)}) translate(-7 0)`);
    }
    function arrange(w, h) {
      let arr;
      if (variant === 'compact') arr = 'list';
      else if (w < 200 || h < 170) arr = 'micro';
      else {
        const order = w >= 1.25 * h ? ['cols', 'rows'] : ['rows', 'cols'];
        arr = order.find((a) => plan(w, h, a)) || 'micro';       // a diagram that cannot fit is never half-drawn
        if (arr !== 'micro') layout(w, h, arr);
      }
      if (arr === 'micro' || arr === 'list') { const m = Math.min(w, h); if (root.dataset.iqEnergySize !== (m < 250 ? 's' : 'm')) root.dataset.iqEnergySize = m < 250 ? 's' : 'm'; requestFit(); }
      return arr;
    }

    function render() {
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.iq-energy__name').textContent = name();
      $('.iq-energy__sub').textContent = s.subtitle || ''; $('.iq-energy__sub').hidden = !s.subtitle;
      const views = Object.fromEntries(['home', ...present].map((k) => [k, nodeView(k)]));
      const anim = {};
      Object.values(views).forEach((v) => {
        const n = node[v.k], r = row[v.k];
        n.dataset.dir = v.dir; n.dataset.na = v.na ? 'true' : 'false';
        n.querySelector('.iq-energy__val').textContent = v.text;
        n.style.setProperty('--iq-energy-len', String(Math.max(4, v.text.length)));          // long readings shrink to fit the disc
        { const d = n.querySelector('.iq-energy__dir'), ar = v.words && ARROW[v.dir] ? dirArrow(v) : '';
          d.replaceChildren(); if (ar) { const a = document.createElement('span'); a.className = 'iq-energy__arr'; a.textContent = ar; d.append(a); }
          if (v.words) { const t = document.createElement('span'); t.className = 'iq-energy__wd'; t.textContent = `${ar ? ' ' : ''}${v.words}`; d.append(t); } }
        const tot = TOTAL[v.k] ? totalOf(TOTAL[v.k]) : null;
        setLabel(n, LABEL[v.k], tot ? `${tot} today` : '');
        n.setAttribute('aria-label', `${v.speak}${linked() ? '. Details' : ''}`);
        n.disabled = !linked() || !(v.k === 'home' ? s.ha && s.ha.entity : v.entity);
        r.dataset.dir = v.dir; r.dataset.na = v.na ? 'true' : 'false';
        r.querySelector('.iq-energy__rv').textContent = v.text;
        r.querySelector('.iq-energy__rd').textContent = v.k === 'home' ? '' : [v.words ? `${dirArrow(v)} ${v.words}`.trim() : '', (v.k === 'battery' || v.k === 'ev') && v.lvl && !v.levelOnly ? v.lvlText : ''].filter(Boolean).join(' · ');
        if (rings[v.k]) rings[v.k].update(v.lvl ? { value: v.level, available: v.lvl.kind === 'ok' } : {});
        if (line[v.k]) {
          const L = line[v.k];
          const both = String(v.dir === 'both');
          if (L.g.dataset.both !== undefined && L.g.dataset.both !== both && global.MaisonFit && root.isConnected) { L.g.dataset.both = both; global.MaisonFit.refresh(root); }   // two streams side by side
          L.g.dataset.dir = v.dir; L.g.dataset.na = v.na ? 'true' : 'false'; L.g.dataset.both = both;
          anim[`d_${v.k}`] = v.na ? 'na' : v.dir; anim[`w_${v.k}`] = v.w ?? 2000; anim[`w_${v.k}i`] = v.wi ?? 2000; anim[`w_${v.k}e`] = v.we ?? 2000;
          placeChevrons(v.k);
        }
      });
      if (motion) motion.update(anim);
      // daily totals (HA's own values, display only)
      const T = [['solarToday', 'Solar'], ['gridImportToday', 'Import'], ['gridExportToday', 'Export'], ['homeToday', 'Home'], ['evToday', 'EV']]
        .map(([role, l]) => { const t = totalOf(role); return t ? `${l} ${t}` : ''; }).filter(Boolean);
      totals.textContent = T.length ? `Today: ${T.join(' · ')}` : '';
      totals.hidden = !T.length;
      root.dataset.hasTotals = T.length ? 'true' : 'false';
      if (!!T.length !== hasTot) { hasTot = !!T.length; if (global.MaisonFit && root.isConnected) global.MaisonFit.refresh(root); }   // captions get a line for "today"
      const gt = [['gridImportToday', 'in'], ['gridExportToday', 'out']].map(([role, l]) => { const t = totalOf(role); return t ? `${t} ${l}` : ''; }).filter(Boolean);
      if (node.grid) setLabel(node.grid, 'Grid', gt.length ? `${gt.join(' · ')} today` : '');
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      $('.iq-energy__info').textContent = info; $('.iq-energy__info').hidden = !info;
      if (!!info !== hasInfo) { hasInfo = !!info; if (global.MaisonFit && root.isConnected) global.MaisonFit.refresh(root); }   // the diagram makes room for it
      if (variant === 'compact' || root.dataset.fitArr === 'micro') requestFit();
      // the whole picture, in words (never only the animation)
      root.setAttribute('aria-label', `${name()}: ${Object.values(views).map((v) => v.speak).join('. ')}.`);
    }
    /** a node's label (+ HA's own total for today, shown beside it on large discs) */
    function setLabel(n, label, today) {
      const l = n.querySelector('.iq-energy__label');
      l.replaceChildren(document.createTextNode(label));
      if (today) { const t = document.createElement('span'); t.className = 'iq-energy__today'; t.textContent = today; l.append(t); }
    }
    /** the arrow next to a node's words, in the direction the energy goes ON SCREEN for that node */
    function dirArrow(v) {
      if (v.dir === 'none' || v.dir === 'na') return '';
      if (v.dir === 'both') return '⇄';
      const into = v.dir === 'out';                                  // towards Home
      const c = geo && geo.centre && geo.centre[v.k] && geo.centre.home ? [geo.centre[v.k][0] - geo.centre.home[0], geo.centre[v.k][1] - geo.centre.home[1]] : ({ grid: [-1, 0], battery: [1, 0], solar: [0, -1], ev: [0, 1] })[v.k] || [0, 0];
      if (Math.abs(c[1]) > Math.abs(c[0])) return c[1] < 0 ? (into ? '↓' : '↑') : (into ? '↑' : '↓');
      return c[0] < 0 ? (into ? '→' : '←') : (into ? '←' : '→');
    }

    /* COMPACT / micro: rows give way in priority order until the list fits its own box (measured — layout sizes, zoom-proof):
       daily totals → EV → the direction / level words → Battery → Grid → Solar. Home always stays. */
    let fitQ = false;
    const requestFit = () => { if (fitQ) return; fitQ = true; Promise.resolve().then(() => { fitQ = false; fitRows(); }); };
    function fitRows() {
      if (!root.isConnected || list.offsetParent === null) return;
      const CUT = [totals, row.ev, 'words', row.battery, row.grid, row.solar].filter(Boolean);
      list.querySelectorAll('.iq-energy__row--cut').forEach((x) => x.classList.remove('iq-energy__row--cut'));
      root.classList.remove('iq-energy--terse');
      for (const x of CUT) {
        if (list.scrollHeight <= list.clientHeight + 1) break;
        if (x === 'words') root.classList.add('iq-energy--terse'); else x.classList.add('iq-energy__row--cut');
      }
    }
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => arrange(w, h), onChange: () => render() });
    render();
    root.energy = {
      getState: () => Object.fromEntries(['home', ...present].map((k) => { const v = nodeView(k); return [k, { text: v.text, dir: v.dir, words: v.words, na: !!v.na, level: v.level ?? null }]; })),
      /** External update (Home Assistant: Home, the mapped entities, Information lines). Never sends anything. */
      setState(patch = {}) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /* ================================================================================================================================
     DYNAMIC NODE FLOW (presets 'circles' — Tesla-style circular nodes — and 'nodes' — node cards). The diagram is built from the nodes
     the user ADDED (config.nodes) — or, for a configuration from before nodes existed, from its mapped roles / demo values (nodesOf):
     nothing that is not configured is drawn (no battery or EV placeholder). Home is the hub; every other node joins Home or another
     node with the shared FLOW CONNECTOR (components/flow: IniqFlow) — its direction is the user's own "a positive value flows towards
     … / away from …", never a name; 0 → still; unavailable → dashed. Layout: automatic (rings round Home, no overlap, from the widget's
     OWN box — MaisonFit); a box too small for a readable diagram → a summary list.
     ================================================================================================================================ */
  const NODE_TYPES = {
    solar: { label: 'Solar', icon: 'mdi:solar-power-variant', tone: 'solar', positive: 'toward', words: { toward: 'Generating', away: 'Consuming' }, slot: -135, cardSlot: -90 },
    grid: { label: 'Grid', icon: 'mdi:transmission-tower', tone: 'info', positive: 'toward', words: { toward: 'Import', away: 'Export' }, slot: -45, cardSlot: 180 },
    battery: { label: 'Battery', icon: 'mdi:battery-high', tone: 'success', positive: 'away', words: { toward: 'Discharging', away: 'Charging' }, slot: 135, cardSlot: 90, level: true },
    ev: { label: 'EV', icon: 'mdi:car-electric', tone: 'purple', positive: 'away', words: { toward: 'Discharging', away: 'Charging' }, slot: 45, cardSlot: 0, level: true },
    inverter: { label: 'Inverter', icon: 'mdi:current-ac', tone: 'text-secondary', positive: 'toward', words: { toward: 'Supplying', away: 'Drawing' } },
    circuit: { label: 'Circuit', icon: 'mdi:flash', tone: 'warning', positive: 'away', words: { toward: 'Feeding back', away: 'Using' } },
    appliance: { label: 'Appliance', icon: 'mdi:washing-machine', tone: 'cool', positive: 'away', words: { toward: 'Feeding back', away: 'Using' } },
    heatpump: { label: 'Heat pump', icon: 'mdi:heat-pump', tone: 'danger', positive: 'away', words: { toward: 'Feeding back', away: 'Using' } },
    gas: { label: 'Gas', icon: 'mdi:fire', tone: 'warning', positive: 'toward', words: { toward: 'Using', away: 'Returning' } },
    water: { label: 'Water', icon: 'mdi:water', tone: 'info', positive: 'toward', words: { toward: 'Using', away: 'Returning' } },
    co2: { label: 'CO₂', icon: 'mdi:molecule', tone: 'neutral', positive: 'toward', words: { toward: '', away: '' }, still: true },
    custom: { label: 'Measurement', icon: 'mdi:gauge', tone: 'accent', positive: 'toward', words: { toward: 'In', away: 'Out' } },
  };
  /* Tesla Style: its own palette (a user's colour per node still wins) and its places on the grid [col, row]
     (Home is [2, 1]; column 3 is right of Home) */
  const TESLA_TONE = { home: '#b0bec5', solar: '#ff9800', grid: '#488fc2', battery: '#f06292', ev: '#ab47bc', inverter: '#9e9e9e', circuit: '#ffc107', appliance: '#7e57c2',
    heatpump: '#ef5350', gas: '#b71c3c', water: '#26c6da', co2: '#0f9d58', custom: '#8d9bb0' };
  const TESLA_SLOT = { solar: [[1, 0], [0, 0], [3, 0]], grid: [[0, 1], [0, 0], [0, 2]], battery: [[1, 2], [0, 2], [3, 2]], co2: [[0, 0], [0, 2]], inverter: [[1, 0], [0, 0], [1, 2]],
    gas: [[2, 0], [3, 0]], water: [[2, 2], [3, 2]], ev: [[3, 1], [3, 2], [3, 0]], heatpump: [[3, 0], [3, 1], [3, 2]], appliance: [[3, 2], [3, 1], [3, 0]], circuit: [[3, 1], [3, 0], [3, 2]],
    custom: [[0, 0], [0, 2], [3, 0]] };
  const TESLA_ANY = [[1, 0], [0, 1], [1, 2], [2, 0], [2, 2], [0, 0], [0, 2], [3, 1], [3, 0], [3, 2], [1, 1]];
  const NODE_ID = /^[a-z][a-z0-9_-]{0,23}$/, ENT = /^(sensor|input_number|number)\.[a-z0-9_]+$/, MDI = /^mdi:[a-z0-9-]{1,64}$/;
  const COLOR = /^(#[0-9a-fA-F]{6}|[a-z][a-z0-9-]{1,30})$/;
  const MAX_NODES = 12;
  /** one node, sanitised (unknown keys dropped; nothing invented) */
  function cleanNode(x, i) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const type = NODE_TYPES[x.type] ? x.type : 'custom';
    const n = { id: typeof x.id === 'string' && NODE_ID.test(x.id) ? x.id : `n${i + 1}`, type };
    if (typeof x.label === 'string' && x.label.trim()) n.label = x.label.trim().slice(0, 24);
    if (typeof x.icon === 'string' && MDI.test(x.icon)) n.icon = x.icon;
    ['entity', 'exportEntity', 'level', 'secondary'].forEach((k) => { if (typeof x[k] === 'string' && ENT.test(x[k])) n[k] = x[k]; });
    if (x.positive === 'toward' || x.positive === 'away') n.positive = x.positive;
    if (typeof x.color === 'string' && COLOR.test(x.color)) n.color = x.color;
    if (['s', 'l'].includes(x.size)) n.size = x.size;
    if (x.hidden === true) n.hidden = true;
    if (typeof x.link === 'string' && NODE_ID.test(x.link)) n.link = x.link;
    if (typeof x.unit === 'string' && x.unit.trim()) n.unit = x.unit.trim().slice(0, 8);
    ['demo', 'demoLevel'].forEach((k) => { if (typeof x[k] === 'number' && Number.isFinite(x[k])) n[k] = x[k]; });
    return n;
  }
  /** the nodes of a configuration: its own list, or (a configuration from before nodes) its mapped roles / demo values — never more */
  function nodesOf(c) {
    c = c || {};
    if (Array.isArray(c.nodes)) {
      const seen = new Set();
      return c.nodes.slice(0, MAX_NODES).map(cleanNode).filter((n) => n && n.id !== 'home' && !seen.has(n.id) && seen.add(n.id));
    }
    const m = c.mappings || {}, sg = c.signs || {}, out = [];
    const linkedC = typeof c.entity === 'string' && c.entity;
    if (linkedC) {
      if (m.solar || m.solarToday) out.push({ id: 'solar', type: 'solar', entity: m.solar, secondary: m.solarToday, positive: sg.solar === 'negative' ? 'away' : 'toward' });
      if (c.gridMode === 'separate' ? (m.gridImport || m.gridExport) : m.grid) out.push(c.gridMode === 'separate' ? { id: 'grid', type: 'grid', entity: m.gridImport, exportEntity: m.gridExport, positive: 'toward' }
        : { id: 'grid', type: 'grid', entity: m.grid, positive: sg.grid === 'export' ? 'away' : 'toward' });
      if (m.battery || m.batteryLevel) out.push({ id: 'battery', type: 'battery', entity: m.battery, level: m.batteryLevel, positive: sg.battery === 'discharge' ? 'toward' : 'away' });
      if (m.ev || m.evLevel) out.push({ id: 'ev', type: 'ev', entity: m.ev, level: m.evLevel, secondary: m.evToday, positive: sg.ev === 'negative' ? 'toward' : 'away' });
    } else {
      const f = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      if (f(c.demoSolar) !== undefined) out.push({ id: 'solar', type: 'solar', demo: c.demoSolar, positive: 'toward' });
      if (f(c.demoGrid) !== undefined) out.push({ id: 'grid', type: 'grid', demo: c.demoGrid, positive: 'toward' });
      if (f(c.demoBattery) !== undefined || f(c.demoLevel) !== undefined) out.push({ id: 'battery', type: 'battery', demo: c.demoBattery, demoLevel: c.demoLevel, positive: 'away' });
      if (f(c.demoEv) !== undefined || f(c.demoEvLevel) !== undefined) out.push({ id: 'ev', type: 'ev', demo: c.demoEv, demoLevel: c.demoEvLevel, positive: 'away' });
    }
    return out.map(cleanNode).filter(Boolean);
  }
  /** every entity the nodes read (the binding subscribes to exactly these) */
  const nodeEntities = (c) => [...new Set(nodesOf(c).filter((n) => !n.hidden).flatMap((n) => [n.entity, n.exportEntity, n.level, n.secondary]).filter(Boolean))];

  const tok = (v, fb) => (typeof v !== 'string' ? fb : /^#/.test(v) ? v : `var(--${v})`);
  const LINE_SHAPES = ['curve', 'straight', 'elbow', 'arc'], FLOW_STYLES = ['dots', 'arrows', 'dashes', 'pulse', 'none'];

  function createNodes(config) {
    let s = { ...(config || {}) };
    const F = global.IniqFlow, V = global.IniqVisuals, I = global.IniqIcons;
    // HOUSE: node cards in two columns either side of a PICTURE of the house (the Home hub), connected to it
    const house = s.variant === 'house';
    const preset = s.variant === 'nodes' || house ? 'nodes' : s.variant === 'tesla' ? 'tesla' : 'circles';
    const linked = () => !!s.ha;
    const root = document.createElement('article');
    root.className = 'iq-energy iq-energy--dyn';
    root.dataset.variant = preset;
    if (house) root.dataset.house = 'true';
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqEnergyId = s.id;
    root.innerHTML = `
      <div class="iq-energy__in">
        <header class="iq-energy__head"><h3 class="iq-energy__name"></h3><p class="iq-energy__sub"></p></header>
        <div class="iq-energy__stage"><svg class="iq-energy__lines" aria-hidden="true"></svg></div>
        <ul class="iq-energy__list"></ul>
        <p class="iq-energy__info"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const stage = $('.iq-energy__stage'), svg = $('.iq-energy__lines'), list = $('.iq-energy__list');
    let nodes = [], el = {}, con = {}, geo = null, arr = '';

    const typeOf = (n) => NODE_TYPES[n.type] || NODE_TYPES.custom;
    const labelOf = (n) => n.label || typeOf(n).label;
    const iconOf = (n) => n.icon || typeOf(n).icon;
    const toneOf = (n) => tok(n.color, preset === 'tesla' ? TESLA_TONE[n.type] || TESLA_TONE.custom : `var(--${typeOf(n).tone})`);
    const toneName = (n) => n.color || (preset === 'tesla' ? TESLA_TONE[n.type] || TESLA_TONE.custom : typeOf(n).tone);
    const icon = (span, name) => { span.replaceChildren(); if (I && name) I.present(span, { icon: name }); };

    /* ---- values: HA's (linked: s.nodeVals[entity]) or the node's demo value — one shape */
    function val(n, key) {
      if (linked()) {
        const id = n[key]; if (!id) return null;
        const x = (s.nodeVals || {})[id];
        if (!x || x.state === 'loading') return { kind: 'loading' };
        if (x.state === 'missing') return { kind: 'missing', entity: id };
        if (!x.available) return { kind: x.text === 'unknown' ? 'unknown' : 'unavailable', entity: id };
        if (x.value === null) return { kind: 'unknown', entity: id };
        return { kind: 'ok', value: x.value, unit: x.unit || n.unit || '', entity: id };
      }
      const dk = { entity: 'demo', level: 'demoLevel' }[key];
      const v = dk ? fin(n[dk]) : null;
      return v === null ? null : { kind: 'ok', value: v, unit: key === 'level' ? '%' : (n.unit || (['gas', 'water'].includes(n.type) ? 'm³/h' : n.type === 'co2' ? 'ppm' : 'W')) };
    }
    const word = (x) => ({ loading: '…', missing: 'Not found', unknown: 'Unknown', unavailable: 'Unavailable' })[x.kind] || '';
    /** a node's view: text, the flow along its connection (towards its target = 'forward'), words, level */
    function view(n) {
      const T = typeOf(n), pos = n.positive || T.positive;
      const sem = { positive: pos === 'toward' ? 'forward' : 'reverse', zero: 'still', unavailable: 'dashed' };
      const lvl = T.level || n.level || fin(n.demoLevel) !== null ? val(n, 'level') : null;
      const level = lvl && lvl.kind === 'ok' ? Math.max(0, Math.min(100, lvl.value)) : null;
      const sec = n.secondary ? val(n, 'secondary') : null;
      const secText = sec ? (sec.kind === 'ok' ? `${fmt(Math.abs(sec.value), sec.unit)}` : word(sec)) : '';
      let x = val(n, 'entity');
      // grid with separate import / export entities: import → towards Home, export → away; both shown, never netted
      if (n.exportEntity && linked()) {
        const e = val(n, 'exportEntity'), iv = x && x.kind === 'ok' ? x.value : null, ev = e && e.kind === 'ok' ? e.value : null;
        if (iv === null && ev === null) { const bad = x || e; return { n, na: true, text: bad ? word(bad) : '—', reading: F.read(null, sem), words: '', level, secText }; }
        const imp = iv !== null && iv > 0, exp = ev !== null && ev > 0;
        const r = imp ? F.read(iv, { ...sem, positive: 'forward' }) : exp ? F.read(ev, { ...sem, positive: 'reverse' }) : F.read(0, sem);
        return { n, text: fmt(imp ? iv : exp ? ev : 0, (imp ? x : exp ? e : x || e).unit), reading: speedOf(r, imp ? iv : ev, (imp ? x : e || x).unit), words: imp && exp ? `Import · ${fmt(ev, e.unit)} export` : imp ? 'Import' : exp ? 'Export' : 'Idle', level, secText };
      }
      if (!x) return { n, text: level !== null ? fmt(level, '%') : '—', reading: F.read(0, sem), words: '', level, secText, levelOnly: true };
      if (x.kind !== 'ok') return { n, na: true, text: word(x), reading: F.read(null, sem), words: '', level, secText };
      const r = T.still ? F.read(0, sem) : F.read(x.value, sem);
      const towardTarget = r.state === 'flow' && r.direction === 'forward';
      const words = r.state === 'flow' ? (T.words[towardTarget ? 'toward' : 'away'] || '') : T.still ? '' : 'Idle';
      return { n, text: fmt(Math.abs(x.value), x.unit), reading: speedOf(r, Math.abs(x.value), x.unit), words, level, secText };
    }
    /** power drives the pace (W / kW / MW only); any other unit → a steady pace */
    function speedOf(r, abs, unit) {
      const w = watts(abs, unit);
      if (r.state !== 'flow' || w === null) return r;
      return { ...r, speed: 22 + Math.max(0, Math.min(1, (w - 50) / 5950)) * 88 };
    }
    function homeView() {
      if (!linked()) { const v = fin(s.demoHome); return v === null ? { text: '—', na: false } : { text: fmt(Math.abs(v), 'W') }; }
      const x = s.ha;
      if (!x || x.state !== 'ready' || !x.available || x.value === null) return { text: x && !x.available ? (x.text === 'unknown' ? 'Unknown' : 'Unavailable') : '…', na: true };
      return { text: fmt(Math.abs(x.value), x.unit), entity: x.entity };
    }

    /* ---- the elements: one button per node (opens Entity Details when linked), one connector per node, one row per node */
    function build() {
      Object.values(con).forEach((c) => c.destroy());
      stage.querySelectorAll('.iq-energy__n').forEach((x) => x.remove());
      list.replaceChildren();
      el = {}; con = {};
      nodes = nodesOf(s).filter((n) => !n.hidden);
      const ids = new Set(nodes.map((n) => n.id));
      nodes.forEach((n) => { if (n.link && n.link !== 'home' && (!ids.has(n.link) || n.link === n.id)) delete n.link; });
      // a link to a node that itself links elsewhere than Home is taken to Home (two tiers at most — a readable diagram)
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      nodes.forEach((n) => { if (n.link && n.link !== 'home' && byId[n.link].link && byId[n.link].link !== 'home') delete n.link; });
      [{ id: 'home', type: 'home' }, ...nodes].forEach((n) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `iq-energy__n iq-energy__n--${n.id === 'home' ? 'home' : 'node'}`; b.dataset.node = n.id; b.dataset.type = n.type; b.dataset.iqControl = '';
        b.innerHTML = '<span class="iq-energy__nd"><span class="iq-energy__nr"></span><span class="iq-energy__ni"></span><b class="iq-energy__nv"></b><span class="iq-energy__nx"></span></span><span class="iq-energy__nt"><span class="iq-energy__nl"></span><span class="iq-energy__nw"></span><span class="iq-energy__ns"></span></span>';
        b.style.setProperty('--iq-energy-tone', n.id === 'home' ? (preset === 'tesla' ? TESLA_TONE.home : 'var(--iq-energy-home)') : toneOf(n));
        icon(b.querySelector('.iq-energy__ni'), n.id === 'home' ? (preset === 'tesla' ? 'mdi:home' : 'mdi:home-lightning-bolt') : iconOf(n));
        b.querySelector('.iq-energy__nl').textContent = n.id === 'home' ? (s.homeLabel || 'Home') : labelOf(n);
        b.addEventListener('click', (e) => { e.stopPropagation(); details(n); });
        stage.append(b);
        const ring = n.id !== 'home' && V && preset !== 'tesla' && (typeOf(n).level || n.level || fin(n.demoLevel) !== null) ? V.ring({ label: `${labelOf(n)} level`, thickness: 0.07, gap: 0, tone: 'success' }) : null;
        if (ring) b.querySelector('.iq-energy__nr').append(ring.el);
        const r = document.createElement('li');
        r.className = 'iq-energy__row'; r.dataset.node = n.id;
        r.style.setProperty('--iq-energy-tone', n.id === 'home' ? 'var(--iq-energy-home)' : toneOf(n));
        r.innerHTML = '<span class="iq-energy__ri"></span><span class="iq-energy__rl"></span><b class="iq-energy__rv"></b><span class="iq-energy__rd"></span>';
        icon(r.querySelector('.iq-energy__ri'), n.id === 'home' ? 'mdi:home-lightning-bolt' : iconOf(n));
        r.querySelector('.iq-energy__rl').textContent = n.id === 'home' ? (s.homeLabel || 'Home') : labelOf(n);
        list.append(r);
        el[n.id] = { b, r, ring, n };
        if (n.id !== 'home' && F) {
          const tn = toneName(n);
          // Tesla Style: thin, fully coloured lines with a few sparse moving dots (the reference); the other presets as they were
          const c = preset === 'tesla'
            ? F.connector({ from: [0, 0], to: [1, 1], color: tn, width: 1.6, opacity: 0.95, geometry: lineShape(), radius: 22, glow: s.glow === true ? 0.5 : 0,
              animation: { type: flowStyle(), size: 6, spacing: 70, speed: 34, color: tn, glow: s.glow === true ? 0.6 : 0 } })
            : F.connector({ from: [0, 0], to: [1, 1], color: tn, width: 2.4, opacity: 0.55, geometry: lineShape(), glow: s.glow === true ? 0.5 : 0,
              animation: { type: flowStyle(), size: 4.2, spacing: 16, speed: 40, color: tn, glow: s.glow === true ? 0.6 : 0 } });
          svg.append(c.el);
          con[n.id] = c;
        }
      });
    }
    const lineShape = () => (LINE_SHAPES.includes(s.lineShape) ? s.lineShape : preset === 'tesla' || house ? 'elbow' : 'curve');
    const flowStyle = () => (FLOW_STYLES.includes(s.flowStyle) ? s.flowStyle : 'dots');

    function details(n) {
      if (!linked()) return;
      const entity = n.id === 'home' ? s.ha && s.ha.entity : n.entity || n.level || n.exportEntity;
      if (!entity) return;
      root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity, info: [], label: n.id === 'home' ? 'Home' : labelOf(n) }, meta: { source: 'more' }, widget: 'details' } }));
    }

    /* ---- automatic layout: Home in the middle; tier-1 nodes on a ring (an ellipse — wide boxes use their width), tier-2 nodes further
       out beside their parent. Slots: the type's own place first (circles: the diagonals, so connections curve in; cards: the cross),
       the rest evenly. The biggest node size that keeps every node and its caption inside the box WITHOUT TOUCHING wins; none → list. */
    /* TESLA STYLE layout: a structured grid — Home at the right of the middle row, the grid at its left, solar above
       between them, the battery below, gas / water straight above / below Home, consumers (EV, heat pump, appliances, circuits) in a column
       right of Home. Each type takes its own place first, the next free one otherwise; empty rows / columns are dropped, so three nodes
       make a small balanced diagram and seven a full one. Labels sit above the top row and below the others; too small → the list. */
    function planTesla(w, h) {
      const top = s.subtitle ? 46 : 38, pad = 8, info = s.infoItems && s.infoItems.some((x) => x && x.line) ? 20 : 0;
      const taken = new Map([['2,1', 'home']]), at = {};
      const free = (c) => !taken.has(`${c[0]},${c[1]}`);
      for (const n of nodes) {
        const want = [...(TESLA_SLOT[n.type] || TESLA_SLOT.custom), ...TESLA_ANY].find(free);
        if (!want) return null;                                         // more nodes than places: the list
        taken.set(`${want[0]},${want[1]}`, n.id); at[n.id] = want;
      }
      const cols = [...new Set([2, ...Object.values(at).map((c) => c[0])])].sort((a, b) => a - b);
      const rows = [...new Set([1, ...Object.values(at).map((c) => c[1])])].sort((a, b) => a - b);
      const cap = 20, CW = (w - 2 * pad) / cols.length, CH = (h - top - pad - info) / rows.length;
      const r = Math.min(62, CW * 0.36, (CH - cap - 8) / 2);
      const mid = CH / 2 - r >= cap + 2;                                 // every circle on its row's middle line (rows line up), captions in the margin
      if (r < 21) return null;
      const hr = Math.min(r * 1.14, CW / 2 - 3, CH / 2 - 3);
      const labelAbove = (row) => rows.length > 1 && row === rows[0];
      const box = (c, rr, id) => {
        const ci = cols.indexOf(c[0]), ri = rows.indexOf(c[1]), above = id !== 'home' && labelAbove(c[1]);
        const cx = pad + (ci + 0.5) * CW, cy = top + ri * CH + (mid || (id === 'home' && rows.length === 1) ? CH / 2 : above ? cap + (CH - cap) / 2 : (CH - cap) / 2);   // Home on its row's line too
        const lw = Math.min(CW - 6, Math.max(2 * rr, 110));
        return { cx, cy, r: rr, dx: cx - rr, dy: cy - rr, dw: 2 * rr, dh: 2 * rr, x: cx - lw / 2, y: above ? cy - rr - cap : cy - rr, w: lw, h: 2 * rr + (id === 'home' ? 0 : cap), cap: id === 'home' ? 'none' : above ? 'above' : 'below', col: c[0], row: c[1] };
      };
      const out = { home: box([2, 1], hr, 'home'), at: {}, r };
      nodes.forEach((n) => { out.at[n.id] = box(at[n.id], n.size === 's' ? r * 0.82 : n.size === 'l' ? Math.min(r * 1.15, CW / 2 - 3) : r, n.id); });
      return out;
    }
    /* Tesla Style connections: straight within a row / column; otherwise leave the node vertically and turn (rounded) into the target's
       side — as the reference. Several connections meeting one side of a node arrive side by side, never on top of each other. */
    function routeTesla(g) {
      const discs = [g.home, ...Object.values(g.at)];
      /** how many other discs an axis-aligned leg (a → b) passes through */
      const hits = (a, b, skip) => discs.filter((d) => !skip.includes(d) && (a[0] === b[0]
        ? Math.abs(d.cx - a[0]) < d.r + 3 && Math.min(a[1], b[1]) < d.cy + d.r && Math.max(a[1], b[1]) > d.cy - d.r
        : Math.abs(d.cy - a[1]) < d.r + 3 && Math.min(a[0], b[0]) < d.cx + d.r && Math.max(a[0], b[0]) > d.cx - d.r)).length;
      const gridNode = nodes.find((m) => m.type === 'grid' && g.at[m.id]);
      const plans = nodes.filter((n) => g.at[n.id] && con[n.id]).map((n) => {
        // a measurement that never flows (CO₂) joins the grid here — nothing moves on it either way
        const visual = typeOf(n).still && !n.link && gridNode ? gridNode.id : null;
        const x = g.at[n.id], tid = visual || (n.link && n.link !== 'home' ? n.link : 'home'), t = tid === 'home' ? g.home : g.at[tid];
        const dx = t.cx - x.cx, dy = t.cy - x.cy;
        let from, to;
        if (Math.abs(dy) < 4) { from = dx > 0 ? 'right' : 'left'; to = dx > 0 ? 'left' : 'right'; }
        else if (Math.abs(dx) < 4) { from = dy > 0 ? 'bottom' : 'top'; to = dy > 0 ? 'top' : 'bottom'; }
        else {
          // two rounded right-angle routes: down / up first, or across first — the one that passes through no other node
          const skip = [x, t];
          const vFirst = hits([x.cx, x.cy], [x.cx, t.cy], skip) + hits([x.cx, t.cy], [t.cx, t.cy], skip);
          const hFirst = hits([x.cx, x.cy], [t.cx, x.cy], skip) + hits([t.cx, x.cy], [t.cx, t.cy], skip);
          if (hFirst < vFirst) { from = dx > 0 ? 'right' : 'left'; to = dy > 0 ? 'top' : 'bottom'; }
          else { from = dy > 0 ? 'bottom' : 'top'; to = dx > 0 ? 'left' : 'right'; }
        }
        return { n, x, t, tid, from, to };
      });
      const groups = {};
      plans.forEach((p) => { (groups[`${p.tid}|${p.to}`] = groups[`${p.tid}|${p.to}`] || []).push(p); });
      Object.values(groups).forEach((list) => {
        const vertSide = list[0].to === 'left' || list[0].to === 'right';
        list.sort((a, b) => (vertSide ? a.x.cy - b.x.cy : a.x.cx - b.x.cx));
        const gap = Math.min(12, list[0].t.r * 0.32);
        list.forEach((p, i) => { p.shift = (i - (list.length - 1) / 2) * gap; });
      });
      plans.forEach((p) => {
        const straight = (p.from === 'left' || p.from === 'right') === (p.to === 'left' || p.to === 'right');
        const node = (b, side, shift) => ({ x: b.dx, y: b.dy, w: b.dw, h: b.dh, shape: 'circle', side, gap: 2, shift });
        con[p.n.id].update({ from: node(p.x, p.from, straight ? p.shift : 0), to: node(p.t, p.to, p.shift), geometry: lineShape() });
      });
    }
    /* HOUSE layout: the picture in the middle (as large as the box allows, at most 1.6 : 1), the node cards stacked in two columns either
       side — supply (solar, grid, battery, CO₂) on the left, utilities and consumers (gas, water, EV…) on the right, balanced */
    const HOUSE_LEFT = ['solar', 'grid', 'battery', 'co2', 'wind', 'generator'];
    /* a NARROW house card (a phone, a narrow column): the picture across the top, the node cards two by two underneath, each line
       running up into the house — the same design, stacked (never a bare list while a house fits) */
    function planHouseNarrow(w, h) {
      const top = s.subtitle ? 46 : 36, pad = 8, info = s.infoItems && s.infoItems.some((x) => x && x.line) ? 20 : 0, H = h - top - pad - info;
      const n = nodes.length, cols = n > 1 ? 2 : 1, rows = Math.max(1, Math.ceil(n / cols)), gx = 10, gy = 10, lineGap = 44;
      const cw = (w - 2 * pad - (cols - 1) * gx) / cols, ch = Math.min(78, Math.max(58, (H * 0.45 - (rows - 1) * gy) / rows));
      const iw = w - 2 * pad, ih = Math.min(iw / 1.55, H - lineGap - rows * ch - (rows - 1) * gy);
      if (iw < 140 || ih < 90 || cw < 120) return null;
      const cx = w / 2, home = { cx, cy: top + ih / 2, r: Math.min(iw, ih) / 2, dx: pad, dy: top, dw: iw, dh: ih, x: pad, y: top, w: iw, h: ih };
      const out = { home, at: {}, r: ch / 2, narrow: true };
      const y0 = top + ih + lineGap;
      nodes.forEach((m, i) => { const x = pad + (i % cols) * (cw + gx), y = y0 + Math.floor(i / cols) * (ch + gy);
        out.at[m.id] = { cx: x + cw / 2, cy: y + ch / 2, r: ch / 2, dx: x, dy: y, dw: cw, dh: ch, x, y, w: cw, h: ch, side: 'below' }; });
      return out;
    }
    function planHouse(w, h) {
      const top = s.subtitle ? 46 : 36, pad = 8, info = s.infoItems && s.infoItems.some((x) => x && x.line) ? 20 : 0, H = h - top - pad - info;
      const cw = Math.min(260, Math.max(140, w * 0.2)), gapX = Math.max(40, w * 0.05);
      const iw = Math.min(w - 2 * (cw + gapX) - 2 * pad, H * 1.6), ih = Math.min(H, iw / 1.45);
      if (iw < 140 || ih < 100) return planHouseNarrow(w, h);
      const L = nodes.filter((n) => HOUSE_LEFT.includes(n.type)), R = nodes.filter((n) => !HOUSE_LEFT.includes(n.type));
      while (L.length > R.length + 1) R.unshift(L.pop());
      while (R.length > L.length + 1) L.push(R.shift());
      const rows = Math.max(L.length, R.length, 1), gy = 30, ch = Math.min(104, (H - (rows - 1) * gy) / rows);
      if (ch < 52) return null;
      const cx = w / 2, cy = top + H / 2;
      const home = { cx, cy, r: Math.min(iw, ih) / 2, dx: cx - iw / 2, dy: cy - ih / 2, dw: iw, dh: ih, x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih };
      const out = { home, at: {}, r: ch / 2 };
      const col = (list, x) => { const tot = list.length * ch + (list.length - 1) * gy, y0 = top + (H - tot) / 2;
        list.forEach((n, i) => { const y = y0 + i * (ch + gy); out.at[n.id] = { cx: x + cw / 2, cy: y + ch / 2, r: ch / 2, dx: x, dy: y, dw: cw, dh: ch, x, y, w: cw, h: ch, side: x < cx ? 'left' : 'right' }; }); };
      col(L, pad); col(R, w - pad - cw);
      return out;
    }
    function plan(w, h) {
      if (house) return planHouse(w, h);
      if (preset === 'tesla') return planTesla(w, h);
      const top = s.subtitle ? 46 : 36, pad = 8, info = s.infoItems && s.infoItems.some((x) => x && x.line) ? 20 : 0;
      const t1 = nodes.filter((n) => !n.link || n.link === 'home'), t2 = nodes.filter((n) => n.link && n.link !== 'home');
      const N = t1.length;
      // slots
      const slotOf = {}, used = [];
      const step = N ? 360 / Math.max(N, preset === 'circles' ? 4 : 4) : 0;
      const free = []; for (let i = 0; i < Math.max(N, 4); i++) free.push(-90 + i * step + (preset === 'circles' && N <= 4 ? -45 : 0));
      const norm = (a) => ((a % 360) + 540) % 360 - 180;
      const dist = (a, b) => Math.abs(norm(a - b));
      t1.filter((n) => typeOf(n)[preset === 'circles' ? 'slot' : 'cardSlot'] !== undefined).forEach((n) => {
        const want = typeOf(n)[preset === 'circles' ? 'slot' : 'cardSlot'];
        const best = free.filter((a) => !used.includes(a)).sort((a, b) => dist(a, want) - dist(b, want))[0];
        if (best !== undefined) { slotOf[n.id] = best; used.push(best); }
      });
      if (N > 4) { free.length = 0; for (let i = 0; i < N; i++) free.push(-90 + i * (360 / N)); used.length = 0; Object.keys(slotOf).forEach((k) => delete slotOf[k]);
        t1.filter((n) => typeOf(n).cardSlot !== undefined).forEach((n) => { const want = typeOf(n)[preset === 'circles' ? 'slot' : 'cardSlot']; const best = free.filter((a) => !used.includes(a)).sort((a, b) => dist(a, want) - dist(b, want))[0]; slotOf[n.id] = best; used.push(best); }); }
      t1.forEach((n) => { if (slotOf[n.id] === undefined) { const a = free.find((x) => !used.includes(x)); slotOf[n.id] = a === undefined ? 0 : a; used.push(a); } });
      if (N >= 2) {
        const side = (a) => Math.sign(Math.round(Math.cos((a * Math.PI) / 180) * 1000));
        const ss = t1.map((n) => side(slotOf[n.id]));
        if (ss.every((x) => x === ss[0]) && ss[0] !== 0) t1.forEach((n, i) => { if (i % 2 === 1) slotOf[n.id] = 180 - slotOf[n.id]; });
      }
      const kids = {}; t2.forEach((n) => { (kids[n.link] = kids[n.link] || []).push(n); });
      const deep = t2.length > 0;
      const sizeK = (n) => (n.size === 's' ? 0.8 : n.size === 'l' ? 1.2 : 1);
      const caption = preset === 'circles' ? 30 : 0;
      for (let r = Math.min(56, Math.max(20, Math.min(w, h - top) * 0.15)); r >= 17; r -= 1.5) {
        const box = (n, cx, cy, k) => {                                        // a node's footprint (disc / card + caption)
          if (preset === 'circles') { const rr = r * k, cw = Math.max(2 * rr, Math.min(120, 2.9 * r)); return { cx, cy, r: rr, x: cx - cw / 2, y: cy - rr, w: cw, h: 2 * rr + caption, dx: cx - rr, dy: cy - rr, dw: 2 * rr, dh: 2 * rr }; }
          const cw = Math.min(170, 3.5 * r * k), ch = 1.45 * r * k; return { cx, cy, r: ch / 2, x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, dx: cx - cw / 2, dy: cy - ch / 2, dw: cw, dh: ch };
        };
        const hr = preset === 'circles' ? r * 1.3 : r * 1.15;
        const cx = w / 2, cy = top + (h - top - pad - info) / 2 - (preset === 'circles' ? caption / 2 - 6 : 0);
        const home = preset === 'circles' ? box({}, cx, cy, 1.3) : box({}, cx, cy, 1.15);
        const rimX = w / 2 - pad, rimY = (h - top - pad - info) / 2;
        const out = { home, at: {}, r };
        const ex = (k) => Math.max(0, rimX - (preset === 'circles' ? Math.max(r * k, 1.45 * r) : 1.75 * r * k));
        const ey = (k) => Math.max(0, rimY - (preset === 'circles' ? r * k + caption / 2 : 0.75 * r * k));
        const scale1 = deep ? 0.52 : 1;
        t1.forEach((n) => {
          const a = (slotOf[n.id] * Math.PI) / 180, k = sizeK(n);
          out.at[n.id] = box(n, cx + Math.cos(a) * ex(k) * scale1, cy + Math.sin(a) * ey(k) * scale1, k);
          (kids[n.id] || []).forEach((m, i, all) => {
            const spread = (i - (all.length - 1) / 2) * 0.55, b2 = a + spread, k2 = sizeK(m);
            out.at[m.id] = box(m, cx + Math.cos(b2) * ex(k2), cy + Math.sin(b2) * ey(k2), k2);
          });
        });
        // fits: inside the box, below the header, nothing touching
        const all = [home, ...Object.values(out.at)];
        const inside = all.every((b) => b.x >= 2 && b.x + b.w <= w - 2 && b.y >= top - 2 && b.y + b.h <= h - pad - info + 2);
        let clear = inside;
        for (let i = 0; clear && i < all.length; i++) for (let j = i + 1; clear && j < all.length; j++) {
          const A = all[i], B = all[j];
          if (A.x < B.x + B.w + 4 && B.x < A.x + A.w + 4 && A.y < B.y + B.h + 4 && B.y < A.y + A.h + 4) clear = false;
        }
        if (clear && (!N || ex(1) * scale1 > hr * 0.6 || ey(1) * scale1 > hr * 0.6)) return out;
      }
      return null;
    }
    function layout(w, h) {
      const g = plan(w, h);
      if (!g) return false;
      geo = g;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const place = (b, x) => { b.style.left = `${Math.round(x.dx)}px`; b.style.top = `${Math.round(x.dy)}px`; b.style.width = `${Math.round(x.dw)}px`; b.style.height = `${Math.round(x.dh)}px`; b.style.setProperty('--iq-energy-d', `${Math.round(Math.min(x.dw, x.dh))}px`); };
      place(el.home.b, g.home);
      root.style.setProperty('--iq-energy-r', `${g.r.toFixed(1)}px`);
      if (preset === 'tesla') {
        nodes.forEach((n) => { const x = g.at[n.id]; if (x) { place(el[n.id].b, x); el[n.id].b.dataset.cap = x.cap; el[n.id].b.dataset.small = String(x.dw < 80); } });
        routeTesla(g);
        return true;
      }
      if (house) {
        root.dataset.houseNarrow = g.narrow ? 'true' : 'false';
        el.home.b.style.backgroundImage = s.houseImage && /^(?!.*\.\.)((assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32})$/.test(s.houseImage) ? `url("${s.houseImage}")` : '';
        nodes.forEach((n) => {
          const x = g.at[n.id]; if (!x) return;
          place(el[n.id].b, x);
          const left = x.side === 'left', below = x.side === 'below', rect = (b, side) => ({ x: b.dx, y: b.dy, w: b.dw, h: b.dh, shape: 'rect', side, gap: 4 });
          if (con[n.id]) con[n.id].update({ from: rect(x, below ? 'top' : left ? 'right' : 'left'), to: rect(g.home, below ? 'bottom' : left ? 'left' : 'right'), geometry: lineShape() });
        });
        return true;
      }
      nodes.forEach((n) => {
        const x = g.at[n.id]; if (!x) return;
        place(el[n.id].b, x);
        const t = n.link && n.link !== 'home' ? g.at[n.link] : g.home;
        const shape = preset === 'circles' ? 'circle' : 'rect';
        const node = (b) => ({ x: b.dx, y: b.dy, w: b.dw, h: b.dh, shape, gap: 3 });
        let fromSide = 'auto', toSide = 'auto';
        const below = (b) => preset === 'circles' && t.cy > x.cy + 4 && Math.abs(t.cx - x.cx) <= 4 && b === x;
        if (preset === 'circles' && lineShape() === 'curve') {
          // Tesla-style: leave the node sideways, enter the target from above / below — a smooth quarter curve (straight when aligned).
          // When a node already sits straight above (below) the target, curves on that side come in sideways instead (its caption stays clear).
          const dx = t.cx - x.cx, dy = t.cy - x.cy;
          const occupied = (up) => nodes.some((m) => m !== n && (m.link || 'home') === (n.link || 'home') && g.at[m.id] && Math.abs(g.at[m.id].cx - t.cx) <= 4 && (up ? g.at[m.id].cy < t.cy : g.at[m.id].cy > t.cy));
          if (Math.abs(dx) > 4 && Math.abs(dy) > 4) { fromSide = dx > 0 ? 'right' : 'left'; toSide = occupied(dy > 0) ? (dx > 0 ? 'left' : 'right') : (dy > 0 ? 'top' : 'bottom'); }
        }
        // straight down from a captioned disc: leave from under its caption
        const from = below(x) ? { x: x.x, y: x.dy, w: x.w, h: x.h, shape: 'rect', side: 'bottom', gap: 2 } : { ...node(x), side: fromSide };
        if (con[n.id]) con[n.id].update({ from, to: { ...node(t), side: toSide }, geometry: lineShape() });
      });
      return true;
    }
    function arrange(w, h) {
      if (w < 200 || h < 150) arr = 'micro';
      else arr = layout(w, h) ? 'diagram' : 'micro';
      return arr;
    }

    function render() {
      $('.iq-energy__name').textContent = s.name || 'Energy';
      $('.iq-energy__sub').textContent = s.subtitle || ''; $('.iq-energy__sub').hidden = !s.subtitle;
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      const hv = homeView();
      const H = el.home;
      H.b.querySelector('.iq-energy__nv').textContent = hv.text; H.b.dataset.na = hv.na ? 'true' : 'false';
      H.r.querySelector('.iq-energy__rv').textContent = hv.text;
      H.b.disabled = !linked() || !hv.entity;
      H.b.setAttribute('aria-label', `${s.homeLabel || 'Home'} ${hv.text}${linked() ? '. Details' : ''}`);
      const speak = [`${s.homeLabel || 'Home'} ${hv.text}`];
      nodes.forEach((n) => {
        const v = view(n), E = el[n.id];
        E.b.dataset.na = v.na ? 'true' : 'false';
        E.b.dataset.flow = v.reading && v.reading.state === 'flow' ? 'true' : 'false';
        E.b.querySelector('.iq-energy__nv').textContent = v.text;
        E.b.querySelector('.iq-energy__nw').textContent = v.words;
        E.b.querySelector('.iq-energy__nx').textContent = [v.words, v.level !== null && !v.levelOnly ? fmt(v.level, '%') : ''].filter(Boolean).join(' · ');
        E.b.querySelector('.iq-energy__ns').textContent = v.secText ? `${v.secText}` : '';
        E.b.disabled = !linked() || !(n.entity || n.level);
        if (E.ring) E.ring.update(v.level !== null ? { value: v.level, available: true } : {});
        E.r.dataset.na = v.na ? 'true' : 'false';
        E.r.querySelector('.iq-energy__rv').textContent = v.text;
        E.r.querySelector('.iq-energy__rd').textContent = [v.words, v.level !== null && !v.levelOnly ? fmt(v.level, '%') : ''].filter(Boolean).join(' · ');
        const say = `${labelOf(n)} ${v.words ? `${v.words.toLowerCase()} ` : ''}${v.text}${v.level !== null && !v.levelOnly ? `, ${Math.round(v.level)} percent` : ''}`;
        E.b.setAttribute('aria-label', `${say}${linked() && !E.b.disabled ? '. Details' : ''}`);
        speak.push(say);
        if (con[n.id]) con[n.id].flow(v.reading);
      });
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      $('.iq-energy__info').textContent = info; $('.iq-energy__info').hidden = !info;
      root.setAttribute('aria-label', `${s.name || 'Energy'}: ${speak.join('. ')}.`);
    }

    build();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => arrange(w, h), onChange: () => render() });
    render();
    root.energy = {
      /** every node: its text, its flow ('forward' = towards its target) and its level — for tests and hosts */
      getState: () => ({ home: homeView(), arrangement: arr, nodes: Object.fromEntries(nodes.map((n) => { const v = view(n); return [n.id, { type: n.type, text: v.text, words: v.words, na: !!v.na, level: v.level ?? null, flow: v.reading ? v.reading.state : 'idle', direction: v.reading ? v.reading.direction : 'none' }]; })) }),
      geometry: () => geo && { home: geo.home, at: geo.at, connectors: Object.fromEntries(Object.entries(con).map(([k, c]) => [k, c.geometry()])) },
      /** External update (Home Assistant: Home, the node entities, Information lines). Never sends anything. */
      setState(patch = {}) {
        const restructure = 'nodes' in patch || 'mappings' in patch || 'lineShape' in patch || 'flowStyle' in patch || 'glow' in patch || 'houseImage' in patch;
        s = { ...s, ...patch };
        if (restructure) { build(); if (global.MaisonFit && root.isConnected) global.MaisonFit.refresh(root); }
        render();
      },
    };
    // connectors pause off screen once their svg is on the page (the shared IniqFlow observer)
    requestAnimationFrame(() => { if (root.isConnected) Object.values(con).forEach((c) => c.update()); });
    return root;
  }

  /** a 3 × 3 tile can show the diagram; Compact fits 2 × 2 */

  /* ==========================================================================
     SYSTEM — one integrated energy system: the HOUSE at the centre (a picture or its icon), every source, battery and consumer
     around it, a connection from each to the house and — between sources — the ROUTES the power really takes (solar → battery,
     solar → grid, grid → battery, battery → grid), each its own animated line in its source's colour.
       · Direction: only the SIGN of a reading (with the node's "positive means" setting) — never guessed.
       · Routes: from route-free totals (solar, grid, battery, house): solar feeds the house first, then the battery, then the grid;
         the battery covers what is left of the house, the grid the rest. Shown only when solar, grid and battery are all readable
         POWER values (W / kW / MW) — otherwise the spokes alone, and the card says why.
       · Balance check: with a house reading, a difference over 10 % (and 100 W) between it and what the sources deliver is said
         plainly ("Readings differ by …") instead of being hidden.
       · Units: power is converted only to compare (W / kW / MW); an ENERGY reading (Wh / kWh) is shown as a value, never animated.
       · Unavailable: a dashed, still line and the word — no flow.
     Style (config): lineWidth 1–8 · flowSpeed slow / normal / fast · glowLevel 0–100 · nodeSize s / m / l · spacing 60–100 (%)
       · decimals '' (auto) / 0–2 · routes (default on) · selfSufficiency (default on) · houseImage · homeLabel · node colours.
     ========================================================================== */
  const POWER = { W: 1, kW: 1000, MW: 1e6 };
  const isPower = (u) => Object.prototype.hasOwnProperty.call(POWER, u || '');
  const SYS_ANGLE = { solar: -90, grid: 180, battery: 90, inverter: -140, gas: -150, water: 150, co2: -40, custom: 210, ev: 0, heatpump: -35, appliance: 40, circuit: 70 };
  const SYS_TONE = { home: '#7fb2ff', solar: '#ffb938', grid: '#8fa3c0', battery: '#41c98a', ev: '#a98bff', inverter: '#9aa4b2', circuit: '#ffcf4d', appliance: '#4fd1c5', heatpump: '#ff7d6e', gas: '#ff9f43', water: '#38bdf8', co2: '#9ccf6a', custom: '#c0cad8', export: '#e879c8' };
  /** routes from the totals (W): solar ≥ 0, grid + import / − export, batt + discharge / − charge, house ≥ 0 */
  function routesOf(solar, grid, batt, house) {
    const p = (v) => Math.max(0, v);
    const charge = p(-batt), dis = p(batt), imp = p(grid), exp = p(-grid);
    const sh = Math.min(solar, house); let sl = solar - sh;
    const sb = Math.min(sl, charge); sl -= sb;
    const sg = Math.min(sl, exp);
    const bh = Math.min(dis, p(house - sh)), bg = Math.min(p(dis - bh), p(exp - sg));
    const gh = Math.min(imp, p(house - sh - bh)), gb = Math.min(p(imp - gh), p(charge - sb));
    return { sh, sb, sg, bh, bg, gh, gb };
  }

  function createSystem(config) {
    let s = { ...(config || {}) };
    const I = global.IniqIcons;
    const linked = () => !!s.ha || (s.nodeVals && Object.keys(s.nodeVals).length > 0);
    const root = document.createElement('article');
    root.className = 'iq-energy iq-energy--sys';
    root.dataset.variant = 'system';
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqEnergyId = s.id;
    // a line never crosses a node: the line layer is masked out under every node and the house (the mask is per card)
    const maskId = `iqesys-m${Math.random().toString(36).slice(2, 9)}`;
    root.innerHTML = `
      <div class="iq-esys">
        <header class="iq-esys__head"><h3 class="iq-esys__name"></h3><p class="iq-esys__sub"></p><span class="iq-esys__self"></span></header>
        <div class="iq-esys__stage">
          <svg class="iq-esys__lines" aria-hidden="true"><defs><filter id="iqesys-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><mask id="${maskId}" maskUnits="userSpaceOnUse"><rect class="iq-esys__mr" x="-9999" y="-9999" width="19998" height="19998" fill="#fff"/></mask></defs><g class="iq-esys__g" mask="url(#${maskId})"></g></svg>
          <div class="iq-esys__hub"><div class="iq-esys__house"></div><b class="iq-esys__hv"></b><span class="iq-esys__hl"></span></div>
        </div>
        <p class="iq-esys__note" role="note"></p>
        <ul class="iq-esys__sr" aria-label="Power flows"></ul>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const stage = $('.iq-esys__stage'), g = $('.iq-esys__g'), hub = $('.iq-esys__hub');
    let els = {};
    const typeOf = (n) => NODE_TYPES[n.type] || NODE_TYPES.custom;
    const colorOf = (n) => tok(n.color, SYS_TONE[n.type] || SYS_TONE.custom);
    const dec = () => (s.decimals === 0 || s.decimals === 1 || s.decimals === 2 ? s.decimals : null);
    /** a reading → { kind: ok | loading | missing | unavailable | unknown, value, unit, w (watts, power only) } */
    function read(n, key) {
      if (linked()) {
        const id = n[key]; if (!id) return null;
        const x = (s.nodeVals || {})[id];
        if (!x || x.state === 'loading') return { kind: 'loading' };
        if (x.state === 'missing') return { kind: 'missing' };
        if (!x.available) return { kind: 'unavailable' };
        if (x.value === null || x.value === undefined) return { kind: 'unknown' };
        const unit = x.unit || n.unit || '';
        return { kind: 'ok', value: x.value, unit, w: isPower(unit) ? x.value * POWER[unit] : null };
      }
      const v = fin(key === 'entity' ? n.demo : key === 'level' ? n.demoLevel : null);
      if (v === null) return null;
      const unit = key === 'level' ? '%' : n.unit || 'W';
      return { kind: 'ok', value: v, unit, w: isPower(unit) ? v * POWER[unit] : null };
    }
    function homeRead() {
      if (s.ha) { const h = s.ha; if (h.state !== 'ready') return { kind: h.state === 'missing' ? 'missing' : 'loading' }; if (!h.available || h.value === null) return { kind: 'unavailable' };
        const u = h.unit || 'W'; return { kind: 'ok', value: h.value, unit: u, w: isPower(u) ? h.value * POWER[u] : null }; }
      const v = fin(s.demoHome); return v === null ? null : { kind: 'ok', value: v, unit: 'W', w: v };
    }
    const WORD = { loading: '…', missing: 'Not found', unavailable: 'Unavailable', unknown: 'Unknown' };
    /** a power in W → text (auto W / kW, the chosen decimals); another unit: its own, unconverted */
    function text(x, abs = true) {
      if (!x) return '—';
      if (x.kind !== 'ok') return WORD[x.kind] || '—';
      const d = dec();
      if (x.w !== null && x.w !== undefined) { const w = abs ? Math.abs(x.w) : x.w; return Math.abs(w) >= 1000 ? `${(w / 1000).toLocaleString(undefined, { maximumFractionDigits: d ?? (Math.abs(w) >= 10000 ? 1 : 2), minimumFractionDigits: d ?? 0 })} kW` : `${Math.round(w).toLocaleString()} W`; }
      const v = abs ? Math.abs(x.value) : x.value;
      return `${v.toLocaleString(undefined, { maximumFractionDigits: d ?? 2 })}${x.unit ? (x.unit === '%' ? '%' : ` ${x.unit}`) : ''}`;
    }
    /** a node's flow toward the house (W, signed: + toward), or null; its words */
    function flowOf(n) {
      const T = typeOf(n), pos = n.positive || T.positive;
      let x = read(n, 'entity');
      if (n.exportEntity) {
        const e = read(n, 'exportEntity');
        if (x && x.kind === 'ok' && e && e.kind === 'ok' && x.w !== null && e.w !== null) x = { kind: 'ok', value: x.value - e.value, unit: x.unit, w: x.w - e.w };
        else if (!(x && x.kind === 'ok')) x = e && e.kind !== 'ok' ? e : x;
      }
      const f = x && x.kind === 'ok' && x.w !== null ? (pos === 'toward' ? x.w : -x.w) : null;
      const word = f === null || Math.abs(f) < 1 ? '' : T.words ? T.words[(pos === 'toward') === (x.w > 0) ? 'toward' : 'away'] || '' : '';
      return { x, f, word };
    }

    function layout() {
      const nodes = nodesOf(s).filter((n) => !n.hidden);
      g.replaceChildren(); stage.querySelectorAll('.iq-esys__node').forEach((x) => x.remove()); els = {};
      // angles: each type its place; several of a type spread around it; two never closer than 34°
      // SLOTS spread evenly for the number of nodes (2: left / right · 3: top / left / right · 4: the four sides · more: evenly around),
      // each node in the free slot nearest its type's natural place (solar on top, grid on the left, the battery below / right…)
      const TEMPLATES = { 1: [-90], 2: [180, 0], 3: [-90, 180, 0], 4: [-90, 180, 0, 90], 5: [-120, -60, 180, 0, 90], 6: [-120, -60, 180, 0, 120, 60] };
      const slotsFor = (n) => TEMPLATES[n] || Array.from({ length: n }, (_, i) => -90 + (360 / n) * i);
      const vis = nodesOf(s).filter((n) => !n.hidden), free = slotsFor(vis.length).slice(), PRIO = ['solar', 'grid', 'battery'];
      const gap = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
      const order = vis.slice().sort((p, q) => (PRIO.indexOf(p.type) + 1 || 9) - (PRIO.indexOf(q.type) + 1 || 9));
      const slotOf = new Map();
      order.forEach((n) => { const want = SYS_ANGLE[n.type] ?? 210; let bi = 0; free.forEach((f, i) => { if (gap(f, want) < gap(free[bi], want)) bi = i; }); slotOf.set(n.id, free.splice(bi, 1)[0]); });
      const place = (a, n) => slotOf.get(n.id) ?? a;
      nodes.forEach((n) => {
        const el = document.createElement('div');
        el.className = 'iq-esys__node'; el.dataset.type = n.type; el.dataset.id = n.id;
        el.style.setProperty('--c', colorOf(n));
        el.innerHTML = '<span class="iq-esys__ic"></span><b class="iq-esys__v"></b><span class="iq-esys__l"></span><span class="iq-esys__x"></span><i class="iq-esys__lvl"></i>';
        if (I) I.present(el.querySelector('.iq-esys__ic'), { icon: n.icon || typeOf(n).icon });
        el.querySelector('.iq-esys__l').textContent = n.label || typeOf(n).label;
        stage.append(el);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('class', 'iq-esys__ln');
        const flow = document.createElementNS('http://www.w3.org/2000/svg', 'path'); flow.setAttribute('class', 'iq-esys__fl');
        line.style.stroke = flow.style.stroke = flow.style.color = s.lineColor ? tok(s.lineColor, colorOf(n)) : colorOf(n);
        // the DIRECTION indicator: a chevron in the middle of the line, pointing the way the power goes (also with reduced motion)
        const chev = document.createElementNS('http://www.w3.org/2000/svg', 'path'); chev.setAttribute('class', 'iq-esys__chev'); chev.setAttribute('d', 'M-4,-5 L3,0 L-4,5');
        chev.style.stroke = line.style.stroke;
        g.append(line, flow, chev);
        els[n.id] = { n, el, line, flow, chev, a: place(SYS_ANGLE[n.type] ?? 210, n) };
      });
      // the house image or its icon
      const house = $('.iq-esys__house');
      const img = s.houseImage && s.houseImage !== 'none' ? s.houseImage : '';
      house.dataset.photo = String(!!img);
      house.style.backgroundImage = img ? `url("${img.replace(/"/g, '')}")` : '';
      if (!img && I) { house.replaceChildren(); I.present(house, { icon: 'mdi:home-lightning-bolt-outline' }); } else if (img) house.replaceChildren();
      $('.iq-esys__hl').textContent = s.homeLabel || 'Home';
      geometry();
    }

    let routeEls = [], hubAt = [0, 0];
    /* GEOMETRY — the composition is sized as ONE thing: the house (the focal point), the nodes around it and the distance between them all
       scale together, and the largest scale at which the whole composition — labels included — fits the card is used, then centred. A card
       with two nodes is therefore as full as one with six; on a wide card the ring is stretched sideways (never upwards), on a phone it
       shrinks as a whole (never overlapping). Options: nodeSize (s / m / l) · spacing (60–160 %) · layout 'compact' | 'expanded'. */
    function geometry() {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!W || !H) return;
      const svg = $('.iq-esys__lines'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const nodes = Object.values(els);
      const sizeF = { s: 0.8, m: 1, l: 1.22 }[s.nodeSize] || 1;
      const spF = (Math.max(60, Math.min(160, Number(s.spacing) || 100)) / 100) * (s.layout === 'expanded' ? 1.4 : 1);
      // a small card (a phone): one-line labels (the name; the state word stays in the accessible description)
      const small = W < 420 || H < 300; root.dataset.small = String(small);
      const labels = s.showLabels !== false || s.showValues !== false, LAB = labels ? (small ? 18 : 32) : 6, LW = labels ? (small ? 36 : 54) : 0, HL = s.showLabels === false ? 14 : small ? 24 : 34;
      const ex = Math.min(1.7, Math.max(1, (W / H) / 1.35));   // a wide card: the ring is stretched sideways
      // a node's box: its circle and its label (above or below it); the house's: its circle and its value / label below
      const boxOf = (px, py, nr, above) => { const half = Math.max(nr, LW); return [px - half, py - nr - (above ? LAB : 0), px + half, py + nr + (above ? 0 : LAB)]; };
      const hit = (a, b) => a[0] < b[2] + 6 && b[0] < a[2] + 6 && a[1] < b[3] + 4 && b[1] < a[3] + 4;
      const dims = (k) => {
        const hr = k, nr = Math.max(20, k * 0.48 * sizeF);
        const hbox = [-hr, -hr, hr, hr + HL];
        // the ring's radius: at least the chosen spacing, pushed outwards until no node / label overlaps another or the house
        let D = hr + nr + k * 0.5 * spF, pts = [], boxes = [];
        for (let t = 0; t < 40; t++) {
          pts = nodes.map((x) => { const r = (x.a * Math.PI) / 180; return [Math.cos(r) * D * ex, Math.sin(r) * D, Math.sin(r) < -0.5]; });
          boxes = pts.map(([px, py, above]) => boxOf(px, py, nr, above));
          if (!boxes.some((b, i) => hit(b, hbox) || boxes.some((c, j) => j > i && hit(b, c)))) break;
          D *= 1.06;
        }
        let x0 = hbox[0], x1 = hbox[2], y0 = hbox[1], y1 = hbox[3];
        boxes.forEach((b) => { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); });
        return { hr, nr, D, pts, x0, x1, y0, y1 };
      };
      // the largest scale that fits (house radius 26–130 px)
      let lo = 18, hi = 130, g0 = dims(lo);
      for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2, d = dims(mid); if (d.x1 - d.x0 <= W - 12 && d.y1 - d.y0 <= H - 6) { lo = mid; g0 = d; } else hi = mid; }
      const G = g0, hr = G.hr, nr = G.nr;
      root.style.setProperty('--iq-esys-nr', `${nr}px`); root.style.setProperty('--iq-esys-hr', `${hr}px`);
      const cx = W / 2 - (G.x0 + G.x1) / 2, cy = H / 2 - (G.y0 + G.y1) / 2;
      nodes.forEach((x, i) => {
        const [ox, oy, above] = G.pts[i], px = cx + ox, py = cy + oy;
        x.p = [px, py];
        x.el.style.left = `${px}px`; x.el.style.top = `${py}px`;
        x.el.dataset.above = String(above);   // a node above the house: its label above it (the line leaves downwards)
        const d = Math.hypot(px - cx, py - cy) || 1, ux = (px - cx) / d, uy = (py - cy) / d;
        const a = [cx + ux * hr, cy + uy * hr], b = [px - ux * nr, py - uy * nr];
        // a gentle bend (curve) or straight
        const bend = s.lineShape === 'straight' ? 0 : 0.18;
        const mx = (a[0] + b[0]) / 2 - uy * d * bend * 0.5, my = (a[1] + b[1]) / 2 + ux * d * bend * 0.5;
        x.d = bend ? `M${b[0]},${b[1]} Q${mx},${my} ${a[0]},${a[1]}` : `M${b[0]},${b[1]} L${a[0]},${a[1]}`;   // drawn FROM the node TO the house
        x.mid = bend ? [0.25 * b[0] + 0.5 * mx + 0.25 * a[0], 0.25 * b[1] + 0.5 * my + 0.25 * a[1], Math.atan2(a[1] - b[1], a[0] - b[0])] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(a[1] - b[1], a[0] - b[0])];
        x.line.setAttribute('d', x.d); x.flow.setAttribute('d', x.d);
      });
      hub.style.left = `${cx}px`; hub.style.top = `${cy}px`; hubAt = [cx, cy];
      const mask = svg.querySelector('mask'); mask.querySelectorAll('circle').forEach((c) => c.remove());
      [[cx, cy, hr], ...nodes.map((x) => [x.p[0], x.p[1], nr])].forEach(([x, y, r]) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('r', String(r - 1)); c.setAttribute('fill', '#000'); mask.append(c);
      });
      values();
    }

    /** a route between two nodes (outside the hub): an arc bowed away from the centre */
    function routePath(A, B, cx, cy) {
      const [ax, ay] = A.p, [bx, by] = B.p, nr = parseFloat(root.style.getPropertyValue('--iq-esys-nr')) || 40;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy) || 1;
      const k = Math.hypot(bx - ax, by - ay) * 0.35;
      const qx = mx + (ox / ol) * k, qy = my + (oy / ol) * k;
      const trim = (px, py, tx, ty) => { const dx = tx - px, dy = ty - py, l = Math.hypot(dx, dy) || 1; return [px + (dx / l) * nr, py + (dy / l) * nr]; };
      const a = trim(ax, ay, qx, qy), b = trim(bx, by, qx, qy);
      return `M${a[0]},${a[1]} Q${qx},${qy} ${b[0]},${b[1]}`;
    }
    const pace = (w) => { const base = { slow: 1.7, fast: 0.55 }[s.flowSpeed] || 1; return `${(Math.max(0.7, 3.6 - Math.log10(Math.max(1, Math.abs(w))) * 0.75) * base).toFixed(2)}s`; };
    function animate(path, w, forward) {
      const still = w === null || Math.abs(w) < 5;
      path.dataset.still = String(still);
      path.dataset.dir = forward ? 'fwd' : 'rev';
      path.style.animationDuration = still ? '' : pace(w);
    }

    function values() {
      const [cx, cy] = hubAt;
      root.style.setProperty('--iq-esys-lw', `${Math.max(1, Math.min(8, Number(s.lineWidth) || 3))}px`);
      const gl = Math.max(0, Math.min(100, s.glowLevel === undefined ? (s.glow ? 60 : 25) : Number(s.glowLevel)));
      root.style.setProperty('--iq-esys-glow', String(gl / 100));
      root.dataset.glow = String(gl > 0);
      root.dataset.labels = String(s.showLabels !== false); root.dataset.values = String(s.showValues !== false);
      $('.iq-esys__name').textContent = s.name || 'Energy';
      $('.iq-esys__sub').textContent = s.subtitle || ''; $('.iq-esys__sub').hidden = !s.subtitle;
      const home = homeRead();
      // every node: value, words, level, its spoke
      const flows = {};
      const sr = [];
      Object.values(els).forEach((x) => {
        const { x: r, f, word } = flowOf(x.n);
        flows[x.n.id] = f;
        const T = typeOf(x.n);
        x.el.querySelector('.iq-esys__v').textContent = text(r);
        const lv = T.level || x.n.level || fin(x.n.demoLevel) !== null ? read(x.n, 'level') : null;
        x.el.querySelector('.iq-esys__x').textContent = [word, lv && lv.kind === 'ok' ? `${Math.round(lv.value)}%` : ''].filter(Boolean).join(' · ');
        x.el.querySelector('.iq-esys__lvl').style.setProperty('--lv', lv && lv.kind === 'ok' ? `${Math.max(0, Math.min(100, lv.value))}%` : '0%');
        x.el.dataset.level = String(!!(lv && lv.kind === 'ok'));
        const bad = !r || r.kind !== 'ok';
        x.el.dataset.state = bad ? (r ? r.kind : 'none') : 'ok';
        x.line.dataset.state = bad ? 'na' : 'ok';
        x.el.dataset.energy = String(!!(r && r.kind === 'ok' && r.w === null && /Wh$/i.test(r.unit || '')));
        sr.push(`${x.n.label || T.label}: ${text(r)}${word ? ` ${word.toLowerCase()}` : ''}`);
      });
      // ROUTES between sources (solar · grid · battery all readable power) and the house's share of each
      const by = (t) => Object.values(els).filter((x) => x.n.type === t);
      const sol = by('solar'), grd = by('grid'), bat = by('battery');
      const all = (list) => list.length && list.every((x) => flows[x.n.id] !== null);
      const showRoutes = s.routes !== false;
      let R = null, note = '';
      // the readings must ADD UP before routes or a self-powered share are claimed: house ≈ solar + grid (+ import / − export) + battery
      // (+ discharge / − charge). When they do not, nothing is derived from them; the card says why — and when reversing the grid's or the
      // battery's sign would make them add up, it says THAT (a sensor that counts export as positive is the usual cause).
      if (sol.length && all(sol) && (!grd.length || all(grd)) && (!bat.length || all(bat)) && (grd.length || bat.length)) {
        const solar = sol.reduce((a, x) => a + Math.max(0, flows[x.n.id]), 0), grid = grd.reduce((a, x) => a + flows[x.n.id], 0), batt = bat.reduce((a, x) => a + flows[x.n.id], 0);
        const supplied = solar + grid + batt;
        const known = home && home.kind === 'ok' && home.w !== null;
        const house = known ? Math.max(0, home.w) : Math.max(0, supplied);
        const off = (sup) => { const d = Math.abs(house - sup); return d > 100 && d > 0.1 * Math.max(house, 1); };
        let consistent = true;
        if (known && off(supplied)) {
          consistent = false;
          const nm = (list, t) => (list[0] && (list[0].n.label || typeOf(list[0].n).label)) || t;
          if (grd.length && !off(solar - grid + batt)) note = `The ${nm(grd, 'grid').toLowerCase()} reading looks reversed: with its sign reversed the readings add up. Check that node’s “A positive value flows” setting.`;
          else if (bat.length && !off(solar + grid - batt)) note = `The ${nm(bat, 'battery').toLowerCase()} reading looks reversed: with its sign reversed the readings add up. Check that node’s “A positive value flows” setting.`;
          else note = `Readings differ by ${text({ kind: 'ok', w: Math.abs(house - supplied) })} — the sensors report at different moments, or a source or consumer is not in this card.`;
        }
        if (consistent && showRoutes) R = routesOf(solar, grid, batt, house);
      }
      if (R) {
        const house = home && home.kind === 'ok' && home.w !== null ? Math.max(0, home.w) : Math.max(0, R.sh + R.bh + R.gh);
        const self = house > 20 ? Math.round(((R.sh + R.bh) / Math.max(house, R.sh + R.bh + R.gh)) * 100) : null;
        const se = $('.iq-esys__self');
        se.hidden = s.selfSufficiency === false || self === null;
        se.textContent = self === null ? '' : `${self}% self-powered`;
        se.style.setProperty('--p', `${self || 0}%`);
      } else {
        $('.iq-esys__self').hidden = true;
        if (!note && showRoutes && sol.length && (grd.length || bat.length)) note = 'Routes between solar, battery and grid appear when all their power readings are available.';
      }
      // spokes: with routes, a source's spoke carries only its share to the house; without, its whole flow
      Object.values(els).forEach((x) => {
        const f = flows[x.n.id];
        let w = f;
        if (R && x.n.type === 'solar') w = R.sh * (Math.max(0, f) / Math.max(1, sol.reduce((a, y) => a + Math.max(0, flows[y.n.id]), 0)));
        if (R && x.n.type === 'grid') w = f >= 0 ? R.gh : 0;                 // export: drawn as solar / battery → grid routes
        if (R && x.n.type === 'battery') w = f >= 0 ? R.bh * (f / Math.max(1, bat.reduce((a, y) => a + Math.max(0, flows[y.n.id]), 0))) : 0;
        animate(x.flow, w, w === null ? true : w >= 0);
        x.flow.dataset.state = x.line.dataset.state;
        const moving = w !== null && Math.abs(w) >= 5 && s.arrows !== false && x.mid;
        x.chev.style.display = moving ? '' : 'none';
        if (moving) x.chev.setAttribute('transform', `translate(${x.mid[0]},${x.mid[1]}) rotate(${(x.mid[2] * 180) / Math.PI + (w >= 0 ? 0 : 180)})`);
      });
      // the route arcs (rebuilt: few, cheap)
      routeEls.forEach((p) => p.remove()); routeEls = [];
      if (R) {
        const pair = (A, B, w, color) => {
          if (!A || !B || !A.p || !B.p || !stage.clientWidth || w < 5) return;
          const d = routePath(A, B, cx, cy), base = document.createElementNS('http://www.w3.org/2000/svg', 'path'), fl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          base.setAttribute('class', 'iq-esys__ln iq-esys__rt'); fl.setAttribute('class', 'iq-esys__fl iq-esys__rt');
          base.setAttribute('d', d); fl.setAttribute('d', d); base.style.stroke = fl.style.stroke = fl.style.color = color; fl.dataset.route = `${A.n.type}-${B.n.type}`;
          g.append(base, fl); routeEls.push(base, fl); animate(fl, w, true);
          sr.push(`${A.n.label || typeOf(A.n).label} to ${B.n.label || typeOf(B.n).label}: ${text({ kind: 'ok', w })}`);
        };
        pair(sol[0], bat[0], R.sb, colorOf(sol[0].n));
        pair(sol[0], grd[0], R.sg, tok(null, SYS_TONE.export));
        pair(grd[0], bat[0], R.gb, colorOf(grd[0] ? grd[0].n : { type: 'grid' }));
        pair(bat[0], grd[0], R.bg, tok(null, SYS_TONE.export));
      }
      // the house
      $('.iq-esys__hv').textContent = home ? text(home) : R ? text({ kind: 'ok', w: R.sh + R.bh + R.gh }) : '';
      hub.dataset.state = home && home.kind !== 'ok' ? home.kind : 'ok';
      const nt = $('.iq-esys__note'); nt.textContent = note; nt.hidden = !note;
      $('.iq-esys__sr').replaceChildren(...sr.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
      root.setAttribute('aria-label', `${s.name || 'Energy'}: house ${home ? text(home) : 'unknown'}`);
    }

    layout();
    new ResizeObserver(() => geometry()).observe(stage);
    root.energy = {
      getState: () => ({ ...s, nodes: nodesOf(s).map((n) => n.id) }),
      setState(patch) {
        const p = patch || {}, structural = ['nodes', 'houseImage', 'homeLabel', 'nodeSize', 'spacing', 'lineShape', 'variant', 'layout', 'lineColor', 'showLabels', 'showValues'].some((k) => k in p);
        s = { ...s, ...p };
        if (structural) layout(); else values();
      },
      routes: () => routeEls.filter((x) => x.dataset.route).map((x) => [x.dataset.route, x.dataset.still === 'true' ? 0 : 1]),
    };
    return root;
  }

  function constraints(config) {
    if (config && config.variant === 'system') return { minW: { desktop: 4, tablet: 4, mobile: 4 }, minH: 5 };
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: config && config.variant === 'compact' ? 2 : 3 };
  }

  global.MaisonEnergy = { create, constraints, ICONS, nodesOf, nodeEntities, NODE_TYPES, routesOf };
})(window);
