/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Popup host V1 — ONE application-level overlay for user-designed popups. A popup does not belong
   to a widget: anything that can REQUEST { type: 'popup', popup: id } (the shared action
   dispatcher: Action widget, Radial segment…) opens it through the host.

   MaisonPopup.createHost({ layer, build(def, key) → Node, key() → 'desktop'|'tablet'|'mobile',
                            viewport() → { w, h }, icons, onChange(openId|null) }) → host
     host.open(def)            def = { id, name, config, items } (a popup definition from the model)
                               Opening a popup while another is open replaces it (V1: one at a time).
     host.close(reason)        'button' | 'escape' | 'outside' | 'api' | 'replace'
     host.current()            the open popup's id, or null
     host.log                  [{ id, event: 'open' | 'close', reason? }] (diagnostics / tests)
   The host owns the overlay only; the popup's CONTENT is built by the application (build) from the
   same items / components / containers as a page (no second widget system).

   config (MaisonRegistry.DEFS.popup):
     title, subtitle, icon, size: 'full' | 'custom' | 'fit', custom: { desktop: { w, h }, tablet: { w, h } },
     closeButton, backButton, menu: 'none' | 'popup' | 'navigate' (+ menuPopup / menuPage), backdrop, outsideClose, escClose,
     image (the header picture; absent = none), hero: 'small' | 'medium' | 'large' | 'full', imageTreatment, overlay, headerAlign,
     titleSize, enter, exit, speed: 'fast' | 'normal' | 'slow'
     showTitle / showSubtitle (false hides them), heroShow (false hides the picture and the information row), titleSize (px, or the
     former 'normal' | 'large'), per button b = back | menu | close: bIcon ('mdi:…'), bSize (28–120 px), bIconSize (12–72 px), bStyle
     'bare' | 'subtle' | 'outline' | 'filled', bShape 'circle' | 'rounded', bTone 'normal' | 'accent', bColor (token name), bPlace 'left' |
     'right' — unset: the former shared buttonStyle / buttonSize look (btnDefault); actionGap (0–40 px), buttonOrder 'menu-close' |
     'close-menu', backAction 'history' | 'popup' | 'navigate' (+ backPopup / backPage),
     heroInfo [{ id, entity, value, label?, showLabel?, icon?, color?, iconBg?, animation?, animateWhen?, slot (horizontal), vslot (vertical),
       style, valueSize?, labelSize?, iconSize?, align?, iconPos, labelPos, valueColor }]
   V2 — a mini-dashboard SURFACE: its header and picture are the popup's; everything else (the room values over the picture,
   tabbed containers, widgets) is ordinary content the application builds. The popup understands no Home Assistant domain.
     Back:  'history' (default) returns to the popup this one REPLACED (opened from inside it), otherwise it closes; or it runs its
            configured request (open a popup · go to a page). Never shown unless configured.
     Menu:  runs its configured request through the application's dispatcher (run({ type: 'popup' | 'navigate', … })).
   MaisonPopup.chrome(cfg, { name, icons, onClose, onBack, onMenu }) → { head, hero, info }   the header and picture (the editor's
     design stage uses the same; without handlers its buttons are inert pictures of themselves).
   Mobile: always a full-width sheet from the bottom (Full Screen: the whole screen).
   Animations: none · fade · scale · slide-up · slide-down · slide-left · slide-right (Web Animations);
   prefers-reduced-motion → no movement (instant).
   ========================================================================== */
