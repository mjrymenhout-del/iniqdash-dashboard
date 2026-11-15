/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Notifications V1 — event-driven information, separate from popups.

     Event  →  Notification Rule  →  Notification Template  →  rendered notification

   MaisonNotify.createEvents() → bus            the ONE event bus
     bus.emit(id, payload?)                     id: namespaced, e.g. 'demo.front_door_open'
     bus.on(fn(id, payload)) → off()
   Today a demo source emits demo.* ids (editor: "Fire" buttons). Later a Home Assistant source
   emits ha.* ids (state changes, HA events, thresholds) into the same bus — rules and templates
   do not change.

   MaisonNotify.createRules({ bus, rules: () => [], templates: () => [], center }) → engine
     rules     = [{ id, name?, event, template, enabled }]       (live getters: the model)
     templates = [{ id, name, config }]
     For every emitted event, each ENABLED rule whose `event` equals the id shows its template.
     engine.log  [{ event, rule, template, nid }]
     (Rule matching is one function — match(rule, id, payload) — so conditions on the payload,
     e.g. HA entity / to-state / threshold, can be added without touching templates or the renderer.)

   MaisonNotify.createCenter({ layer, icons }) → center          the renderer
     center.show(config, { template?, source? }) → nid   config = MaisonRegistry.DEFS.notification
     center.dismiss(nid, reason)   reason: 'close' | 'timeout' | 'overflow' | 'api'
     center.active() → [{ nid, template, position }] ; center.queued() → number ; center.log
   MaisonNotify.build(config, { icons, onClose }) → Element     ONE notification element (the screen, the editor's live preview
     and Test on screen all draw with it); config.design (optional) is its own look — see cleanDesign / lookOf below.
   Positions: top-left · top-center · top-right · center · bottom-left · bottom-center · bottom-right. Edge positions STACK: newest
   nearest the edge, a fixed 10px gap, at most 4 per position and never more than fit the VISIBLE screen (the oldest is dismissed
   with reason 'overflow'). On a narrow screen (< 640px) the positions of an edge share one full-width stack, so they cannot
   overlap. The CENTER position is a FIFO QUEUE: one centre notification at a time; the next appears when the current one is
   dismissed. Every stack covers the VISIBLE part of the screen layer (--scr-vis-*, MaisonApp.createScreen) in the layer's logical
   px: a scaled device preview, a screen taller than the window or a scrolled page never moves a notification out of view, and a
   notification never grows past it (its content scrolls inside).
   Timed notifications dismiss after `duration` seconds; persistent ones stay until closed.
   Animations: same names as popups; prefers-reduced-motion → instant.
   ========================================================================== */
