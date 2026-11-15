/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqIcons — the shared Material Design Icons (MDI) layer: the icons, and the reusable icon PICKER of the configuration.

   The icons are the MDI library (Pictogrammers, Apache-2.0, v7.4.47) shipped with IniqDash as ONE local file, assets/mdi/mdi-icons.json
   ({ "fan": "<svg path>", … }, ~7,400 icons). It is fetched from IniqDash itself only when needed (a picker opens, or a widget shows an
   "mdi:…" icon), once per page, and cached by the browser — never from the internet.

   An icon is named as everywhere in Home Assistant: "mdi:<name>" (e.g. mdi:thermometer). '' / undefined = no icon.
     IniqIcons.load()            → Promise<boolean>  the library (true when loaded)
     IniqIcons.svg(id)           → '<svg …>' | null  synchronous once loaded (null: not loaded yet, or no such icon)
     IniqIcons.fill(root)        draws every [data-mdi] inside root (now, or as soon as the library is there)
     IniqIcons.search(q, limit)  → [name…]  names matching every word of q (prefix matches first); limited — never the whole library
     IniqIcons.picker({ value, onPick(id|''), label }) → HTMLElement  the compact field: [icon · mdi:name ▾]; opens a searchable list
     IniqIcons.background(el, kind)  a fallback icon's surface: none · subtle (default) · accent  ([data-iqi-bg], icons.css)
     IniqIcons.animate(el, kind, run)  an ICON ANIMATION on that icon element only (never its card / text): kind one of ANIMATIONS
                                 (allow-listed: an attribute the shared stylesheet animates — no CSS, no names from outside); run false → still.
                                 prefers-reduced-motion: reduce → still (icons.css).
   ========================================================================== */