(function (global) {
  'use strict';

  const SPEED = { fast: 140, normal: 240, slow: 420 };
  const FRAMES = {
    none: [{}, {}],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    scale: [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }],
    'slide-up': [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'none' }],
    'slide-down': [{ opacity: 0, transform: 'translateY(-32px)' }, { opacity: 1, transform: 'none' }],
    'slide-left': [{ opacity: 0, transform: 'translateX(32px)' }, { opacity: 1, transform: 'none' }],
    'slide-right': [{ opacity: 0, transform: 'translateX(-32px)' }, { opacity: 1, transform: 'none' }],
  };
  const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  const reduced = () => !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** run a named animation on el; resolves when done (instant for none / reduced motion) */
  function animate(el, name, speed, out) {
    const f = FRAMES[name] || FRAMES.fade;
    const ms = name === 'none' || reduced() ? 0 : (SPEED[speed] || SPEED.normal);
    if (!ms || !el.animate) return Promise.resolve();
    const a = el.animate(out ? [f[1], f[0]] : f, { duration: ms, easing: out ? 'cubic-bezier(.4,0,1,1)' : 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    return a.finished.then(() => a.cancel(), () => {});
  }

  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6"/></svg>';
  const MENU = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5.5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="18.5" r="1.9"/></svg>';
  const SAFE_IMG = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+)$/;
  const MDI = /^mdi:[a-z0-9-]{1,64}$/;
  /** design-token NAMES a header button / an information icon may use (never a CSS value) — = MaisonRegistry INFO_COLORS */
  const COLORS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const mdiSpan = (cls, id) => { const s = document.createElement('span'); s.className = cls; s.setAttribute('aria-hidden', 'true'); s.dataset.mdi = id; return s; };
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
  /** a header button's look before it is set: what popups looked like with the former shared buttonStyle / buttonSize (= registry btnDefault) */
  function btnDefault(c, pic) {
    const st = c.buttonStyle && c.buttonStyle !== 'auto' ? c.buttonStyle : pic ? 'glass' : 'solid';
    const look = st === 'plain' ? { style: 'bare', shape: 'rounded' } : st === 'glass' ? { style: 'subtle', shape: 'circle' } : { style: 'filled', shape: 'rounded' };
    const sz = c.buttonSize === 'small' ? [36, 16] : c.buttonSize === 'large' ? [60, 24] : pic ? [52, 20] : [44, 18];
    return { ...look, size: sz[0], icon: sz[1] };
  }
  /** a header button: its own MDI icon (else the built-in glyph), its BUTTON SIZE and ICON SIZE (independent, px), style (bare · subtle ·
      outline · filled), shape (circle · rounded), treatment (normal · accent — theme tokens) and optional token colour; inert without a handler */
  const btn = (cls, label, svg, fn, cfg, b, dflt) => {
    const el = document.createElement(fn ? 'button' : 'span');
    if (fn) { el.type = 'button'; el.addEventListener('click', fn); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
    el.className = `mpop__btn ${cls}`;
    const icon = cfg[`${b}Icon`], color = cfg[`${b}Color`];
    if (typeof icon === 'string' && MDI.test(icon)) el.append(mdiSpan('mpop__btn-ic', icon)); else el.innerHTML = svg;
    if (COLORS.includes(color)) el.style.setProperty('--mpop-btn-c', `var(--${color})`);
    el.style.setProperty('--mpop-btn', `${num(cfg[`${b}Size`], 28, 120) ?? dflt.size}px`);
    el.style.setProperty('--mpop-btn-i', `${num(cfg[`${b}IconSize`], 12, 72) ?? dflt.icon}px`);
    el.dataset.style = ['bare', 'subtle', 'outline', 'filled'].includes(cfg[`${b}Style`]) ? cfg[`${b}Style`] : dflt.style;
    el.dataset.shape = ['circle', 'rounded'].includes(cfg[`${b}Shape`]) ? cfg[`${b}Shape`] : dflt.shape;
    el.dataset.tone = cfg[`${b}Tone`] === 'accent' ? 'accent' : 'normal';
    return el;
  };

  /* HERO INFORMATION (config.heroInfo): an ordered list of values from Home Assistant entities placed in a STRUCTURED 3 × 3 grid of the
     hero area — horizontal left · centre · right × vertical top · centre · bottom (list order inside a cell; several items share a cell
     side by side, never overlapping). No coordinates: the cell is a logical place that reflows on a narrow popup (each row's centre item
     on its own line, its left / right items below it). The area sits BELOW the header (title, Back / Menu / Close), so an item placed top
     left / top right never runs under the title or the buttons; with a picture the area reaches down the picture (the hero height), so
     top / centre / bottom genuinely differ. Each item: presentation card (subtle surface) · emphasis (a large value) · minimal (bare);
     independent value size (s · m · l · xl), label size (s · m · l) and icon size (s · m · l · xl) — absent: the presentation's own;
     text alignment (absent: the presentation's own); the label shown or not (showLabel: false: no label element at all); the icon is
     there only when one is chosen. The popup knows no domain: an item is an entity, what to show of it (its state or one of the values
     IniqHA reports), an optional label and icon. Values come through the SHARED Home Assistant layer (IniqHA.subscribe /
     IniqHA.slots.item — the same poll the widgets use); nothing is fetched here. Without Home Assistant (or before it answers) "—". */
  const SLOTS = ['left', 'center', 'right'];
  const ROWS = ['top', 'center', 'bottom'];
  const CELLS = ROWS.flatMap((r) => SLOTS.map((c) => `${r}-${c}`));
  /** an item's sizes / alignment: its own choice, else its presentation's (the values older items were drawn with) */
  const STYLE_DEFAULT = { card: { v: 'm', l: 's', i: 'm', a: 'start' }, minimal: { v: 'm', l: 's', i: 'm', a: 'start' }, emphasis: { v: 'xl', l: 'm', i: 'l', a: 'center' } };
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  /** the popup's SKIN of the shared information item (IniqInfo.render): its own class names and its own sizes — a number (px, the shared
      Slider + Number) or a former Small…XL name, else the presentation's own (popup.css) */
  const FACT_SKIN = {
    tag: 'div', root: 'mpop__fact', ic: 'mpop__fact-ic', txt: 'mpop__fact-txt', v: 'mpop__fact-v', vTag: 'span', l: 'mpop__fact-l',
    decorate(fact, x) {
      const style = pick(x.style, ['card', 'emphasis', 'minimal'], 'card'), dflt = STYLE_DEFAULT[style];
      fact.dataset.style = style;
      fact.dataset.iconPos = x.iconPos === 'top' ? 'top' : 'start';
      fact.dataset.labelPos = x.labelPos === 'above' ? 'above' : 'below';
      const sized = (k, key, lo, hi, names, d) => {
        const n = num(x[key], lo, hi);
        if (n !== null) { fact.style.setProperty(`--fact-${k}`, `${n}px`); fact.dataset[`${k}size`] = 'n'; } else fact.dataset[`${k}size`] = pick(x[key], names, d);
        return n;
      };
      const vn = sized('v', 'valueSize', 10, 120, ['s', 'm', 'l', 'xl'], dflt.v);
      sized('l', 'labelSize', 8, 48, ['s', 'm', 'l'], dflt.l);
      sized('i', 'iconSize', 12, 120, ['s', 'm', 'l', 'xl'], dflt.i);
      if (vn !== null && vn >= 28) fact.dataset.big = '';
      fact.dataset.align = pick(x.align, ['start', 'center', 'end'], dflt.a);
      if (x.id) fact.dataset.fact = x.id;
      const color = COLORS.includes(x.color) ? x.color : null;
      if (color) fact.style.setProperty('--fact-c', `var(--${color})`);
      if (x.valueColor === 'icon' && color) fact.dataset.valueTone = 'icon';
    },
    icon: (x) => (['subtle', 'accent'].includes(x.iconBg) ? { background: x.iconBg } : {}),
    state(fact, view) { fact.dataset.state = view.state || 'none'; },
  };
  function heroFacts(list, { hero = null } = {}) {
    const lines = (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object');
    if (!lines.length) return null;
    const I = global.IniqInfo;
    const root = document.createElement('div');
    root.className = 'mpop__info';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Information');
    if (hero) root.dataset.hero = hero;                    // the area reaches down the picture: top / centre / bottom are real places
    const grid = document.createElement('div'); grid.className = 'mpop__facts';
    root.append(grid);
    const cells = {};
    CELLS.forEach((k) => { const d = document.createElement('div'); d.className = 'mpop__slot'; d.dataset.cell = k; [d.dataset.row, d.dataset.slot] = k.split('-'); cells[k] = d; grid.append(d); });
    const subs = [];
    // each item: the SHARED information renderer (IniqInfo.render + IniqInfo.follow) in the popup's own skin; the 3 × 3 hero layout is the popup's
    lines.forEach((x) => {
      if (!I) return;
      const fact = I.render(x, FACT_SKIN);
      const row = pick(x.vslot, ROWS, 'center'), col = pick(x.slot, SLOTS, 'left');
      cells[`${row}-${col}`].append(fact);
      subs.push(I.follow(fact, x));
    });
    CELLS.forEach((k) => { if (!cells[k].childElementCount) cells[k].dataset.empty = ''; });
    const used = CELLS.filter((k) => cells[k].childElementCount);
    root.dataset.cells = used.join(' ');
    root.dataset.slots = SLOTS.filter((c) => used.some((k) => k.endsWith(`-${c}`))).join(' ');
    root.dataset.rows = ROWS.filter((r) => used.some((k) => k.startsWith(`${r}-`))).join(' ');
    if (global.IniqIcons) global.IniqIcons.fill(root);
    root.stop = () => { subs.splice(0).forEach((u) => u()); };
    return root;
  }

  /** the popup's header (title, subtitle, Back / Menu / Close in their regions), its picture and its information row (or null each).
      HERO = the picture + the information row; heroShow: false hides both (the configuration is kept). */
  function chrome(cfg, { name = '', icons = {}, onClose, onBack, onMenu, design = false } = {}) {
    const heroOn = cfg.heroShow !== false;
    const pic = heroOn && typeof cfg.image === 'string' && cfg.image !== 'none' && SAFE_IMG.test(cfg.image) ? cfg.image : null;
    let hero = null;
    if (pic) {
      hero = document.createElement('div');
      hero.className = 'mpop__hero';
      hero.setAttribute('aria-hidden', 'true');
      hero.dataset.hero = cfg.hero || 'medium';
      hero.dataset.treatment = cfg.imageTreatment || 'natural';
      hero.dataset.overlay = cfg.overlay || 'medium';
      const img = document.createElement('img'); img.alt = ''; img.decoding = 'async'; img.draggable = false; img.src = pic;
      img.addEventListener('error', () => { hero.hidden = true; });
      const shade = document.createElement('span'); shade.className = 'mpop__shade';
      hero.append(img, shade);
    }
    const info = heroOn ? heroFacts(cfg.heroInfo, { hero: pic ? (cfg.hero || 'medium') : null }) : null;
    if (info && pic) info.classList.add('is-over');
    const menuOk = (cfg.menu === 'popup' && cfg.menuPopup) || (cfg.menu === 'navigate' && cfg.menuPage);
    const showBack = !!cfg.backButton, showTitle = cfg.showTitle !== false && !!cfg.title, showSub = cfg.showSubtitle !== false && !!cfg.subtitle;
    const iconMdi = typeof cfg.icon === 'string' && MDI.test(cfg.icon), iconOk = iconMdi || (cfg.icon && icons[cfg.icon]);
    const has = showTitle || showSub || iconOk || cfg.closeButton || showBack || menuOk;
    if (!has) return { head: null, hero, info };
    const head = document.createElement('header');
    head.className = 'mpop__head';
    head.dataset.align = cfg.headerAlign === 'center' ? 'center' : 'left';
    head.dataset.title = cfg.titleSize === 'large' ? 'large' : 'normal';
    const tsz = num(cfg.titleSize, 12, 60);
    if (tsz !== null) { head.dataset.title = 'n'; head.style.setProperty('--mpop-title', `${tsz}px`); }
    head.style.setProperty('--mpop-gap', `${num(cfg.actionGap, 0, 40) ?? 10}px`);
    if (pic) head.classList.add('is-over');
    // the buttons in their regions (left · right), always in the order Back · Menu · Close inside a region
    const start = document.createElement('div'); start.className = 'mpop__start';
    const end = document.createElement('div'); end.className = 'mpop__end';
    const place = (k, dflt) => (cfg[k] === 'left' || cfg[k] === 'right' ? cfg[k] : dflt) === 'left' ? start : end;
    // in a region: Back first, then Menu · Close (or Close · Menu: buttonOrder)
    const dflt = btnDefault(cfg, !!pic);
    const menuB = menuOk ? () => place('menuPlace', 'right').append(btn('mpop__menu', 'Menu', MENU, design ? null : onMenu, cfg, 'menu', dflt)) : () => {};
    const closeB = cfg.closeButton ? () => place('closePlace', 'right').append(btn('mpop__close', `Close ${cfg.title || name || 'popup'}`, CLOSE, design ? null : onClose, cfg, 'close', dflt)) : () => {};
    if (showBack) place('backPlace', 'left').append(btn('mpop__back', 'Back', BACK, design ? null : onBack, cfg, 'back', dflt));
    if (cfg.buttonOrder === 'close-menu') { closeB(); menuB(); } else { menuB(); closeB(); }
    if (start.childElementCount) head.append(start);
    if (iconMdi) { const i = mdiSpan('mpop__icon', cfg.icon); head.append(i); if (global.IniqIcons) global.IniqIcons.fill(i); }
    else if (iconOk) { const i = document.createElement('span'); i.className = 'mpop__icon'; i.setAttribute('aria-hidden', 'true'); i.innerHTML = icons[cfg.icon]; head.append(i); }
    const titles = document.createElement('div'); titles.className = 'mpop__titles';
    const t = document.createElement('h2'); t.className = 'mpop__title'; t.textContent = showTitle ? cfg.title : '';
    if (!showTitle) { t.classList.add('is-sr'); t.textContent = cfg.title || name || 'Popup'; }   // the dialog keeps its name for assistive technology
    titles.append(t);
    if (showSub) { const st = document.createElement('p'); st.className = 'mpop__subtitle'; st.textContent = cfg.subtitle; titles.append(st); }
    head.append(titles);
    head.append(end);
    if (global.IniqIcons) global.IniqIcons.fill(head);
    return { head, hero, info };
  }

  function createHost({ layer, build, key, viewport, icons = {}, onChange, run } = {}) {
    let cur = null;           // { id, box, panel, def, prevFocus, onKey }
    const log = [];
    let stack = [];           // the popups the current one replaced (for Back), most recent last

    function close(reason = 'api') {
      if (!cur) return false;
      const c = cur; cur = null;
      if (reason !== 'replace') stack = [];
      document.removeEventListener('keydown', c.onKey, true);
      log.push({ id: c.def.id, event: 'close', reason });
      const cfg = c.def.config || {};
      c.box.classList.add('is-leaving');
      const done = () => { c.box.remove(); };
      c.panel.querySelectorAll('.mpop__info').forEach((n) => n.stop && n.stop());
      Promise.all([animate(c.panel, cfg.exit || 'fade', cfg.speed, true), c.back ? animate(c.back, 'fade', cfg.speed, true) : null]).then(done, done);
      if (c.prevFocus && c.prevFocus.isConnected && reason !== 'replace') c.prevFocus.focus({ preventScroll: true });
      if (onChange && reason !== 'replace') onChange(null);
      return true;
    }

    function open(def, how = {}) {
      if (!def || !def.id) return false;
      if (cur) { if (!how.back && cur.def.id !== def.id) stack.push(cur.def); if (stack.length > 10) stack.shift(); close('replace'); }
      const cfg = def.config || {};
      const k = key ? key() : 'desktop', vp = viewport ? viewport() : { w: innerWidth, h: innerHeight };
      const box = document.createElement('div');
      box.className = 'mpop';
      box.dataset.popup = def.id;
      box.dataset.size = cfg.size || 'custom';
      box.dataset.bp = k;
      let back = null;
      if (cfg.backdrop || cfg.outsideClose) {
        back = document.createElement('div');
        back.className = 'mpop__backdrop';
        if (!cfg.backdrop) back.classList.add('is-clear');
        back.addEventListener('pointerdown', (e) => { e.preventDefault(); if (cfg.outsideClose) close('outside'); });
        box.append(back);
      } else box.classList.add('is-passthrough');            // the dashboard behind stays usable
      const panel = document.createElement('section');
      panel.className = 'mpop__panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', String(!!(cfg.backdrop || cfg.outsideClose)));
      panel.setAttribute('aria-label', cfg.title || def.name || 'Popup');
      panel.tabIndex = -1;
      const ch = chrome(cfg, { name: def.name, icons,
        onClose: () => close('button'),
        onBack: () => {
          if (run && cfg.backAction === 'popup' && cfg.backPopup) { run({ type: 'popup', popup: cfg.backPopup }); return; }
          if (run && cfg.backAction === 'navigate' && cfg.backPage) { close('back'); run({ type: 'navigate', page: cfg.backPage }); return; }
          const prev = stack.pop(); if (prev) open(prev, { back: true }); else close('back');
        },
        onMenu: () => { if (!run) return; if (cfg.menu === 'popup') run({ type: 'popup', popup: cfg.menuPopup }); else if (cfg.menu === 'navigate') { close('menu'); run({ type: 'navigate', page: cfg.menuPage }); } } });
      if (ch.hero) { panel.append(ch.hero); panel.classList.add('has-hero'); }
      if (ch.head) panel.append(ch.head);
      if (ch.info) panel.append(ch.info);
      const body = document.createElement('div');
      body.className = 'mpop__body';
      const content = build ? build(def, k) : null;
      if (content) body.append(content);
      panel.append(body);
      // size (px; the layer is the simulated screen)
      const pad = k === 'mobile' ? 0 : 24;
      if (k === 'mobile') {
        panel.style.width = '100%';
        if (cfg.size === 'full') panel.style.height = `${vp.h}px`; else panel.style.maxHeight = `${Math.round(vp.h * 0.9)}px`;
      } else if (cfg.size === 'full') {
        panel.style.width = `${vp.w - 2 * pad}px`; panel.style.height = `${vp.h - 2 * pad}px`;
      } else if (cfg.size === 'custom') {
        const s = (cfg.custom && cfg.custom[k]) || (cfg.custom && cfg.custom.desktop) || { w: 560, h: 420 };
        panel.style.width = `${Math.min(s.w, vp.w - 2 * pad)}px`; panel.style.height = `${Math.min(s.h, vp.h - 2 * pad)}px`;
      } else {                                               // fit: the content's own size
        panel.style.maxWidth = `${vp.w - 2 * pad}px`; panel.style.maxHeight = `${vp.h - 2 * pad}px`;
      }
      box.append(panel);
      layer.append(box);
      // Escape closes only the TOPMOST popup on the layer (a system surface — Entity Details — may sit above a user popup)
      const modal = !!(cfg.backdrop || cfg.outsideClose);
      const onKey = (e) => {
        // a modal popup keeps keyboard focus inside itself (Tab / Shift+Tab wrap around its controls)
        if (e.key === 'Tab' && modal && cur && cur.box === box && [...layer.querySelectorAll(':scope > .mpop:not(.is-leaving)')].pop() === box) {
          const f = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null || n === document.activeElement);
          if (!f.length) { e.preventDefault(); panel.focus({ preventScroll: true }); return; }
          const first = f[0], last = f[f.length - 1], at = document.activeElement;
          if (!panel.contains(at)) { e.preventDefault(); first.focus({ preventScroll: true }); }
          else if (e.shiftKey && (at === first || at === panel)) { e.preventDefault(); last.focus({ preventScroll: true }); }
          else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
          return;
        }
        if (e.key !== 'Escape' || !cur || cur.box !== box || !cfg.escClose) return;
        if ([...layer.querySelectorAll(':scope > .mpop:not(.is-leaving)')].pop() !== box) return;
        e.preventDefault(); e.stopPropagation(); close('escape');
      };
      document.addEventListener('keydown', onKey, true);
      cur = { id: def.id, def, box, panel, back, onKey, prevFocus: document.activeElement };
      log.push({ id: def.id, event: 'open' });
      animate(panel, cfg.enter || 'scale', cfg.speed);
      if (back) animate(back, 'fade', cfg.speed);
      (panel.querySelector('.mpop__close') || panel.querySelector('.mpop__btn') || panel).focus({ preventScroll: true });
      if (onChange) onChange(def.id);
      return true;
    }

    return { open, close, current: () => (cur ? cur.id : null), element: () => (cur ? cur.box : null), log, backStack: () => stack.map((d) => d.id) };
  }

  global.MaisonPopup = { createHost, chrome, heroFacts, COLORS, FRAMES, SPEED, animate };
})(window);
