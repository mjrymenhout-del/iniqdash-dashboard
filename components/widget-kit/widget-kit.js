/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqWidgetKit — common WIDGET-LEVEL capabilities a widget can adopt (no widget has to; nothing changes until it does).
   The editor side (fields, validation) lives in the registry / schema form: F.corners(), F.interactions(), F.visibility().

   1. CORNERS   IniqWidgetKit.corners(el, corners)
        corners = { tl, tr, bl, br }, each { shape: 'normal' | 'concave', r: px }  (undefined → nothing is touched:
        the widget's own border-radius applies, e.g. a legacy global "radius")
        normal  → that corner's border-radius;  concave → a circle of radius r around the corner point is cut away by a
        CSS mask (full-size layers, intersected) — real transparency: whatever is behind the widget shows through.

   2. INTERACTIONS   IniqWidgetKit.interactions(el, { get, defaults, verbs, widget, label })
        get()     → the widget's config.interactions: { tap: { action, popup?, page? }, doubleTap: {…}, longPress: {…} }
        defaults  { tap: 'toggle', … }  the action of a gesture the configuration does not mention
        verbs     { toggle, turn_on, turn_off }  the widget's own entity requests (it knows its state and its HA channel)
        Actions:  none · toggle · turn_on · turn_off (the widget's verbs) · popup { popup } · navigate { page }
                  · details (the widget's verb: Entity Details of its linked Home Assistant entity — read-only)
                  (popup / navigate go to the application's existing dispatcher as a 'maison:action' request)
        Gestures: tap · double tap (only waited for when one is configured) · long press (500 ms; the release is not a tap).
        The widget's own controls never start a card gesture: native controls (button, input, select, a, …), ARIA widgets
        (role button / switch / slider / radio / …) and anything marked [data-iq-control] (a draggable dial, a clickable
        artwork area…). So one press on an internal control is exactly one action.
        Keyboard: Enter / Space on the card = tap.
        While editing the editor makes widgets inert, so no gesture can run; in the configuration preview the entity
        channel refuses (preview) and popup / navigate are only announced.

   3. VISIBILITY   IniqWidgetKit.visibility(el, { entity, op: 'eq' | 'ne', value, mode: 'show' | 'hide' })
        Follows the entity live (IniqHA). Hidden = visibility: hidden — the item KEEPS ITS GRID FOOTPRINT, nothing moves.
        Cannot be evaluated (entity missing / unavailable / unknown, Home Assistant or server unreachable, state not
        known yet) → the widget is SHOWN (data-iq-vis="fallback"): a control never vanishes because of an outage.
        el.dataset.iqVis: 'shown' | 'hidden' | 'fallback'.
   ========================================================================== */
(function (global) {
  'use strict';

  const CORNERS = ['tl', 'tr', 'bl', 'br'];
  const SHAPES = ['normal', 'concave'];
  const R_MAX = 200;
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(R_MAX, n)) : d; };

  /* ---------------------------------------------------------------- corners */
  /** a complete, clean corner set (or null when there is none) */
  function cleanCorners(c) {
    if (!c || typeof c !== 'object') return null;
    const out = {};
    CORNERS.forEach((k) => { const x = c[k] || {}; out[k] = { shape: SHAPES.includes(x.shape) ? x.shape : 'normal', r: num(x.r, 0) }; });
    return out;
  }
  const POS = { tl: '0 0', tr: '100% 0', bl: '0 100%', br: '100% 100%' };
  const PROP = { tl: 'borderTopLeftRadius', tr: 'borderTopRightRadius', bl: 'borderBottomLeftRadius', br: 'borderBottomRightRadius' };
  const MASK = ['Image', 'Size', 'Position', 'Repeat', 'Composite'];
  const clearMask = (st) => MASK.forEach((k) => { st[`mask${k}`] = ''; st[`webkitMask${k}`] = ''; });
  /**
   * NORMAL corner: that corner's border-radius (CSS scales radii down itself when they do not fit).
   * CONCAVE corner: border-radius 0, and a full-size mask layer that removes a circle of radius r centred ON the corner
   * point; the layers of the four corners are INTERSECTED (mask-composite: intersect · -webkit-mask-composite:
   * source-in), so each corner cuts only itself, at any radius — no quadrant limit. A normal corner's layer is solid.
   * The cut-out is real transparency: the widget's backgrounds, artwork, glow and shadow are all masked; whatever is
   * behind the widget shows through. No corners config → nothing is touched (the widget's legacy radius applies).
   */
  function corners(el, config) {
    if (!el || !el.style) return;
    const c = cleanCorners(config);
    const st = el.style;
    if (!c) {                                                         // legacy: the widget's own radius, untouched
      CORNERS.forEach((k) => { st[PROP[k]] = ''; });
      clearMask(st);
      delete el.dataset.iqCorners;
      return;
    }
    CORNERS.forEach((k) => { st[PROP[k]] = c[k].shape === 'normal' ? `${c[k].r}px` : '0px'; });
    if (CORNERS.some((k) => c[k].shape === 'concave' && c[k].r > 0)) {
      const layer = (k) => (c[k].shape === 'concave' && c[k].r > 0
        ? `radial-gradient(circle at ${POS[k]}, transparent ${c[k].r}px, #000 ${c[k].r + 0.5}px)` : 'linear-gradient(#000, #000)');
      const img = CORNERS.map(layer).join(', ');
      const all = (v) => CORNERS.map(() => v).join(', ');
      st.webkitMaskImage = img; st.maskImage = img;
      st.webkitMaskSize = all('100% 100%'); st.maskSize = all('100% 100%');
      st.webkitMaskPosition = all('0 0'); st.maskPosition = all('0 0');
      st.webkitMaskRepeat = all('no-repeat'); st.maskRepeat = all('no-repeat');
      st.webkitMaskComposite = 'source-in';                            // older WebKit / Blink (legacy keyword)
      st.maskComposite = 'intersect';                                  // standard (Chrome 120+, Safari 15.4+, Firefox 53+)
    } else {
      clearMask(st);
    }
    el.dataset.iqCorners = CORNERS.map((k) => `${k}:${c[k].shape[0]}${c[k].r}`).join(' ');
  }

  /* ---------------------------------------------------------------- interactions */
  const GESTURES = ['tap', 'doubleTap', 'longPress'];
  const ACTIONS = ['none', 'toggle', 'turn_on', 'turn_off', 'popup', 'navigate', 'details', 'url'];
  /** an "Open a web address" target: http(s) only, no spaces / quotes / angle brackets (never javascript:, data:…) */
  const SAFE_LINK = /^https?:\/\/[^\s"'<>`]{1,500}$/;
  const ENTITY_ACTIONS = ['toggle', 'turn_on', 'turn_off'];
  const T = { long: 500, double: 280, move: 10 };
  /** the widget's own interactive descendants: they opt OUT of card gestures automatically (native controls and ARIA
      widgets), plus anything marked [data-iq-control] (e.g. a draggable dial, a clickable artwork area) */
  const CONTROLS = 'button, a[href], input, select, textarea, label, summary, [contenteditable=""], [contenteditable="true"], '
    + '[role="button"], [role="switch"], [role="slider"], [role="radio"], [role="checkbox"], [role="spinbutton"], [role="tab"], '
    + '[role="menuitem"], [role="option"], [role="combobox"], [data-iq-control]';

  /** the action configured for one gesture: { action, popup?, page? } (a gesture the config does not mention → default) */
  function actionOf(cfg, defaults, g) {
    const x = cfg && typeof cfg === 'object' && cfg[g] && typeof cfg[g] === 'object' ? cfg[g] : null;
    const a = x && ACTIONS.includes(x.action) ? x.action : (defaults && ACTIONS.includes(defaults[g]) ? defaults[g] : 'none');
    return { action: a, popup: x && typeof x.popup === 'string' ? x.popup : undefined, page: x && typeof x.page === 'string' ? x.page : undefined,
      url: x && typeof x.url === 'string' && SAFE_LINK.test(x.url) ? x.url : undefined };
  }
  /** removes keys that do not belong to the chosen action (stored configs stay tidy) */
  function cleanInteractions(i) {
    if (!i || typeof i !== 'object') return i;
    GESTURES.forEach((g) => {
      const x = i[g];
      if (!x || typeof x !== 'object') return;
      if (x.action !== 'popup') delete x.popup;
      if (x.action !== 'navigate') delete x.page;
      if (x.action !== 'url' || typeof x.url !== 'string' || !SAFE_LINK.test(x.url)) delete x.url;
      if (x.action === 'url' && !x.url) x.action = 'none';                // an unsafe or missing address: the gesture does nothing (never a broken dashboard)
    });
    return i;
  }

  function interactions(el, { get, defaults = {}, verbs = {}, widget = '', label = null } = {}) {
    if (!el || el.iqInteractions) return el && el.iqInteractions;
    const log = [];                                                   // what ran: [{ gesture, action }] (diagnostics / tests)
    const cfg = () => (typeof get === 'function' ? get() : null);
    const of = (g) => actionOf(cfg(), defaults, g);
    const active = (g) => of(g).action !== 'none';
    function run(g, source) {
      const a = of(g);
      if (a.action === 'none') return false;
      log.push({ gesture: g, action: a.action });
      if (log.length > 100) log.shift();
      if (a.action === 'url') { if (a.url) { const w = window.open(a.url, '_blank', 'noopener,noreferrer'); if (w) w.opener = null; } return true; }   // a new tab, never this dashboard's window
      if (ENTITY_ACTIONS.includes(a.action) || a.action === 'details') { const fn = verbs[a.action]; if (typeof fn === 'function') fn({ gesture: g, source }); return true; }
      const action = a.action === 'popup' ? { type: 'popup', popup: a.popup, label: label ? label() : '' } : { type: 'navigate', page: a.page, label: label ? label() : '' };
      el.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action, meta: { source, gesture: g }, widget } }));
      return true;
    }
    // ---- pointer gestures
    let start = null, longT = 0, longFired = false, pendT = 0;
    // a press that starts on one of the widget's OWN controls is that control's, never a card gesture
    const own = (t) => { const c = t && t.closest ? t.closest(CONTROLS) : null; return !!c && c !== el && el.contains(c); };
    const cancel = () => { clearTimeout(longT); start = null; };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || own(e.target) || !GESTURES.some(active)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      longFired = false;
      clearTimeout(longT);
      if (active('longPress')) longT = setTimeout(() => { if (!start) return; longFired = true; start = null; clearTimeout(pendT); pendT = 0; run('longPress', 'pointer'); }, T.long);
    });
    el.addEventListener('pointermove', (e) => { if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > T.move) cancel(); });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', (e) => { if (start && e.pointerId === start.id && e.pointerType === 'mouse') cancel(); });
    el.addEventListener('pointerup', (e) => {
      clearTimeout(longT);
      if (!start || e.pointerId !== start.id || longFired) { start = null; longFired = false; return; }
      start = null;
      if (active('doubleTap')) {
        if (pendT) { clearTimeout(pendT); pendT = 0; run('doubleTap', 'pointer'); return; }          // the second tap
        pendT = setTimeout(() => { pendT = 0; run('tap', 'pointer'); }, T.double);              // wait: maybe a double tap
        return;
      }
      run('tap', 'pointer');
    });
    // a long press on touch screens must not open the context menu / start a text selection
    el.addEventListener('contextmenu', (e) => { if (active('longPress') && !own(e.target)) e.preventDefault(); });
    // ---- keyboard: the card itself is a button when it does anything
    el.addEventListener('keydown', (e) => {
      if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ') || !active('tap')) return;
      e.preventDefault();
      run('tap', 'keyboard');
    });
    // only what the kit itself added is ever removed again (a widget's own role / tabindex stay untouched)
    const own0 = { tab: el.hasAttribute('tabindex'), role: el.getAttribute('role') };
    function sync() {
      const any = GESTURES.some(active);
      el.dataset.iqInteractive = String(any);
      if (any) { if (!own0.tab) el.tabIndex = 0; if (!own0.role || own0.role === 'group') el.setAttribute('role', 'button'); }
      else { if (!own0.tab) el.removeAttribute('tabindex'); if (own0.role) el.setAttribute('role', own0.role); else el.removeAttribute('role'); }
    }
    sync();
    el.iqInteractions = { sync, log, actionOf: (g) => ({ ...of(g) }), run };
    return el.iqInteractions;
  }

  /* ---------------------------------------------------------------- visibility */
  const OPS = ['eq', 'ne'];
  const MODES = ['show', 'hide'];
  /** 'shown' | 'hidden' | 'fallback' for one entity state (pure: also used by tests and the editor) */
  function evaluate(cond, e, haState) {
    if (!cond || !cond.entity) return 'shown';
    if (haState && haState !== 'connected') return 'fallback';
    if (!e || !e.available || e.state === 'unknown' || e.state === 'unavailable' || e.state === undefined || e.state === null) return 'fallback';
    const want = String(cond.value ?? '').trim().toLowerCase(), is = String(e.state).trim().toLowerCase();
    const match = (OPS.includes(cond.op) ? cond.op : 'eq') === 'ne' ? is !== want : is === want;
    const show = (MODES.includes(cond.mode) ? cond.mode : 'show') === 'show' ? match : !match;
    return show ? 'shown' : 'hidden';
  }
  const watched = new Map();               // el → { born, seen, stop }
  let sweepT = 0;
  function sweep() {
    const now = Date.now();
    watched.forEach((w, el) => {
      if (el.isConnected) { w.seen = true; return; }
      if (w.seen || now - w.born > 5000) { w.stop(); watched.delete(el); }   // left the page (re-render, page switch…)
    });
    clearTimeout(sweepT);
    if (watched.size) sweepT = setTimeout(sweep, 5000);
  }
  function visibility(el, cond) {
    const ha = global.IniqHA;
    if (!el || !cond || !cond.entity || !ha || !ha.enabled || !ha.enabled()) return el;
    const paint = () => {
      const r = evaluate(cond, ha.get(cond.entity), ha.status().state);
      el.dataset.iqVis = r;
    };
    paint();
    const unsub = ha.subscribe(cond.entity, paint);
    const unStatus = ha.onStatus(paint);
    watched.set(el, { born: Date.now(), seen: false, stop: () => { unsub(); unStatus(); } });
    clearTimeout(sweepT); sweepT = setTimeout(sweep, 5000);
    return el;
  }
  /** removes an incomplete condition (no entity → no condition at all) */
  function cleanVisibility(v) { return v && typeof v === 'object' && typeof v.entity === 'string' && v.entity ? v : undefined; }

  /* ---------------------------------------------------------------- history layer
     4. HISTORY LAYER   IniqWidgetKit.historyLayer(host, { position: 'background' | 'bottom' }) → layer
        A data-driven visual INSIDE a widget (first user: Sensor inline history). It draws only what it is given — real
        history prepared by the shared HA layer — and never invents a point:
          layer.set({ style: 'line' | 'area', points: [[ms, value|null]…], start, end })      numeric (null = gap)
          layer.set({ style: 'timeline', segments: [{ t, tone, word }…], start, end })         state periods (tone 'gap' = not drawn)
          layer.set({ empty: true })   no history → nothing drawn (a quiet "No history" only where there is room)
          layer.clear() · layer.destroy() · layer.host
        It sits behind the widget's content (its own stacking context), is clipped by the widget's own shape (corners,
        concave masks), follows the WIDGET's size (ResizeObserver — not the screen breakpoint or the editor zoom), never
        takes pointer events and never changes the layout. Too small to mean anything → not drawn. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function historyLayer(host, { position = 'bottom' } = {}) {
    const el = document.createElement('div');
    el.className = 'iq-hist';
    el.dataset.pos = position === 'background' ? 'background' : 'bottom';
    el.setAttribute('aria-hidden', 'true');
    host.classList.add('iq-hist-host');
    host.prepend(el);
    let data = null, w = 0, h = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((en) => { const r = en[0].contentRect; if (Math.abs(r.width - w) > .5 || Math.abs(r.height - h) > .5) { w = r.width; h = r.height; draw(); } }) : null;
    if (ro) ro.observe(el);
    function draw() {
      el.replaceChildren();
      el.dataset.drawn = '0';
      if (!data) return;
      if (!w || !h) { const r = el.getBoundingClientRect(); w = r.width; h = r.height; }
      if (w < 56 || h < 10) { el.dataset.drawn = 'too-small'; return; }
      if (data.empty) {
        el.dataset.drawn = 'empty';
        if (el.dataset.pos === 'bottom' && w >= 110 && h >= 16) { const t = document.createElement('span'); t.className = 'iq-hist__none'; t.textContent = 'No history'; el.append(t); }
        return;
      }
      const span = Math.max(1, (data.end || 0) - (data.start || 0));
      const X = (t) => ((t - data.start) / span) * w;
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('preserveAspectRatio', 'none');
      if (data.style === 'timeline') {
        const segs = data.segments || [];
        const strip = el.dataset.pos === 'bottom' ? Math.min(6, h) : h;   // bottom: a thin strip; background: faint full-height bands
        let n = 0;
        segs.forEach((sg, i) => {
          const x0 = X(Math.max(data.start, sg.t)), x1 = X(i + 1 < segs.length ? segs[i + 1].t : data.end);
          if (sg.tone === 'gap' || x1 - x0 <= 0) return;                 // unavailable / unknown: not drawn as a state
          const r = document.createElementNS(SVGNS, 'rect');
          r.setAttribute('x', x0.toFixed(2)); r.setAttribute('y', (h - strip).toFixed(2)); r.setAttribute('width', Math.max(.75, x1 - x0).toFixed(2)); r.setAttribute('height', strip.toFixed(2));
          r.setAttribute('class', `iq-hist__seg iq-hist__seg--${sg.tone || 'state'}`);
          if (sg.word) { const tt = document.createElementNS(SVGNS, 'title'); tt.textContent = sg.word; r.append(tt); }
          svg.append(r); n++;
        });
        el.dataset.drawn = String(n);
      } else {
        const pts = (data.points || []).filter((p) => Number.isFinite(p[0]));
        const vals = pts.map((p) => p[1]).filter((v) => typeof v === 'number' && Number.isFinite(v));
        if (!vals.length) { el.dataset.drawn = 'empty'; return; }
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }                        // a flat history: a flat line in the middle
        const top = el.dataset.pos === 'background' ? h * .38 : h * .12, bot = h - (el.dataset.pos === 'background' ? h * .06 : 1.5);
        const Y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
        // contiguous runs only: a gap (null) breaks the line — nothing is drawn across it
        const runs = []; let cur = [];
        pts.forEach((p) => { if (typeof p[1] === 'number' && Number.isFinite(p[1])) cur.push([X(p[0] + (data.step || 0) / 2), Y(p[1])]); else if (cur.length) { runs.push(cur); cur = []; } });
        if (cur.length) runs.push(cur);
        runs.forEach((run) => {
          const r = run.length === 1 ? [[run[0][0] - 1.5, run[0][1]], [run[0][0] + 1.5, run[0][1]]] : run;
          const d = r.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(' ');
          if (data.style === 'area') {
            const a = document.createElementNS(SVGNS, 'path');
            a.setAttribute('d', `${d} L${r[r.length - 1][0].toFixed(2)} ${h} L${r[0][0].toFixed(2)} ${h} Z`);
            a.setAttribute('class', 'iq-hist__area'); svg.append(a);
          }
          const l = document.createElementNS(SVGNS, 'path');
          l.setAttribute('d', d); l.setAttribute('class', 'iq-hist__line'); l.setAttribute('vector-effect', 'non-scaling-stroke');
          svg.append(l);
        });
        el.dataset.drawn = String(vals.length);
        el.dataset.runs = String(runs.length);
      }
      el.append(svg);
    }
    const layer = {
      host,
      set(d) { data = d; el.dataset.style = d && d.style ? d.style : ''; draw(); },
      clear() { data = null; draw(); },
      has: () => !!data && !data.empty,
      position(p) { el.dataset.pos = p === 'background' ? 'background' : 'bottom'; draw(); },
      destroy() { if (ro) ro.disconnect(); el.remove(); host.classList.remove('iq-hist-host'); },
      el,
    };
    return layer;
  }

  /* ================================================================ WIDGET SURFACE (common capability — every widget, one implementation)
     The OUTER surface of a widget (its root's own background, shadow, border and backdrop) and its HOVER treatment — never its content:
     buttons, dials, segmented controls, information tiles, images keep their own looks.
       widgetBg:  absent = Theme (the widget exactly as it is) · 'transparent' · 'opacity' (widgetBgOpacity 0–100 %)
       hover:     absent = the widget's default (none) · 'none' · 'surface' · 'glow' · 'lift' · 'surface-lift'
                  hoverOpacity (0–100 %: the surface while hovered) · hoverColor (token | #rrggbb) · hoverGlow (0–100 %) · hoverLift (0–12 px)
                  · hoverMs (0–600 ms)
     How: the root keeps its logical box (layout, MaisonFit, interactions and the editor's selection are untouched). When the surface is
     not the theme's — or a hover reveals it — the root's own surface is REDRAWN on a layer behind its content (.iq-wsurf__layer, captured
     from the root's computed theme style, re-captured when the widget changes state) at the chosen opacity, and the root's own paint is
     removed. Hover: only on a real hover-capable pointer (never sticky after a touch); lift is a translate (no layout); reduced motion —
     no lift, no transitions. */
  const HEX = /^#[0-9a-fA-F]{6}$/, TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const HOVERS = ['none', 'surface', 'glow', 'lift', 'surface-lift'];
  /* APPEARANCE (shared, every widget — the same settings and the same renderer for all; the Appearance section of the configurator):
       widgetBg   absent = Theme · 'transparent' · 'opacity' · 'solid' (bgColor) · 'gradient' (bgFrom → bgVia? → bgTo, bgAngle°, bgShape
                  linear | radial) · 'image' (bgImage: a built-in asset or an uploaded IniqDash asset; bgFit cover | contain, bgPos,
                  bgOverlay 0–90 % darkening, bgOverlayMode even | bottom | top)
                  widgetBgOpacity 0–100 % applies to every painted mode (opacity, solid, gradient, image)
       border     borderWidth 0–4 px, borderColor, borderStyle solid | dashed | dotted
       shadow     absent = the theme's · 'none' · 'soft' · 'strong' · 'inner'
       glow       cardGlowColor + cardGlow 0–100 % (a soft light around the card, always — the hover glow is separate)
     A widget's CONTENT (its controls, dial, tiles, pictures) keeps its own look: only the card behind it changes. */
  const BGS = ['transparent', 'opacity', 'solid', 'gradient', 'image'], PAINTED = ['opacity', 'solid', 'gradient', 'image'];
  const FITS = ['cover', 'contain'], POSITIONS = { center: 'center', top: 'center top', bottom: 'center bottom', left: 'left center', right: 'right center' };
  const SHADOWS = { none: 'none', soft: '0 8px 22px -14px rgba(0, 0, 0, .7)', strong: '0 18px 40px -18px rgba(0, 0, 0, .9), 0 2px 8px rgba(0, 0, 0, .35)', inner: 'inset 0 2px 14px rgba(0, 0, 0, .55), inset 0 0 0 1px rgba(255, 255, 255, .04)' };
  const BORDER_STYLES = ['solid', 'dashed', 'dotted'], OVERLAYS = ['even', 'bottom', 'top'];
  // an image: a built-in asset path (assets/…, a widget package's assets) or an uploaded IniqDash asset — never an outside address
  const IMAGE = /^(?!.*\.\.)((assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+\.(svg|png|jpe?g|webp)|api\/asset\.php\?id=[0-9a-f]{32})$/;
  const pct = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d);
  const colourOf = (v) => (typeof v === 'string' ? (HEX.test(v) ? v : TOKENS.includes(v) ? `var(--${v})` : '') : '');
  /** a configuration's surface settings, allow-listed (defaults not stored) */
  function cleanSurface(c) {
    if (!c || typeof c !== 'object') return c;
    if (c.widgetBg !== undefined && !BGS.includes(c.widgetBg)) delete c.widgetBg;
    const bg = c.widgetBg;
    if (!PAINTED.includes(bg)) delete c.widgetBgOpacity;
    if (c.hover !== undefined && !HOVERS.includes(c.hover)) delete c.hover;
    const num = (k, lo, hi, needs) => { if (c[k] === undefined) return; if (!needs || typeof c[k] !== 'number' || !Number.isFinite(c[k])) delete c[k]; else c[k] = Math.max(lo, Math.min(hi, Math.round(c[k]))); };
    const col = (k, needs) => { if (c[k] !== undefined && (!needs || !colourOf(c[k]))) delete c[k]; };
    const pick = (k, list, needs) => { if (c[k] !== undefined && (!needs || !list.includes(c[k]))) delete c[k]; };
    const hv = c.hover;
    num('widgetBgOpacity', 0, 100, PAINTED.includes(bg));
    num('hoverOpacity', 0, 100, hv === 'surface' || hv === 'surface-lift');
    num('hoverGlow', 0, 100, hv === 'glow');
    num('hoverLift', 0, 12, hv === 'lift' || hv === 'surface-lift');
    num('hoverMs', 0, 600, !!hv && hv !== 'none');
    if (c.hoverColor !== undefined && (!colourOf(c.hoverColor) || !['surface', 'surface-lift', 'glow'].includes(hv))) delete c.hoverColor;
    col('bgColor', bg === 'solid');
    col('bgFrom', bg === 'gradient'); col('bgVia', bg === 'gradient'); col('bgTo', bg === 'gradient');
    num('bgAngle', 0, 360, bg === 'gradient'); pick('bgShape', ['linear', 'radial'], bg === 'gradient');
    if (c.bgImage !== undefined && (bg !== 'image' || typeof c.bgImage !== 'string' || !IMAGE.test(c.bgImage))) delete c.bgImage;
    pick('bgFit', FITS, bg === 'image'); pick('bgPos', Object.keys(POSITIONS), bg === 'image'); pick('bgOverlayMode', OVERLAYS, bg === 'image');
    num('bgOverlay', 0, 90, bg === 'image');
    num('borderWidth', 0, 4, true);
    const bw = c.borderWidth > 0;
    col('borderColor', bw); pick('borderStyle', BORDER_STYLES, bw);
    if (c.borderWidth === 0) delete c.borderWidth;
    pick('shadow', Object.keys(SHADOWS), true);
    num('cardGlow', 0, 100, true); if (c.cardGlow === 0) delete c.cardGlow;
    col('cardGlowColor', c.cardGlow > 0);
    pick('textTone', ['light', 'dark'], true);
    col('accentColor', true);
    num('bgBlur', 0, 24, true); if (c.bgBlur === 0) delete c.bgBlur;               // GLASS: blur what is behind the card (px)
    num('contentScale', 80, 130, true); if (c.contentScale === 100) delete c.contentScale;   // CONTENT SIZE: the widget's contents (%)
    return c;
  }
  /** the painted background of a custom surface (solid · gradient · image), or '' for the theme's own */
  function paintOf(c) {
    if (c.widgetBg === 'solid') return colourOf(c.bgColor) || 'var(--surface-primary)';
    if (c.widgetBg === 'gradient') {
      const from = colourOf(c.bgFrom) || 'var(--surface-primary-top)', to = colourOf(c.bgTo) || 'var(--surface-secondary)', via = colourOf(c.bgVia);
      const stops = via ? `${from}, ${via}, ${to}` : `${from}, ${to}`;
      return c.bgShape === 'radial' ? `radial-gradient(120% 120% at 20% 0%, ${stops})` : `linear-gradient(${typeof c.bgAngle === 'number' ? c.bgAngle : 160}deg, ${stops})`;
    }
    if (c.widgetBg === 'image' && typeof c.bgImage === 'string' && IMAGE.test(c.bgImage)) {
      const a = pct(c.bgOverlay, 35) / 100, d = (x) => `rgba(6, 9, 16, ${Math.round(x * 1000) / 1000})`;
      const shade = c.bgOverlayMode === 'bottom' ? `linear-gradient(180deg, ${d(a * 0.15)} 0%, ${d(a * 0.55)} 45%, ${d(a)} 100%)`
        : c.bgOverlayMode === 'top' ? `linear-gradient(0deg, ${d(a * 0.15)} 0%, ${d(a * 0.55)} 45%, ${d(a)} 100%)` : `linear-gradient(${d(a)}, ${d(a)})`;
      const url = new URL(c.bgImage, document.baseURI).href;
      return `${shade}, url("${url}") ${POSITIONS[c.bgPos] || 'center'} / ${c.bgFit === 'contain' ? 'contain' : 'cover'} no-repeat, var(--surface-secondary)`;
    }
    return '';
  }
  function surface(el, c) {
    if (!el || !c) return;
    const bg = BGS.includes(c.widgetBg) ? c.widgetBg : 'theme';
    const hv = HOVERS.includes(c.hover) ? c.hover : '';
    const reveal = hv === 'surface' || hv === 'surface-lift';
    const bw = typeof c.borderWidth === 'number' && c.borderWidth > 0 ? Math.min(4, c.borderWidth) : 0;
    const shadow = SHADOWS[c.shadow] !== undefined ? c.shadow : '';
    const glow = pct(c.cardGlow, 0);
    const blur = typeof c.bgBlur === 'number' ? Math.max(0, Math.min(24, c.bgBlur)) : 0;
    const scale = typeof c.contentScale === 'number' ? Math.max(80, Math.min(130, c.contentScale)) / 100 : 1;
    // GLASS blur and CONTENT SIZE (on the root; removed again when set back)
    if (blur) { el.style.setProperty('backdrop-filter', `blur(${blur}px) saturate(1.2)`); el.style.setProperty('-webkit-backdrop-filter', `blur(${blur}px) saturate(1.2)`); el.dataset.iqBlur = String(blur); }
    else if ('iqBlur' in el.dataset) { el.style.removeProperty('backdrop-filter'); el.style.removeProperty('-webkit-backdrop-filter'); delete el.dataset.iqBlur; }
    if (scale !== 1) { el.style.zoom = String(scale); el.style.width = `${100 / scale}%`; el.style.height = `${100 / scale}%`; el.dataset.iqScale = String(scale); }
    else if ('iqScale' in el.dataset) { el.style.zoom = ''; el.style.width = ''; el.style.height = ''; delete el.dataset.iqScale; }
    const styled = !!(bw || shadow || glow || ['light', 'dark'].includes(c.textTone) || colourOf(c.accentColor));
    const layered = bg !== 'theme' || reveal || bw > 0;
    const was = el.classList.contains('iq-wsurf');
    if (!layered && !styled && (!hv || hv === 'none') && !was) return;    // Theme, nothing custom: the widget is untouched
    el.classList.add('iq-wsurf');
    el.classList.toggle('iq-wsurf--layered', layered);
    el.dataset.iqBg = bg;
    if (hv) el.dataset.iqHover = hv; else delete el.dataset.iqHover;
    // transparent with a border: the layer stays (fully visible) to draw the border, with no fill
    const a = bg === 'transparent' ? (bw ? 1 : 0) : PAINTED.includes(bg) ? pct(c.widgetBgOpacity, 100) / 100 : 1;
    const set = (k, v) => { if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v); };
    set('--iq-bg-a', String(a));
    set('--iq-hover-a', String(pct(c.hoverOpacity, 30) / 100));
    set('--iq-glow', String(pct(c.hoverGlow, 40) / 100));
    set('--iq-lift', `${Math.max(0, Math.min(12, typeof c.hoverLift === 'number' ? c.hoverLift : 4))}px`);
    set('--iq-hover-ms', `${Math.max(0, Math.min(600, typeof c.hoverMs === 'number' ? c.hoverMs : 180))}ms`);
    const col = colourOf(c.hoverColor);
    if (col) set('--iq-hover-c', col); else el.style.removeProperty('--iq-hover-c');
    el.classList.toggle('iq-wsurf--tint', !!col);
    el.classList.toggle('iq-wsurf--shadow', !shadow && !glow && ((bg === 'opacity' && a >= 0.5) || (layered && ['solid', 'gradient', 'image'].includes(bg))));
    // the CONTENT's colours on this card: Text colour (light / dark, e.g. on a bright gradient or a photo) and Accent colour (icons,
    // active states, highlights) — custom properties only, inherited by everything inside; absent = the theme's
    if (['light', 'dark'].includes(c.textTone)) el.dataset.iqText = c.textTone; else delete el.dataset.iqText;
    const acc = colourOf(c.accentColor);
    if (acc) { set('--accent', acc); set('--accent-hot', acc); set('--accent-soft', `color-mix(in srgb, ${acc} 16%, transparent)`); set('--accent-line', `color-mix(in srgb, ${acc} 45%, transparent)`); el.dataset.iqAccent = ''; }
    else if ('iqAccent' in el.dataset) { ['--accent', '--accent-hot', '--accent-soft', '--accent-line'].forEach((k) => el.style.removeProperty(k)); delete el.dataset.iqAccent; }
    // the card's own shadow and glow (on the root: they sit outside the card)
    const parts = [];
    if (shadow && shadow !== 'none') parts.push(SHADOWS[shadow]);
    if (glow) { const g = colourOf(c.cardGlowColor) || 'var(--accent)'; parts.push(`0 0 ${Math.round(6 + glow * 0.34)}px ${Math.round(glow * 0.06)}px color-mix(in srgb, ${g} ${Math.round(18 + glow * 0.5)}%, transparent)`); }
    el.classList.toggle('iq-wsurf--own-shadow', !!(shadow || glow));
    if (shadow || glow) set('--iq-own-shadow', parts.length ? parts.join(', ') : 'none'); else el.style.removeProperty('--iq-own-shadow');
    const paint = paintOf(c) || (bg === 'transparent' && bw ? 'transparent' : '');
    const border = bw ? `${bw}px ${BORDER_STYLES.includes(c.borderStyle) ? c.borderStyle : 'solid'} ${colourOf(c.borderColor) || 'var(--border-primary)'}` : '';
    if (el.__iqSurface) { el.__iqSurface.update(paint, border); el.__iqSurface.refresh(); return; }
    // the layer that redraws the root's own surface, and its capture (re-run when the widget changes its state / attributes)
    const layer = document.createElement('span');
    layer.className = 'iq-wsurf__layer'; layer.setAttribute('aria-hidden', 'true');
    let q = 0, own = paint, edge = border;
    const KEYS = ['backgroundImage', 'backgroundColor', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat'];
    function capture() {
      q = 0;
      if (!el.isConnected) return;
      if (el.classList.contains('iq-wsurf--layered') && layer.parentNode !== el) el.append(layer);
      el.setAttribute('data-iq-bg-read', '');                            // the shared override paused for one read (no paint in between)
      const cs = getComputedStyle(el), v = Object.fromEntries(KEYS.map((k) => [k, cs[k]])), sh = cs.boxShadow, position = cs.position;
      el.removeAttribute('data-iq-bg-read');
      if (own) { if (layer.style.background !== own) { KEYS.forEach((k) => { layer.style[k] = ''; }); layer.style.background = own; } }
      else { layer.style.background = ''; KEYS.forEach((k) => { if (layer.style[k] !== v[k]) layer.style[k] = v[k]; }); }
      if (layer.style.border !== edge) layer.style.border = edge;
      set('--iq-theme-shadow', sh && sh !== 'none' ? sh : '0 0 0 0 transparent');
      if (position === 'static') el.style.position = 'relative';
    }
    const later = () => { if (!q) q = requestAnimationFrame(capture); };
    const mo = new MutationObserver((list) => { if (list.some((m) => m.type === 'childList' || (m.attributeName !== 'data-iq-bg-read' && m.attributeName !== 'style'))) later(); else if (list.some((m) => m.attributeName === 'style')) later(); });
    mo.observe(el, { attributes: true, childList: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!el.isConnected) { ro.disconnect(); mo.disconnect(); return; } later(); }) : null;
    if (ro) ro.observe(el);
    /* THEME CHANGES: the layer holds RESOLVED colours (a copy of the root's computed background and shadow), so a theme put on an
       ancestor (the dashboard, a preview scope) must trigger a new read — before, only the widget's own mutations or a resize did, which
       is why a resize sometimes "made the theme appear". A transition of the root's own background / shadow is read again when it ends. */
    el.setAttribute('data-theme-reads', ''); el.__iqThemeRefresh = later;      // components/theme asks it to read again on a theme change
    el.addEventListener('transitionend', (e) => { if (e.target === el && /background|box-shadow/.test(e.propertyName)) later(); });
    el.__iqSurface = { refresh: later, update: (p, b) => { own = p; edge = b; } };
    later();
  }
  /** APPEARANCE PRESETS: one choice sets several of the settings above (the owner can change each afterwards). */
  const APPEARANCE_PRESETS = {
    glass: { label: 'Glass', set: { widgetBg: 'opacity', widgetBgOpacity: 55, borderWidth: 1, borderColor: '#ffffff', borderStyle: 'solid', shadow: 'soft' }, clear: ['textTone', 'accentColor', 'bgColor', 'bgFrom', 'bgVia', 'bgTo', 'bgAngle', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'cardGlow', 'cardGlowColor'] },
    midnight: { label: 'Midnight gradient', set: { widgetBg: 'gradient', bgFrom: '#1c2438', bgTo: '#0d111b', bgAngle: 160, shadow: 'strong' }, clear: ['textTone', 'accentColor', 'bgColor', 'bgVia', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'widgetBgOpacity', 'borderWidth', 'borderColor', 'borderStyle', 'cardGlow', 'cardGlowColor'] },
    ember: { label: 'Ember (warm, active)', set: { widgetBg: 'gradient', bgFrom: '#ffb04a', bgVia: '#ff7a2f', bgTo: '#e2541f', bgAngle: 135, cardGlow: 45, cardGlowColor: '#ff8a3d', shadow: 'soft', textTone: 'light', accentColor: '#ffffff' }, clear: ['bgColor', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'widgetBgOpacity', 'borderWidth', 'borderColor', 'borderStyle'] },
    sunlit: { label: 'Sunlit (yellow, active)', set: { widgetBg: 'gradient', bgFrom: '#ffd45c', bgTo: '#f5a623', bgAngle: 135, cardGlow: 40, cardGlowColor: '#ffc23d', shadow: 'soft', textTone: 'light', accentColor: '#ffffff' }, clear: ['bgColor', 'bgVia', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'widgetBgOpacity', 'borderWidth', 'borderColor', 'borderStyle'] },
    aurora: { label: 'Aurora (blue glow)', set: { widgetBg: 'gradient', bgFrom: '#17325e', bgVia: '#132443', bgTo: '#0c1426', bgShape: 'radial', borderWidth: 1, borderColor: '#4fa8f5', borderStyle: 'solid', cardGlow: 30, cardGlowColor: '#4fa8f5' }, clear: ['textTone', 'accentColor', 'bgColor', 'bgAngle', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'widgetBgOpacity', 'shadow'] },
    outline: { label: 'Outline', set: { widgetBg: 'transparent', borderWidth: 1, borderColor: '#ffffff', borderStyle: 'solid', shadow: 'none' }, clear: ['textTone', 'accentColor', 'bgColor', 'bgFrom', 'bgVia', 'bgTo', 'bgAngle', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'widgetBgOpacity', 'cardGlow', 'cardGlowColor'] },
    photo: { label: 'Photo card (choose an image)', set: { widgetBg: 'image', bgFit: 'cover', bgPos: 'center', bgOverlay: 55, bgOverlayMode: 'bottom', shadow: 'strong', textTone: 'light' }, clear: ['bgColor', 'bgFrom', 'bgVia', 'bgTo', 'bgAngle', 'bgShape', 'widgetBgOpacity', 'borderWidth', 'borderColor', 'borderStyle', 'cardGlow', 'cardGlowColor'] },
    theme: { label: 'Theme (reset)', set: {}, clear: ['textTone', 'accentColor', 'widgetBg', 'widgetBgOpacity', 'bgColor', 'bgFrom', 'bgVia', 'bgTo', 'bgAngle', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode', 'borderWidth', 'borderColor', 'borderStyle', 'shadow', 'cardGlow', 'cardGlowColor'] },
  };
  function applyAppearancePreset(c, id) {
    const p = APPEARANCE_PRESETS[id]; if (!p || !c) return c;
    p.clear.forEach((k) => { delete c[k]; });
    Object.assign(c, p.set);
    return cleanSurface(c);
  }

  global.IniqWidgetKit = {
    surface, cleanSurface, HOVERS, APPEARANCE_PRESETS, applyAppearancePreset, SURFACE_IMAGE: IMAGE,
    historyLayer,
    corners, cleanCorners, CORNERS, SHAPES, R_MAX,
    interactions, actionOf, cleanInteractions, GESTURES, ACTIONS, ENTITY_ACTIONS, TIMING: T, CONTROLS,
    visibility, evaluate, cleanVisibility, OPS, MODES,
  };
  if (global.IniqComponents) global.IniqComponents.define('surface', { name: 'Widget surface', category: 'visual', module: 'IniqWidgetKit.surface',
    contract: { widgetBg: "'theme' (absent) | 'transparent' | 'opacity'", widgetBgOpacity: '%', hover: HOVERS.join(' | '), hoverOpacity: '%', hoverColor: "token | '#rrggbb'",
      hoverGlow: '%', hoverLift: 'px (visual only)', hoverMs: 'ms' },
    capabilities: ['background (theme · transparent · opacity)', 'hover (surface · glow · lift)', 'never touches the content'], state: 'surface(root, config) — the widget root' });
})(window);