(function (global) {
  'use strict';

  const URL = 'assets/mdi/mdi-icons.json';
  const ID = /^mdi:[a-z0-9-]{1,64}$/;
  let lib = null, loading = null;
  const pending = new Set();
  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c !== null && c !== undefined && n.append(c));
    return n;
  };
  /** a path from the library as an inline SVG (the path data is the library's own: letters, digits, spaces, dots, signs only) */
  const draw = (d) => (typeof d === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9 .,eE+-]+$/.test(d)
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>` : null);

  function load() {
    if (lib) return Promise.resolve(true);
    if (!loading) {
      loading = fetch(URL, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        lib = j && typeof j === 'object' ? j : null;
        if (!lib) { loading = null; return false; }
        pending.forEach((el) => { if (el.isConnected) paint(el); }); pending.clear();
        return true;
      }).catch(() => { loading = null; return false; });
    }
    return loading;
  }
  const nameOf = (id) => (typeof id === 'string' && ID.test(id) ? id.slice(4) : null);
  function svg(id) { const n = nameOf(id); return n && lib ? draw(lib[n]) : null; }
  function paint(el) { const s = svg(el.dataset.mdi); if (s) el.innerHTML = s; }
  function fill(root) {
    if (!root) return;
    const els = [...(root.matches && root.matches('[data-mdi]') ? [root] : []), ...root.querySelectorAll('[data-mdi]')];
    if (!els.length) return;
    if (lib) { els.forEach(paint); return; }
    els.forEach((el) => pending.add(el));
    load();
  }
  /** every word of q in the name; names starting with the first word first; then shorter names */
  function search(q, limit = 60) {
    if (!lib) return [];
    const words = String(q || '').toLowerCase().trim().replace(/^mdi:/, '').split(/[\s,]+/).filter(Boolean);
    const names = Object.keys(lib);
    if (!words.length) return COMMON.filter((n) => lib[n]).slice(0, limit);
    const hits = names.filter((n) => words.every((w) => n.includes(w)));
    const first = words[0];
    hits.sort((a, b) => (b === first) - (a === first) || (b.startsWith(first)) - (a.startsWith(first)) || a.length - b.length || a.localeCompare(b));
    return hits.slice(0, limit);
  }
  /** shown before anything is typed: everyday home icons */
  const COMMON = ['thermometer', 'water-percent', 'fan', 'lightbulb', 'lamp', 'door', 'window-closed-variant', 'television', 'power', 'flash',
    'battery', 'weather-sunny', 'weather-night', 'weather-windy', 'leaf', 'molecule-co2', 'gauge', 'home', 'sofa', 'bed', 'movie-open', 'music',
    'star', 'speaker', 'air-conditioner', 'radiator', 'blinds', 'garage', 'lock', 'motion-sensor', 'robot-vacuum', 'washing-machine', 'coffee'];

  let uid = 0;
  function picker({ value = '', onPick, label = 'Icon' } = {}) {
    const id = `iqi-${++uid}`;
    let current = typeof value === 'string' && ID.test(value) ? value : '';
    const prev = h('span', { class: 'iqi__prev', 'aria-hidden': 'true' });
    const name = h('span', { class: 'iqi__name' });
    const field = h('button', { type: 'button', class: 'iqi__field', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': `${id}-panel`, 'data-k': 'icon-field' },
      [prev, name, h('span', { class: 'iqi__chev', 'aria-hidden': 'true', text: '▾' })]);
    const qIn = h('input', { type: 'search', class: 'iqi__search', placeholder: 'Search icons — e.g. fan, door, water', autocomplete: 'off', spellcheck: 'false', 'aria-label': `Search ${label.toLowerCase()}s` });
    const info = h('p', { class: 'iqi__info', role: 'status' });
    const list = h('div', { class: 'iqi__list', role: 'listbox', 'aria-label': label });
    const panel = h('div', { class: 'iqi__panel', id: `${id}-panel`, hidden: true }, [qIn, info, list]);
    const root = h('div', { class: 'iqi' }, [field, panel]);

    function show() {
      prev.dataset.mdi = current; prev.replaceChildren();
      if (current) fill(prev); else prev.append(h('span', { class: 'iqi__none', text: '—' }));
      name.textContent = current || 'No icon';
      name.classList.toggle('iqi__name--none', !current);
      field.setAttribute('aria-label', `${label}: ${current ? current.slice(4).replace(/-/g, ' ') : 'none'}`);
    }
    function option(n) {
      const v = n ? `mdi:${n}` : '';
      const b = h('button', { type: 'button', role: 'option', class: 'iqi__opt', 'aria-selected': String(v === current), 'data-icon': v, title: v || 'No icon', onclick: () => pick(v) },
        [h('span', { class: 'iqi__ic', 'aria-hidden': 'true', ...(n ? {} : { text: '—' }) }), h('span', { class: 'iqi__on', text: n ? n : 'No icon' })]);
      if (n) b.firstChild.innerHTML = draw(lib[n]) || '';
      return b;
    }
    const LIMIT = 60;
    function render() {
      if (!lib) { info.textContent = 'Loading icons…'; list.replaceChildren(); return; }
      const q = qIn.value.trim(), hits = search(q, LIMIT + 1);
      info.textContent = q ? (hits.length ? `${hits.length > LIMIT ? `First ${LIMIT}` : hits.length} matching “${q.slice(0, 30)}”${hits.length > LIMIT ? ' — type more to narrow' : ''}` : `No icon matches “${q.slice(0, 30)}”`) : 'Common icons — or search all Material Design Icons';
      list.replaceChildren(...(q ? [] : [option('')]), ...hits.slice(0, LIMIT).map(option));
    }
    function open(on) {
      panel.hidden = !on;
      field.setAttribute('aria-expanded', String(on));
      if (on) { qIn.value = ''; render(); load().then(() => { if (!panel.hidden) render(); }); qIn.focus(); }
    }
    function pick(v) { current = v; show(); open(false); field.focus(); onPick && onPick(v); }
    field.addEventListener('click', () => open(panel.hidden));
    qIn.addEventListener('input', render);
    qIn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open(false); field.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('button')?.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); }
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open(false); field.focus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const bs = [...list.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      e.preventDefault();
      (bs[i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1)] || (i <= 0 ? qIn : bs[i]))?.focus();
    });
    show();
    root.iconPicker = { value: () => current, set: (v) => { current = typeof v === 'string' && ID.test(v) ? v : ''; show(); } };
    return root;
  }

  /** the icon animations (components/icons/icons.css: [data-iqi-anim="<kind>"]) and when they run */
  const ANIMATIONS = ['none', 'rotate', 'pulse', 'breathe', 'shake', 'bounce', 'swing', 'flash'];
  const ANIMATE_WHEN = ['active', 'always'];
  function animate(el, kind, run) {
    if (!el) return;
    if (run && kind !== 'none' && ANIMATIONS.includes(kind)) { if (el.dataset.iqiAnim !== kind) el.dataset.iqiAnim = kind; } else if ('iqiAnim' in el.dataset) delete el.dataset.iqiAnim;
  }

  /** the ICON BACKGROUND of a fallback icon (components/icons/icons.css [data-iqi-bg]): 'none' · 'subtle' · 'accent' — anything else
      (or absent: an icon saved before the choice existed) is 'subtle'. Only the glyph animates inside a background. */
  const BACKGROUNDS = ['none', 'subtle', 'accent'];
  function background(el, kind) {
    if (!el) return;
    const k = BACKGROUNDS.includes(kind) ? kind : 'subtle';
    if (el.dataset.iqiBg !== k) el.dataset.iqiBg = k;
  }

  /** the shared ICON PRESENTATION (IconConfig) of ONE icon element — the same for every context (Information, a fallback icon, …):
      cfg = { icon: 'mdi:…' (the glyph — redrawn only when it changes; none: the element is emptied), color?: <token> | '#rrggbb' (the
      element's own colour — absent / invalid: the context's; a context that tints more than the icon sets its own custom property
      instead and passes none), background?: 'none' | 'subtle' | 'accent' (present only when the context passes the key: absent = no
      surface; an unknown value = subtle), animation?: one of ANIMATIONS }.
      run: whether the animation runs NOW — decided by the owner from its own state ("active" / "always"); this never reads any state.
      The SIZE belongs to the layout context (its own custom property): a background is padding around the glyph — never a smaller glyph. */
  const TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const colourOf = (v) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : '') : '');
  function present(el, cfg = {}, { run = false } = {}) {
    if (!el) return el;
    const id = typeof cfg.icon === 'string' && ID.test(cfg.icon) ? cfg.icon : '';
    if ((el.dataset.mdi || '') !== id) { if (id) el.dataset.mdi = id; else delete el.dataset.mdi; el.replaceChildren(); if (id) fill(el); }
    if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    if ('color' in cfg) { const c = colourOf(cfg.color); if (c) el.style.color = c; else el.style.removeProperty('color'); }
    if ('background' in cfg) { if (cfg.background === undefined || cfg.background === null) delete el.dataset.iqiBg; else background(el, cfg.background); }
    const kind = typeof cfg.animation === 'string' ? cfg.animation : 'none';
    animate(el, kind, !!run && kind !== 'none');
    return el;
  }

  global.IniqIcons = { load, svg, fill, search, picker, animate, background, present, colour: colourOf, ANIMATIONS, ANIMATE_WHEN, BACKGROUNDS, ID, loaded: () => !!lib };
  if (global.IniqComponents) global.IniqComponents.define('icon', { name: 'Icon', category: 'visual', module: 'IniqIcons.present',
    render: (cfg = {}, { run = false } = {}) => present(document.createElement('span'), cfg, { run }),
    contract: { icon: "'mdi:…' — the glyph", color: "design-token name or '#rrggbb'", background: "'none' | 'subtle' | 'accent'", animation: ANIMATIONS.join(' | '),
      animateWhen: "'active' | 'always' — read by the OWNER, which passes run", size: 'px — the layout context’s own custom property' },
    capabilities: ['glyph', 'colour', 'background', 'animation'], state: '{ run } — whether the animation runs now',
    // standalone: one icon in its own box (the glyph's size is iconSize — never the box's; a background is padding around it)
    compose: { defaults: { icon: 'mdi:star-outline', iconSize: 56, color: 'accent' }, data: { active: true }, box: { w: 56, h: 56 }, min: { w: 16, h: 16 },
      editor: { fields: ['icon', 'iconSize', 'color', 'iconBg', 'animation', 'animateWhen'], over: { iconSize: { min: 8, max: 240 } }, custom: true },
      // CENTRE: the icon keeps its own Icon size, centred in its box (a normal resize changes the box only); with a background the
      // visual is the glyph + padding (22 % a side: × 1.44 — never a smaller glyph); a visual that outgrows its box grows the box
      resize: { mode: 'center', aspect: 'square',
        toBox: (c, p, b) => { if (c.iconSize === p.iconSize && c.iconBg === p.iconBg) return null; const s = Math.round((typeof c.iconSize === 'number' ? c.iconSize : 40) * (['subtle', 'accent'].includes(c.iconBg) ? 1.44 : 1));
          return s > b.w || s > b.h ? { w: Math.max(b.w, s), h: Math.max(b.h, s) } : null; } },
      // SCALE (Shift + resize): the Icon size in proportion (its background padding follows it)
      scale: { props: { iconSize: [8, 240] }, base: (c) => ({ iconSize: typeof c.iconSize === 'number' ? c.iconSize : 40 }) },
      dataFields: [{ key: 'data.active', type: 'boolean', label: 'Entity active (preview)', group: 'data' }],
      render: (c, d = {}) => {
        const el = document.createElement('span');
        el.className = 'iqi-solo';
        return solo(el, c, d);
      },
      update: (el, c, d) => { solo(el, c, d); return true; } } });
  /** a standalone icon's presentation (create and update alike): its size, then the shared presentation */
  function solo(el, c, d = {}) {
    const size = typeof c.iconSize === 'number' && Number.isFinite(c.iconSize) ? Math.min(240, Math.max(8, c.iconSize)) : 40;
    el.style.setProperty('--iqi-size', `${size}px`);
    const anim = typeof c.animation === 'string' ? c.animation : 'none';
    return present(el, { icon: c.icon, color: c.color, background: ['subtle', 'accent'].includes(c.iconBg) ? c.iconBg : null, animation: anim },
      { run: anim !== 'none' && (c.animateWhen === 'always' || !!d.active) });
  }
})(window);