(function (global) {
  'use strict';

  const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  /** every screen position: the four corners, the middle of the top / bottom edge, the centre */
  const POSITIONS = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
  const MAX_PER_CORNER = 4;
  const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  // same rule as the registry / model SAFE_URL: shared assets, widget package assets, uploaded user assets (served by the protected
  // asset endpoint), https and inline images (older templates only — the designer offers built-ins and uploads)
  const SAFE_IMG = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+)$/;
  const animate = (el, name, speed, out) => (global.MaisonPopup ? global.MaisonPopup.animate(el, name, speed, out) : Promise.resolve());

  /* ---------------------------------------------------------------- DESIGN (the notification's own look — optional)
     config.design = { width?, height?, maxWidth? (% of the screen), padding?, margin? (to the screen edges), align?,
       bgColor?, bgAlpha? (0–100: the BACKGROUND only), blur?, borderColor?, borderWidth?, shadow?, corners?, radius?,
       radii? (custom corners: { tl, tr, bl, br } × { shape: normal | concave, r } — the shared corner control),
       titleColor?, titleSize?, titleWeight?, msgColor?, msgSize?, msgWeight?, textAlign?, iconShow?, iconSize?, iconColor?,
       imageLayout? ('none' | 'thumb' | 'background' | 'hero' | 'left' | 'right'), imageFit?, imagePos?, imageOpacity?, heroHeight?,
       sideWidth?, overlayColor?, overlayAlpha?, preset? }
     Absent = the Standard look (exactly the notification as it always was). Every value is allow-listed here too: a colour is a
     design-token NAME or "#rrggbb", a size a clamped number — nothing else reaches a style. */
  const TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral', 'text-primary', 'text-secondary', 'text-muted', 'surface-primary', 'surface-secondary', 'border-primary'];
  const HEX = /^#[0-9a-f]{6}$/i;
  const LAYOUTS = ['none', 'thumb', 'background', 'hero', 'left', 'right'];
  const SHADOWS = { none: '0 0 #0000', soft: '0 8px 22px -12px rgba(0, 0, 0, .6)', medium: '0 18px 40px -16px rgba(0, 0, 0, .85)', strong: '0 26px 60px -14px rgba(0, 0, 0, .95)' };
  const CORNER_R = { square: 0, slight: 6, rounded: 18, full: 999 };
  const RANGES = { width: [160, 1600], height: [48, 1200], maxWidth: [20, 100], padding: [0, 48], margin: [0, 96], bgAlpha: [0, 100], blur: [0, 30], borderWidth: [0, 8],
    radius: [0, 80], titleSize: [10, 48], msgSize: [9, 32], iconSize: [12, 72], imageOpacity: [0, 100], heroHeight: [48, 400], sideWidth: [32, 320], overlayAlpha: [0, 100] };
  const CHOICES = { align: ['left', 'center', 'right'], textAlign: ['left', 'center', 'right'], shadow: Object.keys(SHADOWS), corners: [...Object.keys(CORNER_R), 'custom'],
    titleWeight: ['400', '500', '600', '700', '800'], msgWeight: ['400', '500', '600', '700'], imageLayout: LAYOUTS, imageFit: ['cover', 'contain'],
    imagePos: ['center', 'top', 'bottom', 'left', 'right'], preset: ['standard', 'minimal', 'glass', 'banner', 'image', 'hero'] };
  const COLORS = ['bgColor', 'borderColor', 'titleColor', 'msgColor', 'iconColor', 'overlayColor'];
  /** a clean design object (allow-listed; undefined when nothing is set) */
  function cleanDesign(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined;
    const o = {};
    Object.entries(RANGES).forEach(([k, [lo, hi]]) => { const v = d[k]; if (typeof v === 'number' && Number.isFinite(v)) o[k] = Math.round(Math.min(hi, Math.max(lo, v))); });
    Object.entries(CHOICES).forEach(([k, ok]) => { const v = d[k] === undefined ? undefined : String(d[k]); if (v !== undefined && ok.includes(v)) o[k] = v; });
    COLORS.forEach((k) => { const v = d[k]; if (typeof v === 'string' && (HEX.test(v) || TOKENS.includes(v))) o[k] = v.toLowerCase(); });
    if (d.iconShow === false) o.iconShow = false;
    // custom corners: the shared per-corner control's value (IniqWidgetKit corners — normal / concave, 0–200 px each)
    if (d.radii && typeof d.radii === 'object' && !Array.isArray(d.radii)) {
      const K = ['tl', 'tr', 'bl', 'br'], r = {};
      K.forEach((k) => { const x = d.radii[k]; if (x && typeof x === 'object' && typeof x.r === 'number' && Number.isFinite(x.r)) r[k] = { shape: x.shape === 'concave' ? 'concave' : 'normal', r: Math.round(Math.min(200, Math.max(0, x.r))) }; });
      if (K.every((k) => r[k])) o.radii = r;
    }
    return Object.keys(o).length ? o : undefined;
  }
  const colorOf = (v) => (HEX.test(v) ? v : `var(--${v})`);
  const mix = (col, a) => (a >= 100 ? col : `color-mix(in srgb, ${col} ${a}%, transparent)`);
  /** the design → CSS custom properties on the notification (the stylesheet reads them; nothing else is styled inline) */
  function lookOf(d) {
    const v = {};
    if (!d) return v;
    const px = (n) => `${n}px`;
    if (d.width !== undefined) v['--mnote-w'] = px(d.width);
    if (d.height !== undefined) v['--mnote-h'] = px(d.height);
    if (d.maxWidth !== undefined) v['--mnote-maxw'] = `${d.maxWidth}%`;
    if (d.padding !== undefined) v['--mnote-pad'] = px(d.padding);
    if (d.margin !== undefined) v['--mnote-m'] = px(d.margin);
    const a = d.bgAlpha === undefined ? 100 : d.bgAlpha;
    if (d.bgColor !== undefined) v['--mnote-bg'] = mix(colorOf(d.bgColor), a);
    else if (d.bgAlpha !== undefined) v['--mnote-bg'] = `linear-gradient(165deg, ${mix('var(--surface-primary-top)', a)}, ${mix('var(--surface-primary)', a)})`;
    if (d.blur) v['--mnote-blur'] = px(d.blur);
    if (d.borderColor !== undefined) v['--mnote-bc'] = colorOf(d.borderColor);
    if (d.borderWidth !== undefined) v['--mnote-bw'] = px(d.borderWidth);
    if (d.shadow !== undefined) v['--mnote-shadow'] = SHADOWS[d.shadow];
    if (d.corners !== undefined) v['--mnote-r'] = px(d.corners === 'custom' ? (d.radius === undefined ? 18 : d.radius) : CORNER_R[d.corners]);
    if (d.titleColor !== undefined) v['--mnote-tc'] = colorOf(d.titleColor);
    if (d.titleSize !== undefined) v['--mnote-ts'] = px(d.titleSize);
    if (d.titleWeight !== undefined) v['--mnote-tw'] = d.titleWeight;
    if (d.msgColor !== undefined) v['--mnote-mc'] = colorOf(d.msgColor);
    if (d.msgSize !== undefined) v['--mnote-ms'] = px(d.msgSize);
    if (d.msgWeight !== undefined) v['--mnote-mw'] = d.msgWeight;
    if (d.textAlign !== undefined) v['--mnote-ta'] = d.textAlign;
    if (d.iconSize !== undefined) v['--mnote-is'] = px(d.iconSize);
    if (d.iconColor !== undefined) v['--mnote-ic'] = colorOf(d.iconColor);
    if (d.imageFit !== undefined) v['--mnote-fit'] = d.imageFit;
    if (d.imagePos !== undefined) v['--mnote-ipos'] = d.imagePos;
    if (d.imageOpacity !== undefined) v['--mnote-iop'] = String(d.imageOpacity / 100);
    if (d.heroHeight !== undefined) v['--mnote-hh'] = px(d.heroHeight);
    if (d.sideWidth !== undefined) v['--mnote-sw'] = px(d.sideWidth);
    if (d.overlayColor !== undefined || d.overlayAlpha !== undefined) v['--mnote-ov'] = mix(colorOf(d.overlayColor || 'surface-primary'), d.overlayAlpha === undefined ? 45 : d.overlayAlpha);
    return v;
  }

  function createEvents() {
    const subs = new Set();
    return {
      emit(id, payload) { if (typeof id !== 'string') return; subs.forEach((fn) => { try { fn(id, payload); } catch (e) { console.warn(e); } }); },
      on(fn) { subs.add(fn); return () => subs.delete(fn); },
    };
  }

  /** ONE notification element for a configuration — the renderer the screen, the editor's live preview and Test use alike */
  function build(c, { icons = {}, onClose = null } = {}) {
    const d = cleanDesign(c.design);
    const el = document.createElement('div');
    el.className = 'mnote';
    el.dataset.tone = c.tone || 'info';
    el.dataset.style = c.style || 'card';
    el.setAttribute('role', c.tone === 'danger' || c.tone === 'warning' ? 'alert' : 'status');
    const img = typeof c.image === 'string' && SAFE_IMG.test(c.image) ? c.image : '';
    const layout = img ? (d && d.imageLayout) || 'thumb' : 'none';
    el.dataset.layout = layout;
    if (d) {
      el.dataset.designed = 'true';
      if (d.align) el.dataset.align = d.align;
      if (d.height !== undefined) el.dataset.fixedHeight = 'true';
      if (d.blur) el.dataset.blur = '';
      Object.entries(lookOf(d)).forEach(([k, v]) => el.style.setProperty(k, v));
      // custom corners per corner: the shared widget-kit renderer (the same as a widget's corners)
      if (d.corners === 'custom' && d.radii && global.IniqWidgetKit && global.IniqWidgetKit.corners) global.IniqWidgetKit.corners(el, d.radii);
    }
    const pic = (cls) => { const im = document.createElement('img'); im.className = cls; im.alt = ''; im.decoding = 'async'; im.src = img; return im; };
    if (layout === 'background') {
      const bg = document.createElement('div'); bg.className = 'mnote__bg'; bg.setAttribute('aria-hidden', 'true');
      const ov = document.createElement('div'); ov.className = 'mnote__ov';
      bg.append(pic('mnote__bgimg'), ov); el.append(bg);
    }
    if (layout === 'hero' || layout === 'left' || layout === 'right') { const m = document.createElement('div'); m.className = `mnote__media mnote__media--${layout}`; m.setAttribute('aria-hidden', 'true'); m.append(pic('mnote__mimg')); el.append(m); }
    const main = document.createElement('div'); main.className = 'mnote__main';
    // the icon: a Material Design Icon from the shared picker ("mdi:…", drawn by IniqIcons) — or an older template's built-in icon name
    const mdi = typeof c.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(c.icon);
    if (c.icon && (mdi || icons[c.icon]) && !(d && d.iconShow === false)) {
      const i = document.createElement('span'); i.className = 'mnote__icon'; i.setAttribute('aria-hidden', 'true');
      if (mdi) { i.dataset.mdi = c.icon; if (global.IniqIcons) global.IniqIcons.fill(i); } else i.innerHTML = icons[c.icon];
      main.append(i);
    }
    if (layout === 'thumb') main.append(pic('mnote__img'));
    const txt = document.createElement('div'); txt.className = 'mnote__txt';
    const t = document.createElement('p'); t.className = 'mnote__title'; t.textContent = c.title || ''; txt.append(t);
    if (c.message) { const m = document.createElement('p'); m.className = 'mnote__msg'; m.textContent = c.message; txt.append(m); }
    main.append(txt);
    if (c.closeButton !== false) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mnote__close';
      b.setAttribute('aria-label', `Dismiss ${c.title || 'notification'}`); b.innerHTML = CLOSE;
      if (onClose) b.addEventListener('click', onClose);
      main.append(b);
    }
    el.append(main);
    return el;
  }

  function createCenter({ layer, icons = {} } = {}) {
    const stacks = {};
    POSITIONS.forEach((p) => {
      const s = document.createElement('div');
      s.className = `mnote-stack mnote-stack--${p}`;
      s.dataset.position = p;
      s.setAttribute('aria-live', 'polite');
      layer.append(s);
      stacks[p] = s;
    });
    let n = 0;
    const live = new Map();          // nid → { el, config, position, timer, template }
    const queue = [];                // centre queue: [{ config, meta, nid }]
    const log = [];

    /** a stack never holds more than fits the visible screen: the oldest leave ('overflow'), the newest always stays */
    function fit(lane) {
      const s = stacks[lane];
      const mine = () => [...live.entries()].filter(([, r]) => r.lane === lane && !r.leaving);
      let list = mine();
      if (list.length > MAX_PER_CORNER) { dismiss(list[0][0], 'overflow'); list = mine(); }
      if (!s.clientHeight) return;
      const over = () => { const k = [...s.children].filter((e) => e.style.display !== 'none'); if (!k.length) return false;
        const a = k[0], z = k[k.length - 1]; return a.offsetTop < -1 || z.offsetTop + z.offsetHeight > s.clientHeight + 1; };
      while (list.length > 1 && over()) { const [id, r] = list[0]; dismiss(id, 'overflow'); r.el.style.display = 'none'; list = mine(); }
    }

    function render(nid, config, meta) {
      const c = config || {};
      const pos = stacks[c.position] ? c.position : 'top-right';
      // a narrow screen has room for one column per edge: every position of an edge shares one stack (full width), so two
      // positions can never overlap
      const narrow = layer.offsetWidth > 0 && layer.offsetWidth < 640;
      layer.classList.toggle('mnote-narrow', narrow);
      const lane = narrow && pos !== 'center' ? (pos.startsWith('top') ? 'top-right' : 'bottom-right') : pos;
      const el = build(c, { icons, onClose: () => dismiss(nid, 'close') });
      el.dataset.nid = String(nid);
      el.dataset.position = pos;
      if (meta && meta.template) el.dataset.template = meta.template;
      if (lane.startsWith('top')) stacks[lane].prepend(el); else stacks[lane].append(el);
      const rec = { el, config: c, position: pos, lane, template: meta && meta.template, timer: 0 };
      live.set(nid, rec);
      if (!c.persistent) rec.timer = setTimeout(() => dismiss(nid, 'timeout'), Math.max(1, Number(c.duration) || 5) * 1000);
      animate(el, c.enter || 'fade', c.speed);
      log.push({ nid, event: 'show', position: pos, template: rec.template });
      if (pos !== 'center') fit(lane);
      return nid;
    }
    function show(config, meta = {}) {
      const nid = ++n;
      if ((config && config.position) === 'center' && [...live.values()].some((r) => r.position === 'center' && !r.leaving)) {
        queue.push({ nid, config, meta });
        log.push({ nid, event: 'queued' });
        return nid;
      }
      return render(nid, config, meta);
    }

    function dismiss(nid, reason = 'api') {
      const qi = queue.findIndex((q) => q.nid === nid);
      if (qi >= 0) { queue.splice(qi, 1); log.push({ nid, event: 'dismiss', reason }); return true; }
      const r = live.get(nid);
      if (!r || r.leaving) return false;
      r.leaving = true; clearTimeout(r.timer);
      log.push({ nid, event: 'dismiss', reason });
      r.el.classList.add('is-leaving');
      const done = () => {
        r.el.remove(); live.delete(nid);
        if (r.position === 'center' && queue.length) { const q = queue.shift(); render(q.nid, q.config, q.meta); }
      };
      animate(r.el, r.config.exit || 'fade', r.config.speed, true).then(done, done);
      return true;
    }

    return {
      show, dismiss, log,
      clear() { queue.length = 0; [...live.keys()].forEach((k) => dismiss(k, 'api')); },
      active: () => [...live.entries()].filter(([, r]) => !r.leaving).map(([nid, r]) => ({ nid, template: r.template, position: r.position })),
      queued: () => queue.length,
    };
  }

  /** {name} / {state}… in a template's title and message take the event payload's scalar values (plain text only — the
      renderer sets them with textContent; unknown names stay as written; nothing is evaluated) */
  function fill(config, payload) {
    if (!config || !payload || typeof payload !== 'object') return config;
    const sub = (t) => (typeof t === 'string' ? t.replace(/\{([a-z][a-z0-9_]{0,31})\}/gi, (m, k) => {
      const v = Object.prototype.hasOwnProperty.call(payload, k) ? payload[k] : undefined;
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v).slice(0, 120) : m;
    }) : t);
    return { ...config, title: sub(config.title), message: sub(config.message) };
  }

  function createRules({ bus, rules, templates, center } = {}) {
    const log = [];
    /** V1: the event id must match. Later: payload conditions (entity, to-state, threshold…). */
    const match = (rule, id) => rule.enabled !== false && rule.event === id;
    const off = bus.on((id, payload) => {
      (rules() || []).forEach((rule) => {
        if (!match(rule, id, payload)) return;
        const tpl = (templates() || []).find((t) => t.id === rule.template);
        if (!tpl) return;
        const nid = center.show(fill(tpl.config, payload), { template: tpl.id, source: id, rule: rule.id });
        log.push({ event: id, rule: rule.id, template: tpl.id, nid });
      });
    });
    return { log, match, destroy: off };
  }

  global.MaisonNotify = { createEvents, createCenter, createRules, fill, build, cleanDesign, lookOf, CORNERS, POSITIONS, MAX_PER_CORNER };
})(window);
