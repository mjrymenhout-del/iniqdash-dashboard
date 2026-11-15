/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqVisuals — the shared INTERACTIVE VISUAL FRAMEWORK: primitives a widget composes instead of building its own.

     HOME ASSISTANT STATE → normalised IniqDash state / capabilities (components/ha: bindings) → a VIEW (plain data the
     widget derives from its CONFIRMED state) → VISUAL CONDITIONS (data, never code) → layer / control / ring / badge
     → rendered widget.

   Home Assistant stays authoritative: a primitive never sends anything. Device visuals (layers, rings, badges) are fed
   the CONFIRMED view only (what HA reported — or, for an unlinked demo widget, its own state). A control only reports
   the user's intent (onAction); the widget routes it through its existing secure channel (onChange → IniqHA.call →
   api/ha_call.php: the server picks the service; no service names here) and shows the result when HA confirms it.

   Every spec is DATA (JSON-safe: what a future Widget Studio can write). It is cleaned before use: unknown keys,
   unknown animation types, unknown icons and out-of-range numbers are dropped. Nothing is ever evaluated.

   1. VIEW        { state, available, active?, value?, <named numbers / strings>… } — e.g. { state: 'on', available:
                  true, speed: 60 }. Built by the widget from its confirmed state; the framework only reads it.
   2. CONDITION   IniqVisuals.match(cond, view) → boolean.   cond (all keys optional, all must hold):
                    { state: 'on' | ['on','heat'] }   { stateNot: 'off' }   { available: true | false }   { active: true }
                    { key: 'speed', above: 0 }  { below: 20 }  { between: [20, 80] }  { key: 'mode', equals: 'eco' }
                    { all: [cond…] }  { any: [cond…] }  { not: cond }       (above / below / between read view[key], or
                  view.value without a key; a missing / non-numeric value never matches a numeric test)
   3. LAYERS      IniqVisuals.layers([{ target: Element, rules: [rule…] }]) → { update(view), destroy() }
                  rule = { when: cond, animate: { type, duration?, speed?, intensity?, direction?, easing?, distance? } }
                  The FIRST matching rule wins; no match → the layer is at rest (no animation). Types:
                    continuous  rotate · pulse · breathe · oscillate · slide            (stopped by reduced motion)
                                · flow (dots travelling along an SVG stroke — its dash pattern; direction 'reverse' = backwards)
                    state       glow · fade · scale · translate                      (static, follows the value — stays)
                    one-shot    emphasis   (plays when view[animate.on || 'value'] changes; skipped with reduced motion)
                  Parameters: a number, or a MAPPING from the view: { from: 'speed', range: [0, 100], to: [2.6, 0.4] }
                    duration (s, .2–30) · intensity (0–1) · distance (px, 0–48) · direction ('normal' | 'reverse' | 'up'
                    | 'down' | 'left' | 'right') · easing ('linear' | 'ease' | 'ease-in-out' | 'ease-out')
                  IniqVisuals.stack(defs) → { el, layer(id) }: declared, aligned layers (each fills the stack):
                    defs = [{ id, kind: 'image' | 'icon' | 'text' | 'background' | 'overlay' | 'svg', src?, icon?, text?,
                    svg? (TRUSTED widget code only — never from configuration), className? }]
   4. RING        IniqVisuals.ring({ label, min: 0, max: 100, thickness: .07, gap: .04, start: 0, sweep: 360, tone,
                  tones: [{ when: cond, tone }] }) → { el, wrap(content), update({ value, available, min?, max? }) }
                  Sized by its box (the widget's own responsive size); the content sits inside the ring. No value →
                  no ring at all (never a fabricated one); unavailable → the track only.
   5. BADGE       IniqVisuals.badge({ position: 'br' | 'bl' | 'tr' | 'tl', shape: 'circle' | 'rect', rules: [{ when, icon,
                  text, tone, label }] }) → { el, attach(anchor), update(view) }   first matching rule; none → hidden.
                  Scales with --iqv-anchor (the anchor's size, set by the widget) — so it follows the widget's size.
   6. CONTROL STRIP  IniqVisuals.controlStrip({ name, placement: 'top' | 'bottom' | 'overlay' | 'inline' (left / right: not yet), caps,
                  controls: [spec…], onAction(id, value) , host }) → { el, control(id), update(view, { confirmed }),
                  pending(id, on), destroy() }
                  spec = { id, kind: 'button' | 'toggle' | 'slider' | 'select' | 'value' | 'icon' | 'status', label,
                  icon, requires: ['speed'], bind: 'speed', priority: 1 | 2 | 3, classes: {…}, steps / min / max / step,
                  options: [{ value, label }], text: { on, off }, unit, decimals }
                  slider: steps (segments) or a continuous min…max on a step grid counted from min (negative ranges and
                  decimal steps included); decimals (0–6) shows the value with that many places (absent: whole numbers);
                  unit follows the value (absent: %). Keys: arrows one step, Page Up / Down a tenth of the range, Home / End.
                  A control exists only when EVERY capability it requires is true in caps (what HA reports AND the
                  widget implements — the widget's normalised capabilities). Priority 3 hides when the widget is
                  compact, 2 when micro (MaisonFit tier). A select shows chips when there is room, else a Flyout.
                  Every control is [data-iq-control]: a press never starts a card gesture or a widget drag.
   7. FLYOUT      IniqVisuals.flyout({ anchor, label, options: [{ value, label }], value, onSelect }) → { open(), close(),
                  isOpen() }  a small widget-attached list above the dashboard: kept on screen, closes on an outside
                  press / Escape / Tab away / resize, keyboard (arrows, Home / End, Enter), never resizes the widget,
                  never a grid item; inside a modal dialog it opens in the dialog (top layer).

   Performance: continuous motion is CSS only (no JS loops, no timers per primitive); ONE IntersectionObserver pauses
   the animations of widgets that are off screen. Reduced motion (prefers-reduced-motion) stops continuous and
   one-shot motion; state treatments (glow / fade / scale / translate), rings, badges and controls stay.
   ========================================================================== */
(function (global) {
  'use strict';

  const fin = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const prim = (v) => ['string', 'number', 'boolean'].includes(typeof v);
  const reduced = () => !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------------------------------------------------------- icons (by NAME only — configuration never carries SVG) */
  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    home: S('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v8.5h11V10"/>'),
    away: S('<path d="M5 12h12M13 7l5 5-5 5"/>'),
    zone: S('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
    check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    alert: S('<path d="M12 7v6M12 17h.01"/>'),
    offline: S('<path d="M5 5l14 14"/><path d="M8.5 12.5a5 5 0 0 1 3.5-1.5M3.5 9a12 12 0 0 1 4-2.5M20.5 9a12 12 0 0 0-6.7-3"/>'),
    power: S('<path d="M12 4v7.5"/><path d="M7 7.3a7 7 0 1 0 10 0"/>'),
    play: S('<path d="M8 5.5v13l10-6.5z"/>'),
    pause: S('<path d="M9 6v12M15 6v12"/>'),
    bolt: S('<path d="M13 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z"/>'),
    flame: S('<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-9-1.5 2-2 3-2 5-1-1-2-2-2-3.5C8 9 6 11.5 6 15a6 6 0 0 0 6 6z"/>'),
    snow: S('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>'),
    lock: S('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
    unlock: S('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2"/>'),
    motion: S('<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 2.5 2v4M7 12l3-3.5 3.5 1 2.5 3"/>'),
    battery: S('<rect x="3.5" y="7.5" width="15" height="9" rx="2"/><path d="M21 10.5v3"/>'),
    more: S('<path d="m7 10 5 5 5-5"/>'),
  };
  const iconOf = (name) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : '');

  /* ---------------------------------------------------------------- conditions (data only) */
  const COND_KEYS = ['state', 'stateNot', 'available', 'active', 'key', 'above', 'below', 'between', 'equals', 'all', 'any', 'not'];
  function cleanCond(c, depth = 0) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || depth > 4) return null;
    const out = {};
    for (const k of COND_KEYS) {
      if (!(k in c)) continue;
      const v = c[k];
      if (k === 'all' || k === 'any') { if (Array.isArray(v)) out[k] = v.slice(0, 12).map((x) => cleanCond(x, depth + 1)).filter(Boolean); }
      else if (k === 'not') { const n = cleanCond(v, depth + 1); if (n) out.not = n; }
      else if (k === 'state' || k === 'stateNot') { const l = [].concat(v).filter(prim).slice(0, 12).map(String); if (l.length) out[k] = l; }
      else if (k === 'available' || k === 'active') out[k] = !!v;
      else if (k === 'key') { if (typeof v === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(v)) out.key = v; }
      else if (k === 'above' || k === 'below') { if (fin(v) !== null) out[k] = Number(v); }
      else if (k === 'between') { if (Array.isArray(v) && v.length === 2 && fin(v[0]) !== null && fin(v[1]) !== null) out.between = [Math.min(+v[0], +v[1]), Math.max(+v[0], +v[1])]; }
      else if (k === 'equals') { if (prim(v)) out.equals = String(v); }
    }
    return out;
  }
  function match(c, v = {}) {
    if (!c) return true;
    if (c.all && !c.all.every((x) => match(x, v))) return false;
    if (c.any && !c.any.some((x) => match(x, v))) return false;
    if (c.not && match(c.not, v)) return false;
    if (c.available !== undefined && !!v.available !== c.available) return false;
    if (c.active !== undefined && !!v.active !== c.active) return false;
    if (c.state && !c.state.includes(String(v.state))) return false;
    if (c.stateNot && c.stateNot.includes(String(v.state))) return false;
    const raw = c.key ? v[c.key] : v.value;
    if (c.equals !== undefined && String(raw) !== c.equals) return false;
    if (c.above !== undefined || c.below !== undefined || c.between) {
      const n = fin(raw);
      if (n === null) return false;
      if (c.above !== undefined && !(n > c.above)) return false;
      if (c.below !== undefined && !(n < c.below)) return false;
      if (c.between && !(n >= c.between[0] && n <= c.between[1])) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- animation vocabulary */
  const TYPES = {
    rotate: 'continuous', pulse: 'continuous', breathe: 'continuous', oscillate: 'continuous', slide: 'continuous', flow: 'continuous',
    glow: 'state', fade: 'state', scale: 'state', translate: 'state', emphasis: 'once',
  };
  const DIRS = ['normal', 'reverse', 'up', 'down', 'left', 'right'];
  const EASES = { linear: 'linear', ease: 'ease', 'ease-in-out': 'ease-in-out', 'ease-out': 'ease-out' };
  const LIMITS = { duration: [0.2, 30], intensity: [0, 1], distance: [0, 48] };
  /** a parameter: a number, or a mapping from a view key { from, range: [a, b], to: [x, y] } (clamped to its limits) */
  function cleanParam(p, k) {
    const [lo, hi] = LIMITS[k];
    if (fin(p) !== null) return clamp(Number(p), lo, hi);
    if (p && typeof p === 'object' && typeof p.from === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(p.from)) {
      const r = Array.isArray(p.range) && p.range.length === 2 && p.range.every((x) => fin(x) !== null) ? p.range.map(Number) : [0, 100];
      const t = Array.isArray(p.to) && p.to.length === 2 && p.to.every((x) => fin(x) !== null) ? p.to.map((x) => clamp(Number(x), lo, hi)) : [lo, hi];
      return { from: p.from, range: r, to: t };
    }
    return undefined;
  }
  const resolve = (p, v) => {
    if (typeof p === 'number') return p;
    if (!p) return undefined;
    const n = fin(v[p.from]);
    if (n === null) return p.to[0];
    const f = p.range[1] === p.range[0] ? 1 : clamp((n - p.range[0]) / (p.range[1] - p.range[0]), 0, 1);
    return p.to[0] + (p.to[1] - p.to[0]) * f;
  };
  function cleanAnim(a) {
    if (!a || typeof a !== 'object' || !TYPES[a.type]) return null;
    const out = { type: a.type };
    // "speed" is an alias of duration (a faster fan = a shorter turn): kept as given, read the same way
    const d = cleanParam(a.duration ?? a.speed, 'duration'); if (d !== undefined) out.duration = d;
    const i = cleanParam(a.intensity, 'intensity'); if (i !== undefined) out.intensity = i;
    const s = cleanParam(a.distance, 'distance'); if (s !== undefined) out.distance = s;
    if (DIRS.includes(a.direction)) out.direction = a.direction;
    if (EASES[a.easing]) out.easing = EASES[a.easing];
    if (a.type === 'emphasis' && typeof a.on === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(a.on)) out.on = a.on;
    return out;
  }
  const cleanRule = (r) => (r && typeof r === 'object' ? { when: cleanCond(r.when) || {}, animate: cleanAnim(r.animate) } : null);

  /* ONE IntersectionObserver: an off-screen widget's animations pause (CSS: [data-iqv-off] … paused) */
  const offscreen = (() => {
    let io = null;
    return (el) => {
      if (typeof IntersectionObserver !== 'function' || !el) return () => {};
      io = io || new IntersectionObserver((list) => list.forEach((e) => {
        if (e.isIntersecting) delete e.target.dataset.iqvOff; else e.target.dataset.iqvOff = '';
      }), { rootMargin: '64px' });
      io.observe(el);
      return () => io.unobserve(el);
    };
  })();

  const VARS = ['--iqv-dur', '--iqv-int', '--iqv-dist', '--iqv-ease'];
  function applyAnim(el, a, v) {
    if (!a || a.type === 'emphasis') {
      if (el.dataset.iqvAnim) delete el.dataset.iqvAnim;
      if (el.dataset.iqvDir) delete el.dataset.iqvDir;
      VARS.forEach((k) => el.style.removeProperty(k));
      return;
    }
    if (el.dataset.iqvAnim !== a.type) el.dataset.iqvAnim = a.type;
    if (a.direction) el.dataset.iqvDir = a.direction; else delete el.dataset.iqvDir;
    const set = (k, val, unit = '') => { if (val === undefined) el.style.removeProperty(k); else { const t = `${+val.toFixed(3)}${unit}`; if (el.style.getPropertyValue(k) !== t) el.style.setProperty(k, t); } };
    set('--iqv-dur', resolve(a.duration, v), 's');
    set('--iqv-int', resolve(a.intensity, v));
    set('--iqv-dist', resolve(a.distance, v), 'px');
    if (a.easing) el.style.setProperty('--iqv-ease', a.easing); else el.style.removeProperty('--iqv-ease');
  }
  /** one-shot emphasis: restarted by toggling the attribute; removed on animationend (no timers) */
  function emphasise(el) {
    if (reduced()) return;
    delete el.dataset.iqvEmph;
    void el.offsetWidth;                                 // restart the keyframes
    el.dataset.iqvEmph = '';
    el.addEventListener('animationend', () => { delete el.dataset.iqvEmph; }, { once: true });
  }

  function layers(defs) {
    const list = (defs || []).filter((d) => d && d.target && d.target.nodeType === 1).map((d) => ({
      el: d.target, rules: (d.rules || []).slice(0, 16).map(cleanRule).filter(Boolean), last: {},
    }));
    const unobs = [];
    const roots = new Set(list.map((l) => l.el.closest('[data-fit]') || l.el));
    roots.forEach((r) => unobs.push(offscreen(r)));
    list.forEach((l) => { l.el.dataset.iqvLayer = ''; });
    function update(view = {}) {
      list.forEach((l) => {
        const rule = l.rules.find((r) => match(r.when, view));
        const a = rule ? rule.animate : null;
        applyAnim(l.el, a, view);
        l.el.dataset.iqvRest = a && TYPES[a.type] !== 'once' ? 'false' : 'true';
        // emphasis rules: when their watched value changes (and the rule matches), play once
        l.rules.filter((r) => r.animate && r.animate.type === 'emphasis').forEach((r) => {
          const key = r.animate.on || 'value', val = view[key];
          if (key in l.last && l.last[key] !== val && match(r.when, view)) emphasise(l.el);
          l.last[key] = val;
        });
      });
    }
    return { update, destroy() { unobs.forEach((u) => u()); list.forEach((l) => applyAnim(l.el, null)); } };
  }

  const KINDS = ['image', 'icon', 'text', 'background', 'overlay', 'svg'];
  function stack(defs) {
    const el = document.createElement('div');
    el.className = 'iqv-stack';
    const map = new Map();
    (defs || []).forEach((d) => {
      if (!d || !KINDS.includes(d.kind)) return;
      const n = document.createElement(d.kind === 'image' ? 'img' : d.kind === 'text' ? 'span' : 'div');
      n.className = `iqv-layer iqv-layer--${d.kind}${d.className ? ` ${d.className}` : ''}`;
      if (d.kind === 'image') { n.alt = ''; n.decoding = 'async'; n.draggable = false; if (typeof d.src === 'string') n.src = d.src; }
      else if (d.kind === 'icon') n.innerHTML = iconOf(d.icon);
      else if (d.kind === 'text') n.textContent = String(d.text ?? '');
      else if (d.kind === 'svg' && typeof d.svg === 'string') n.innerHTML = d.svg;   // trusted widget code only
      if (d.id) { n.dataset.iqvId = d.id; map.set(d.id, n); }
      el.append(n);
    });
    return { el, layer: (id) => map.get(id) || null };
  }

  /* ---------------------------------------------------------------- progress / status ring */
  const TONES = ['accent', 'success', 'warning', 'danger', 'info', 'neutral', 'muted'];
  const tone = (t) => (TONES.includes(t) ? t : 'accent');
  let uid = 0;
  function ring(opts = {}) {
    const o = {
      label: typeof opts.label === 'string' ? opts.label.slice(0, 60) : '',
      min: fin(opts.min) ?? 0, max: fin(opts.max) ?? 100,
      thickness: clamp(fin(opts.thickness) ?? 0.07, 0.02, 0.25), gap: clamp(fin(opts.gap) ?? 0.04, 0, 0.2),
      start: fin(opts.start) ?? 0, sweep: clamp(fin(opts.sweep) ?? 360, 30, 360),
      tone: tone(opts.tone), tones: (opts.tones || []).slice(0, 8).map((x) => x && { when: cleanCond(x.when) || {}, tone: tone(x.tone) }).filter(Boolean),
    };
    const el = document.createElement('div');
    el.className = 'iqv-ring';
    el.dataset.empty = '';
    const sw = o.thickness * 100, r = 50 - sw / 2, C = 2 * Math.PI * r, arc = (C * o.sweep) / 360;
    el.style.setProperty('--iqv-ring-t', o.thickness);
    el.style.setProperty('--iqv-ring-gap', o.gap);
    // a full ring starts at the top; a partial ring has its gap centred at the bottom. `start` turns it (degrees, clockwise)
    const rot = (o.sweep >= 360 ? -90 : 90 + (360 - o.sweep) / 2) + o.start;
    el.innerHTML = `<svg class="iqv-ring__svg" viewBox="0 0 100 100" aria-hidden="true" style="transform: rotate(${rot}deg)">
      <circle class="iqv-ring__track" cx="50" cy="50" r="${r}" stroke-width="${sw}" stroke-dasharray="${arc} ${C}"/>
      <circle class="iqv-ring__bar" cx="50" cy="50" r="${r}" stroke-width="${sw}" stroke-dasharray="0 ${C}"/></svg>
      <div class="iqv-ring__c"></div>`;
    const bar = el.querySelector('.iqv-ring__bar'), c = el.querySelector('.iqv-ring__c');
    el.id = `iqv-ring-${++uid}`;
    function update(d = {}) {
      const min = fin(d.min) ?? o.min, max = fin(d.max) ?? o.max, v = fin(d.value);
      const avail = d.available !== false;
      if (v === null && avail) {                          // no value: no ring (never a made-up one)
        el.dataset.empty = ''; delete el.dataset.na; el.removeAttribute('role'); el.removeAttribute('aria-label');
        return;
      }
      delete el.dataset.empty;
      if (!avail || v === null) {
        el.dataset.na = ''; el.dataset.zero = 'true'; el.dataset.full = 'false'; bar.setAttribute('stroke-dasharray', `0 ${C}`);
        el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${o.label || 'Progress'}: unavailable`);
        return;
      }
      delete el.dataset.na;
      const f = max === min ? 0 : clamp((v - min) / (max - min), 0, 1);
      bar.setAttribute('stroke-dasharray', `${(arc * f).toFixed(2)} ${C}`);
      el.dataset.zero = String(f <= 0);
      el.dataset.full = String(f >= 1);
      const t = (o.tones.find((x) => match(x.when, { value: v, available: true })) || {}).tone || o.tone;
      el.dataset.tone = t;
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', `${o.label || 'Progress'}: ${Math.round(f * 100)}%`);
    }
    update({});
    return { el, wrap(content) { if (content) c.append(content); return el; }, update, fraction: (v) => clamp(((fin(v) ?? 0) - o.min) / ((o.max - o.min) || 1), 0, 1) };
  }

  /* ---------------------------------------------------------------- state badge */
  const POS = ['tl', 'tr', 'bl', 'br'];
  function badge(opts = {}) {
    const pos = POS.includes(opts.position) ? opts.position : 'br';
    const rules = (opts.rules || []).slice(0, 16).map((r) => r && ({
      when: cleanCond(r.when) || {}, icon: iconOf(r.icon) ? r.icon : '', text: typeof r.text === 'string' ? r.text.slice(0, 24) : '',
      tone: tone(r.tone), label: typeof r.label === 'string' ? r.label.slice(0, 60) : '',
    })).filter(Boolean);
    const el = document.createElement('span');
    el.className = 'iqv-badge';
    el.dataset.pos = pos;
    el.dataset.shape = opts.shape === 'rect' ? 'rect' : 'circle';
    el.setAttribute('aria-hidden', 'true');              // the widget writes the state in words; the badge is the glance
    el.hidden = true;
    let cur = null;
    function update(view = {}) {
      const r = rules.find((x) => match(x.when, view)) || null;
      if (r === cur) return;
      cur = r;
      el.hidden = !r || (!r.icon && !r.text);
      if (!r) { el.innerHTML = ''; return; }
      el.dataset.tone = r.tone;
      el.dataset.text = r.text ? 'yes' : 'no';
      el.innerHTML = `${iconOf(r.icon)}${r.text ? '<b class="iqv-badge__t"></b>' : ''}`;
      if (r.text) el.querySelector('b').textContent = r.text;
      if (r.label) el.title = r.label; else el.removeAttribute('title');
    }
    return { el, attach(anchor) { if (anchor) { anchor.classList.add('iqv-anchor'); anchor.append(el); } return el; }, update, current: () => cur };
  }

  /* ---------------------------------------------------------------- flyout (small, widget-attached secondary choices) */
  let openFly = null;
  const FLY_MAX = 200;                                         // options a flyout lists (it scrolls; a select may have many)
  function flyout(opts = {}) {
    const anchor = opts.anchor;
    let options = (opts.options || []).filter((x) => x && prim(x.value)).slice(0, FLY_MAX).map((x) => ({ value: String(x.value), label: String(x.label ?? x.value) }));
    let value = opts.value === undefined || opts.value === null ? null : String(opts.value);
    const fid = `iqv-fly-${++uid}`;
    let box = null;
    if (anchor) { anchor.setAttribute('aria-haspopup', 'listbox'); anchor.setAttribute('aria-expanded', 'false'); anchor.setAttribute('aria-controls', fid); }

    function place() {
      if (!box) return;
      const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = global.innerHeight, M = 8;
      box.style.maxHeight = '';
      box.style.minWidth = `${Math.max(140, Math.round(r.width))}px`;
      const bw = box.offsetWidth, bh = box.offsetHeight;
      const below = vh - r.bottom - M, above = r.top - M;
      const up = bh > below && above > below;
      const room = Math.max(120, up ? above : below) - 6;
      if (bh > room) box.style.maxHeight = `${room}px`;
      const h = Math.min(bh, room);
      let left = r.left + r.width / 2 - bw / 2;
      left = clamp(left, M, Math.max(M, vw - bw - M));
      const top = up ? Math.max(M, r.top - 6 - h) : Math.min(vh - M - h, r.bottom + 6);
      // inside a modal dialog the box is positioned in the dialog's top layer (fixed still means the viewport)
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      box.dataset.side = up ? 'top' : 'bottom';
    }
    const items = () => (box ? [...box.querySelectorAll('.iqv-flyout__o')] : []);
    function render() {
      box.innerHTML = '';
      options.forEach((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'iqv-flyout__o';
        b.setAttribute('role', 'option');
        b.dataset.value = x.value;
        b.setAttribute('aria-selected', String(x.value === value));
        b.tabIndex = -1;
        b.textContent = x.label;
        b.addEventListener('click', () => choose(x.value));
        box.append(b);
      });
    }
    function choose(v) {
      const prev = value;
      close(true);
      if (v !== prev && typeof opts.onSelect === 'function') opts.onSelect(v, prev);
    }
    const onDown = (e) => { if (box && !box.contains(e.target) && !anchor.contains(e.target)) close(false); };
    const onKey = (e) => {
      if (!box) return;
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]; if (n) n.focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const n = e.key === 'Home' ? list[0] : list[list.length - 1]; if (n) n.focus(); }
      else if (e.key === 'Tab') close(false);
    };
    const onMove = () => { if (box) place(); };
    function open() {
      if (box || !anchor || !anchor.isConnected || !options.length) return;
      if (openFly && openFly !== api) openFly.close(false);
      box = document.createElement('div');
      box.className = 'iqv-flyout';
      box.id = fid;
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', String(opts.label || 'Choose'));
      box.dataset.iqControl = '';
      render();
      (anchor.closest('dialog[open]') || document.body).append(box);
      place();
      anchor.setAttribute('aria-expanded', 'true');
      openFly = api;
      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('keydown', onKey, true);
      global.addEventListener('resize', onMove);
      global.addEventListener('scroll', onMove, true);
      const sel = items().find((b) => b.getAttribute('aria-selected') === 'true') || items()[0];
      if (sel) sel.focus({ preventScroll: true });
    }
    function close(refocus) {
      if (!box) return;
      box.remove(); box = null;
      if (openFly === api) openFly = null;
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      global.removeEventListener('resize', onMove);
      global.removeEventListener('scroll', onMove, true);
      if (refocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    }
    const api = {
      open, close: (refocus = false) => close(refocus), toggle() { if (box) close(true); else open(); }, isOpen: () => !!box,
      set(patch = {}) {
        if (patch.options) options = patch.options.filter((x) => x && prim(x.value)).slice(0, FLY_MAX).map((x) => ({ value: String(x.value), label: String(x.label ?? x.value) }));
        if ('value' in patch) value = patch.value === null || patch.value === undefined ? null : String(patch.value);
        if (box) { render(); place(); }
      },
      el: () => box,
    };
    return api;
  }

  /* ---------------------------------------------------------------- controls + control strip */
  const CTL_KINDS = ['button', 'toggle', 'slider', 'select', 'value', 'icon', 'status'];
  const cls = (base, extra) => (extra ? `${base} ${extra}` : base);
  /** one control from a spec; ctx = { name, act(id, value, commit), host } */
  function control(spec, ctx) {
    const k = spec.classes || {};
    const label = String(spec.label || spec.id);
    let el, upd;
    if (spec.kind === 'button' || spec.kind === 'toggle') {
      el = document.createElement('button');
      el.type = 'button';
      el.className = cls(`iqv-ctl iqv-ctl--${spec.kind}`, k.root);
      el.innerHTML = `${spec.icon ? `<span class="${cls('iqv-ctl__i', k.icon)}">${iconOf(spec.icon)}</span>` : ''}<span class="${cls('iqv-ctl__t', k.text)}"></span>`;
      const t = el.querySelector('.iqv-ctl__t');
      if (spec.kind === 'toggle') el.setAttribute('aria-pressed', 'false');
      el.addEventListener('click', () => { if (!el.disabled) ctx.act(spec.id, spec.kind === 'toggle' ? el.getAttribute('aria-pressed') !== 'true' : true, true); });
      upd = (v) => {
        const val = v[spec.bind || spec.id], on = val === true || val === 'on';
        if (spec.kind === 'toggle') el.setAttribute('aria-pressed', String(on));
        const word = spec.kind === 'toggle' ? (on ? spec.text?.on ?? 'On' : spec.text?.off ?? 'Off') : spec.text?.on ?? '';
        t.textContent = word; t.hidden = !word;
        el.setAttribute('aria-label', `${ctx.name} ${label}${spec.kind === 'toggle' ? `: ${v.available === false ? 'Unavailable' : on ? 'On' : 'Off'}` : ''}`);
        el.disabled = v.available === false;
      };
    } else if (spec.kind === 'slider') {
      const steps = Math.max(0, Math.min(20, Math.round(fin(spec.steps) ?? 0)));
      const min = fin(spec.min) ?? 0, max = fin(spec.max) ?? 100;
      const stepPct = steps ? (max - min) / steps : fin(spec.step) > 0 ? fin(spec.step) : 1;
      const dec = fin(spec.decimals) === null ? null : clamp(Math.round(fin(spec.decimals)), 0, 6);
      const tidy = (x) => Number(x.toFixed(dec ?? 10));        // no float dust (0.1 + 0.2) in a reported value
      el = document.createElement('div');
      el.className = cls('iqv-ctl iqv-ctl--slider', k.root);
      el.setAttribute('role', 'slider');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${ctx.name} ${label}`);
      el.setAttribute('aria-valuemin', String(min));
      el.setAttribute('aria-valuemax', String(max));
      el.innerHTML = (steps ? Array.from({ length: steps }, (_, i) => `<span class="${cls('iqv-seg', k.seg)}" style="--i:${i}"><i></i></span>`).join('') : `<span class="${cls('iqv-fill', k.fill)}"></span>`)
        + `<b class="${cls('iqv-ctl__v', k.value)}"></b>`;
      let cur = null, live = true, drag = false, from = null, touch = null;
      const snap = (x) => clamp(steps ? Math.max(stepPct, Math.round((x - min) / stepPct) * stepPct + min) : tidy(min + Math.round((x - min) / stepPct) * stepPct), steps ? min + stepPct : min, max);
      const fmt = (x) => (dec === null ? String(Math.round(x)) : x.toFixed(dec));
      const fromX = (x) => {
        const segs = el.querySelectorAll('.iqv-seg');
        const a = steps ? segs[0].getBoundingClientRect().left : el.getBoundingClientRect().left;
        const b = steps ? segs[segs.length - 1].getBoundingClientRect().right : el.getBoundingClientRect().right;
        if (steps) return min + (Math.min(steps - 1, Math.max(0, Math.floor(((x - a) / (b - a)) * steps))) + 1) * stepPct;
        return min + clamp((x - a) / (b - a), 0, 1) * (max - min);
      };
      const show = (val, on) => {
        const lit = on && val !== null ? Math.round((val - min) / (stepPct || 1)) : 0;
        el.querySelectorAll('.iqv-seg').forEach((s, i) => s.classList.toggle('is-on', i < lit));
        const fill = el.querySelector('.iqv-fill'); if (fill) fill.style.setProperty('--f', on && val !== null ? (val - min) / (max - min) : 0);
        const txt = on && val !== null ? `${fmt(val)}${spec.unit ?? '%'}` : spec.text?.off ?? 'Off';
        el.querySelector('.iqv-ctl__v').textContent = txt;
        el.setAttribute('aria-valuenow', String(on && val !== null ? (dec === null ? Math.round(val) : Number(fmt(val))) : min));
        el.setAttribute('aria-valuetext', txt);
      };
      // Mouse / pen: press and drag. Touch: a vertical swipe stays a page scroll (touch-action: pan-y); a tap or a
      // sideways drag sets the value. While dragging the control shows the drag (feedback); the value is reported on release.
      el.addEventListener('pointerdown', (e) => {
        if (!live) return;
        from = cur;
        if (e.pointerType === 'touch') { touch = { x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
        drag = true; el.setPointerCapture(e.pointerId); cur = snap(fromX(e.clientX)); show(cur, true); ctx.act(spec.id, cur, false);
      });
      el.addEventListener('pointermove', (e) => {
        if (touch && !drag && Math.abs(e.clientX - touch.x) > 8 && Math.abs(e.clientX - touch.x) > Math.abs(e.clientY - touch.y)) { drag = true; el.setPointerCapture(touch.id); }
        if (drag) { cur = snap(fromX(e.clientX)); show(cur, true); ctx.act(spec.id, cur, false); }
      });
      const end = (e, tap) => {
        if (tap && touch && !drag) { cur = snap(fromX(e.clientX)); show(cur, true); }
        const changed = (drag || (tap && touch)) && cur !== from;
        drag = false; touch = null;
        if (changed) ctx.act(spec.id, cur, true);
        from = null;
      };
      el.addEventListener('pointerup', (e) => end(e, true));
      el.addEventListener('pointercancel', () => { if (drag && from !== null) { cur = from; show(cur, true); ctx.act(spec.id, cur, false); } drag = false; touch = null; from = null; });
      el.addEventListener('keydown', (e) => {
        if (!live) return;
        const base = cur ?? min;
        const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
        let v = null;
        if (e.key in map) v = base + map[e.key] * (stepPct || 1); else if (e.key === 'Home') v = steps ? min + stepPct : min; else if (e.key === 'End') v = max;
        else if (!steps && (e.key === 'PageUp' || e.key === 'PageDown')) v = base + (e.key === 'PageUp' ? 1 : -1) * Math.max(stepPct, Math.round((max - min) / 10 / stepPct) * stepPct);
        if (v === null) return;
        e.preventDefault();
        cur = snap(v); show(cur, true); ctx.act(spec.id, cur, true);
      });
      upd = (v) => {
        live = v.available !== false && v.enabled !== false;
        const val = fin(v[spec.bind || spec.id]);
        const on = v.active !== false && val !== null;
        if (!drag) { cur = on ? val : null; show(cur, on); }
        el.setAttribute('aria-disabled', String(!live));
        el.tabIndex = live ? 0 : -1;
      };
    } else if (spec.kind === 'select') {
      el = document.createElement('div');
      el.className = cls('iqv-ctl iqv-ctl--select', k.root);
      el.setAttribute('role', 'radiogroup');
      el.setAttribute('aria-label', `${ctx.name} ${label}`);
      let opts = (spec.options || []).filter((x) => x && prim(x.value ?? x)).map((x) => (typeof x === 'object' ? { value: String(x.value), label: String(x.label ?? x.value) } : { value: String(x), label: String(x) }));
      let value = null, live = true;
      const chips = opts.map((x) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls('iqv-chip', k.chip); b.setAttribute('role', 'radio'); b.dataset.value = x.value; b.textContent = x.label;
        b.addEventListener('click', () => { if (live && x.value !== value) ctx.act(spec.id, x.value, true); });
        el.append(b);
        return b;
      });
      const more = document.createElement('button');
      more.type = 'button';
      more.className = cls('iqv-select__more', k.trigger);
      more.innerHTML = `<span class="${cls('iqv-select__k', k.triggerKey)}"></span><span class="${cls('iqv-select__v', k.triggerValue)}"></span><span class="iqv-select__i" aria-hidden="true">${ICONS.more}</span>`;
      more.querySelector('.iqv-select__k').textContent = label;
      el.append(more);
      const fly = flyout({ anchor: more, label: `${ctx.name} ${label}`, options: opts, value, onSelect: (v) => { if (live) ctx.act(spec.id, v, true); } });
      more.addEventListener('click', () => { if (live) fly.toggle(); });
      el.addEventListener('keydown', (e) => {                 // arrow keys move within the chips (radio group)
        const i = chips.indexOf(document.activeElement);
        if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
        e.preventDefault();
        const n = chips[(i + (e.key === 'ArrowRight' ? 1 : -1) + chips.length) % chips.length];
        n.focus(); n.click();
      });
      upd = (v) => {
        live = v.available !== false && v.enabled !== false;
        value = v[spec.bind || spec.id] === null || v[spec.bind || spec.id] === undefined ? null : String(v[spec.bind || spec.id]);
        chips.forEach((b, i) => {
          const sel = b.dataset.value === value;
          b.setAttribute('aria-checked', String(sel));
          b.tabIndex = sel || (value === null && i === 0) ? 0 : -1;
          b.disabled = !live;
        });
        const lbl = (opts.find((x) => x.value === value) || {}).label || (value ?? '—');
        more.querySelector('.iqv-select__v').textContent = lbl;
        more.setAttribute('aria-label', `${ctx.name} ${label}: ${lbl}. Choose`);
        more.disabled = !live;
        fly.set({ value });
        if (!live) fly.close();
      };
      el.flyout = fly;
    } else {                                                  // value · icon · status (display only)
      el = document.createElement('span');
      el.className = cls(`iqv-ctl iqv-ctl--${spec.kind}`, k.root);
      el.innerHTML = `${spec.icon ? `<span class="${cls('iqv-ctl__i', k.icon)}">${iconOf(spec.icon)}</span>` : ''}${spec.kind === 'status' ? '<i class="iqv-dot" aria-hidden="true"></i>' : ''}<span class="${cls('iqv-ctl__t', k.text)}"></span>`;
      upd = (v) => {
        const val = v[spec.bind || spec.id];
        const t = v.available === false ? 'Unavailable' : val === null || val === undefined ? '' : `${val}${spec.unit ?? ''}`;
        el.querySelector('.iqv-ctl__t').textContent = t;
        el.dataset.empty = String(!t);
      };
    }
    el.dataset.iqControl = '';                             // never a card gesture / widget drag
    el.dataset.ctl = spec.id;
    el.dataset.priority = String(spec.priority || 1);
    return { el, spec, update: upd };
  }

  const PLACEMENTS = ['top', 'bottom', 'overlay', 'inline'];
  function controlStrip(opts = {}) {
    const caps = opts.caps || {};
    const name = String(opts.name || 'Widget');
    const el = document.createElement('div');
    el.className = cls('iqv-strip', opts.className);
    el.dataset.place = PLACEMENTS.includes(opts.placement) ? opts.placement : 'bottom';
    el.dataset.iqControl = '';
    const specs = (opts.controls || []).filter((s) => s && CTL_KINDS.includes(s.kind) && typeof s.id === 'string'
      && (s.requires || []).every((r) => caps[r] === true));
    const ctx = {
      name,
      act(id, value, commit) {
        if (commit && opts.pendingUntilConfirmed) pending(id, true);
        if (typeof opts.onAction === 'function') opts.onAction(id, value, { commit });
      },
    };
    const ctls = new Map(specs.map((s) => { const c = control(s, ctx); el.append(c.el); return [s.id, c]; }));
    function pending(id, on) { const c = ctls.get(id); if (!c) return; if (on) c.el.dataset.pending = ''; else delete c.el.dataset.pending; }
    function update(view = {}, meta = {}) {
      ctls.forEach((c) => { c.update(view); if (meta.confirmed) delete c.el.dataset.pending; });
    }
    // own size (MaisonFit): priority 3 gives way when compact, 2 when micro; a select becomes a flyout when narrow
    let off = null;
    if (opts.host && global.MaisonFit) {
      off = global.MaisonFit.on(opts.host, (info) => {
        el.dataset.tier = info.tier;
        el.dataset.mode = ['m', 'l', 'xl'].includes(info.wc) ? 'chips' : 'flyout';
        ctls.forEach((c) => { if (c.spec.kind === 'select' && el.dataset.mode === 'chips' && c.el.flyout) c.el.flyout.close(); });
      });
    }
    return {
      el, update, pending,
      control: (id) => (ctls.get(id) || {}).el || null,
      has: (id) => ctls.has(id),
      destroy() { if (off) off(); ctls.forEach((c) => c.el.flyout && c.el.flyout.close()); },
    };
  }

  global.IniqVisuals = Object.freeze({
    match, clean: Object.freeze({ condition: cleanCond, animation: cleanAnim, rule: cleanRule }),
    layers, stack, ring, badge, flyout, controlStrip, control,
    ICONS: Object.freeze({ ...ICONS }), TYPES: Object.freeze({ ...TYPES }), reducedMotion: reduced,
  });
})(window);
