/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Tabbed Container — a reusable LAYOUT component: a row of tabs, and one content region per tab (only the selected
   one is shown). It knows nothing about Home Assistant or about what its tabs hold: each tab's region is an ordinary
   IniqDash nested grid of ordinary items (the editor / application build them; this component only places them).
   Usable wherever a Container is: on a page, in a Floating Container, in a Popup.

   MaisonTabs.create({ id, tabs, panes, active, align, style, onSelect }) → HTMLElement (.mtabs)
     tabs     [{ id, label, icon?: 'mdi:…', badge?: short text }]   (at least one; ids unique within the container)
     panes    { [tabId]: Node }   the content region of each tab (a nested grid). A tab without a pane shows an empty region.
     active   the selected tab id (else the first)
     align    'center' | 'start'          where the tab row sits
     style    'bare' | 'panel'            no surface of its own (its items are the cards) · a container surface
     onSelect (tabId, { source: 'pointer' | 'keyboard' }) → after the selection changed (the editor uses it to edit that tab)
     look     the tab APPEARANCE (all optional; absent = the defaults below — the look tabs always had):
                textSize 14 · iconSize 18 · tabHeight 40 · padX 18 · tabGap 8  (px — continuous quantities)
                distribute 'content' | 'equal' | 'fill' · shape 'pill' | 'rounded' | 'minimal' · barPos 'top' | 'bottom'
                active 'outline' | 'soft' | 'filled' · inactive 'surface' | 'outline' | 'minimal' · badgeStyle 'accent' | 'subtle'
              Colours always come from the theme tokens (accent, surfaces, borders, text) — never from the configuration.
     nav      NAVIGATION (all optional; absent = the static tabs they always were):
                mode 'tabs' | 'swipe' | 'both' · showTabs (false: the tab row is hidden — it reappears while focused, for the keyboard)
                axis 'x' | 'y' (swipe left/right or up/down) · transition 'none' | 'slide' | 'flip' | 'fade' · duration (ms, 100–1500)
                mouse (a mouse drag swipes too) · arrows · dots · loop · auto (seconds between automatic advances; 0 = off — paused
                while the pointer / focus is in the container, and never while editing)
     editing  the editor's view: the tab row is always shown and no gesture / automatic advance navigates (widget drag / resize)
   Gestures: a swipe is recognised only when the movement is clearly along the axis (the other direction stays page scrolling)
   and never starts on a control that is dragged itself (sliders, dials, inputs) — a slider stays a slider. It may start on a button
   or a card: the press that would follow is cancelled (a swipe never presses anything).
   el.tabs = { select(id), current(), ids(), next(), prev() }
   Accessibility: role tablist / tab / tabpanel, aria-selected, aria-controls; Left / Right / Home / End move between
   tabs (and select them); Enter / Space select; a visible focus ring. The tab row scrolls sideways when it does not fit.
   ========================================================================== */
(function (global) {
  'use strict';

  let uid = 0;
  const el = (tag, cls, attrs = {}) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : String(v)); });
    return n;
  };

  const RANGE = { textSize: [10, 36, 14], iconSize: [10, 56, 18], tabHeight: [26, 100, 40], padX: [2, 60, 18], tabGap: [0, 40, 8] };
  const CHOICE = { distribute: ['content', 'equal', 'fill'], shape: ['pill', 'rounded', 'minimal'], barPos: ['top', 'bottom'], active: ['outline', 'soft', 'filled'], inactive: ['surface', 'outline', 'minimal'], badgeStyle: ['accent', 'subtle'] };
  /** the appearance as CSS custom properties (px) and data attributes on the root — no CSS from the configuration */
  function applyLook(root, look = {}) {
    Object.entries(RANGE).forEach(([k, [lo, hi, d]]) => { const v = typeof look[k] === 'number' && Number.isFinite(look[k]) ? Math.min(hi, Math.max(lo, look[k])) : d; root.style.setProperty(`--mtabs-${k}`, `${v}px`); });
    // (the selected / other tab treatments are data-sel / data-other: data-active is the selected tab's id)
    const ATTR = { active: 'sel', inactive: 'other' };
    Object.entries(CHOICE).forEach(([k, ok]) => { root.dataset[ATTR[k] || k] = ok.includes(look[k]) ? look[k] : ok[0]; });
  }

  const NAV = { mode: ['tabs', 'swipe', 'both'], axis: ['x', 'y'], transition: ['none', 'slide', 'flip', 'fade'] };
  /** a clean navigation configuration (the defaults: static tabs, exactly as before) */
  function navOf(n = {}) {
    const pick = (k) => (NAV[k].includes(n[k]) ? n[k] : NAV[k][0]);
    const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    return { mode: pick('mode'), axis: pick('axis'), transition: pick('transition'), duration: num(n.duration, 100, 1500, 300), showTabs: n.showTabs !== false,
      mouse: !!n.mouse, arrows: !!n.arrows, dots: !!n.dots, loop: !!n.loop, auto: num(n.auto, 0, 120, 0) };
  }
  // where a swipe never starts: controls that are DRAGGED themselves (a slider stays a slider, a dial stays a dial, text stays
  // selectable) and the container's own arrows / dots. A swipe may start on a button or a card — it is then not a press
  // (the click that follows a swipe is cancelled), exactly like a phone's carousel of buttons.
  const DRAGGED = 'input, select, textarea, [contenteditable], [role="slider"], [role="spinbutton"], .mtabs__nav';
  const PRESSED = 'button, a[href], [role="button"], [role="switch"], [role="tab"], [role="radio"], [role="checkbox"]';
  const keepsGesture = (t) => !!(t && t.closest && (t.closest(DRAGGED) || (t.closest('[data-iq-control]') && !t.closest('[data-iq-control]').matches(PRESSED))));

  function create({ id, tabs = [], panes = {}, active = null, align = 'center', style = 'bare', onSelect, look = {}, nav: nav0 = {}, editing = false } = {}) {
    const nav = navOf(nav0);
    const list = (Array.isArray(tabs) ? tabs : []).filter((t) => t && typeof t.id === 'string');
    const base = `mtabs-${++uid}`;
    const root = el('section', 'mtabs');
    root.dataset.align = align === 'start' || align === 'end' ? align : 'center';
    applyLook(root, look);
    root.dataset.style = style === 'panel' ? 'panel' : 'bare';
    if (id) root.dataset.mtabsId = id;
    const bar = el('div', 'mtabs__bar');
    const row = el('div', 'mtabs__list', { role: 'tablist', 'aria-orientation': 'horizontal' });
    bar.append(row);
    const body = el('div', 'mtabs__panes');
    root.append(bar, body);
    let cur = list.some((t) => t.id === active) ? active : (list[0] && list[0].id) || null;
    const buttons = [], regions = [];

    list.forEach((t, i) => {
      const b = el('button', 'mtabs__tab', { type: 'button', role: 'tab', id: `${base}-t${i}`, 'aria-controls': `${base}-p${i}`, 'data-tab': t.id, 'data-iq-control': true });
      if (t.icon && global.IniqIcons) { const ic = el('span', 'mtabs__ic', { 'aria-hidden': 'true', 'data-mdi': t.icon }); b.append(ic); }
      const lab = el('span', 'mtabs__label'); lab.textContent = t.label || `Tab ${i + 1}`; b.append(lab);
      if (t.badge !== undefined && t.badge !== null && String(t.badge) !== '') { const bd = el('span', 'mtabs__badge'); bd.textContent = String(t.badge).slice(0, 6); b.append(bd); }
      b.addEventListener('click', () => select(t.id, lastKey ? 'keyboard' : 'pointer'));
      row.append(b); buttons.push(b);
      const p = el('div', 'mtabs__pane', { role: 'tabpanel', id: `${base}-p${i}`, 'aria-labelledby': `${base}-t${i}`, 'data-tab': t.id });
      if (panes[t.id]) p.append(panes[t.id]);
      body.append(p); regions.push(p);
    });
    if (global.IniqIcons) global.IniqIcons.fill(row);
    let lastKey = false;
    row.addEventListener('keydown', (e) => {
      lastKey = e.key === 'Enter' || e.key === ' ';
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[n].focus();
      select(list[n].id, 'keyboard');
    });
    row.addEventListener('pointerdown', () => { lastKey = false; });
    // a tab row wider than its place scrolls sideways: touch / trackpad natively, a mouse wheel too (vertical wheel → horizontal)
    bar.addEventListener('wheel', (e) => {
      if (bar.scrollWidth <= bar.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = bar.scrollWidth - bar.clientWidth, next = Math.min(max, Math.max(0, bar.scrollLeft + e.deltaY));
      if (next !== bar.scrollLeft) { e.preventDefault(); bar.scrollLeft = next; }
    }, { passive: false });

    function paint() {
      buttons.forEach((b, i) => {
        const on = list[i].id === cur;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        regions[i].hidden = !on;
      });
      root.dataset.active = cur || '';
    }
    function select(tid, source = 'api', dir = 0) {
      if (!list.some((t) => t.id === tid)) return false;
      const changed = tid !== cur;
      const i0 = list.findIndex((t) => t.id === cur), i1 = list.findIndex((t) => t.id === tid);
      const from = regions[i0], to = regions[i1];
      cur = tid;
      paint();
      if (typeof paintNav === 'function') paintNav();
      if (changed && typeof animateSwap === 'function') animateSwap(from, to, dir || (i1 > i0 ? 1 : -1));
      const b = buttons[list.findIndex((t) => t.id === tid)];
      // the selected tab stays reachable in a scrolled row (only the row scrolls — never the page)
      if (b && root.isConnected && bar.scrollWidth > bar.clientWidth) { const l = b.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft, r = l + b.offsetWidth; if (l < bar.scrollLeft) bar.scrollLeft = l - 8; else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8; }
      if (changed && typeof onSelect === 'function') onSelect(tid, { source });
      return true;
    }
    paint();

    /* ---------------------------------------------------------------- NAVIGATION: swipe · arrows · dots · transitions · auto */
    const swipe = !editing && nav.mode !== 'tabs' && list.length > 1;
    root.dataset.nav = nav.mode; root.dataset.axis = nav.axis;
    if (!nav.showTabs && nav.mode !== 'tabs' && !editing) root.dataset.tabsHidden = '';
    const idx = () => list.findIndex((t) => t.id === cur);
    const step = (d, source) => {
      const n = list.length; if (n < 2) return false;
      let i = idx() + d;
      if (i < 0 || i >= n) { if (!nav.loop) return false; i = (i + n) % n; }
      return select(list[i].id, source, d);
    };
    let dotsEl = null, prevB = null, nextB = null;
    if (nav.arrows && list.length > 1) {
      const lbl = nav.axis === 'y' ? ['Previous (up)', 'Next (down)'] : ['Previous', 'Next'];
      prevB = el('button', 'mtabs__nav mtabs__arrow mtabs__arrow--prev', { type: 'button', 'aria-label': lbl[0], 'data-k': 'tabs-prev' });
      nextB = el('button', 'mtabs__nav mtabs__arrow mtabs__arrow--next', { type: 'button', 'aria-label': lbl[1], 'data-k': 'tabs-next' });
      prevB.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      nextB.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      prevB.addEventListener('click', () => { pause(); step(-1, 'pointer'); }); nextB.addEventListener('click', () => { pause(); step(1, 'pointer'); });
      body.append(prevB, nextB);
    }
    if (nav.dots && list.length > 1) {
      dotsEl = el('div', 'mtabs__nav mtabs__dots', { role: 'group', 'aria-label': 'Pages' });
      list.forEach((t, i) => { const d = el('button', 'mtabs__dot', { type: 'button', 'aria-label': `${t.label || `Tab ${i + 1}`} (${i + 1} of ${list.length})`, 'data-tab': t.id }); d.addEventListener('click', () => { pause(); select(t.id, 'pointer'); }); dotsEl.append(d); });
      root.append(dotsEl);
    }
    function paintNav() {
      if (dotsEl) [...dotsEl.children].forEach((d) => d.setAttribute('aria-current', String(d.dataset.tab === cur)));
      if (prevB) prevB.disabled = !nav.loop && idx() <= 0;
      if (nextB) nextB.disabled = !nav.loop && idx() >= list.length - 1;
    }
    paintNav();

    // a transition between the leaving and the entering tab (reduced motion: none)
    const reduced = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function animateSwap(from, to, dir) {
      if (nav.transition === 'none' || reduced() || !from || !to || from === to || !to.animate) return;
      const ax = nav.axis === 'y' ? 'Y' : 'X', ms = nav.duration, ease = 'cubic-bezier(.2, .8, .2, 1)';
      from.hidden = false; from.classList.add('is-leaving');
      const kf = nav.transition === 'slide' ? [[`translate${ax}(0)`, `translate${ax}(${-dir * 100}%)`], [`translate${ax}(${dir * 100}%)`, `translate${ax}(0)`]]
        : nav.transition === 'flip' ? [[`perspective(900px) rotate${ax === 'X' ? 'Y' : 'X'}(0deg)`, `perspective(900px) rotate${ax === 'X' ? 'Y' : 'X'}(${(ax === 'X' ? -1 : 1) * dir * 90}deg)`],
          [`perspective(900px) rotate${ax === 'X' ? 'Y' : 'X'}(${(ax === 'X' ? 1 : -1) * dir * 90}deg)`, `perspective(900px) rotate${ax === 'X' ? 'Y' : 'X'}(0deg)`]] : null;
      const done = () => { from.classList.remove('is-leaving'); from.hidden = from.dataset.tab !== cur; };
      if (nav.transition === 'flip') {
        from.animate([{ transform: kf[0][0] }, { transform: kf[0][1] }], { duration: ms / 2, easing: 'ease-in', fill: 'forwards' }).finished.then(() => { from.getAnimations().forEach((a) => a.cancel()); done(); }, done);
        to.animate([{ transform: kf[1][0], opacity: 0 }, { transform: kf[1][0], opacity: 0, offset: 0.5 }, { transform: kf[1][1], opacity: 1 }], { duration: ms, easing: 'ease-out' });
        return;
      }
      const a = nav.transition === 'slide' ? [{ transform: kf[0][0] }, { transform: kf[0][1] }] : [{ opacity: 1 }, { opacity: 0 }];
      const b = nav.transition === 'slide' ? [{ transform: kf[1][0] }, { transform: kf[1][1] }] : [{ opacity: 0 }, { opacity: 1 }];
      from.animate(a, { duration: ms, easing: ease }).finished.then(done, done);
      to.animate(b, { duration: ms, easing: ease });
    }

    // swipe: touch (and a mouse drag when allowed) along the axis — decided only once the movement is clearly along it
    if (swipe) {
      body.style.touchAction = nav.axis === 'y' ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom';
      let g = null, suppress = false;
      body.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || (e.pointerType === 'mouse' && !nav.mouse)) return;
        if (keepsGesture(e.target)) return;                                  // a dragged control keeps its own gesture
        g = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, t: performance.now() };
      });
      body.addEventListener('pointermove', (e) => {
        if (!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y, along = nav.axis === 'y' ? dy : dx, across = nav.axis === 'y' ? dx : dy;
        if (!g.on) {
          if (Math.abs(across) > 10 && Math.abs(across) > Math.abs(along)) { g = null; return; }   // scrolling the other way
          if (Math.abs(along) > 12 && Math.abs(along) > Math.abs(across) * 1.4) { g.on = true; try { body.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } pause(); }
        }
      });
      const end = (e) => {
        if (!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y, along = nav.axis === 'y' ? dy : dx, size = nav.axis === 'y' ? body.clientHeight : body.clientWidth;
        const fast = Math.abs(along) / Math.max(1, performance.now() - g.t) > 0.5;
        if (g.on && e.type === 'pointerup' && (Math.abs(along) > Math.min(80, size * 0.2) || (fast && Math.abs(along) > 24))) { suppress = true; step(along < 0 ? 1 : -1, 'swipe'); setTimeout(() => { suppress = false; }, 350); }
        g = null;
      };
      body.addEventListener('pointerup', end); body.addEventListener('pointercancel', end);
      body.addEventListener('click', (e) => { if (suppress) { e.preventDefault(); e.stopPropagation(); suppress = false; } }, true);   // a swipe is not a press
    }
    // keyboard: arrows / dots carry their own; a gesture-only container (no tab row, no arrows, no dots) takes the arrow keys itself
    if (swipe && !nav.showTabs && !nav.arrows && !nav.dots) {
      body.tabIndex = 0; body.setAttribute('role', 'group'); body.setAttribute('aria-roledescription', 'carousel'); body.setAttribute('aria-label', 'Swipe or use the arrow keys');
      body.addEventListener('keydown', (e) => {
        if (e.target !== body) return;
        const k = nav.axis === 'y' ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 };
        if (k[e.key]) { e.preventDefault(); step(k[e.key], 'keyboard'); }
      });
    }
    // automatic advance (off by default; never while editing; paused while the pointer or focus is inside, and after a user action)
    let pausedUntil = 0, hovering = false;
    function pause() { pausedUntil = Date.now() + Math.max(8000, nav.auto * 2000); }
    if (nav.auto > 0 && !editing && list.length > 1) {
      root.addEventListener('pointerenter', () => { hovering = true; }); root.addEventListener('pointerleave', () => { hovering = false; });
      const timer = setInterval(() => {
        if (!root.isConnected) { if (root.dataset.started) clearInterval(timer); return; }
        root.dataset.started = '1';
        if (hovering || root.contains(document.activeElement) || Date.now() < pausedUntil || document.hidden) return;
        if (!step(1, 'auto') && !nav.loop) clearInterval(timer);
      }, nav.auto * 1000);
    }

    root.tabs = { select: (t) => select(t, 'api'), current: () => cur, ids: () => list.map((t) => t.id), next: () => step(1, 'api'), prev: () => step(-1, 'api'), nav: () => ({ ...nav, swipe }) };
    return root;
  }

  global.MaisonTabs = { create, navOf };
  if (global.IniqComponents) global.IniqComponents.define('tabs', { name: 'Tabbed container', category: 'layout', module: 'MaisonTabs.create', render: (cfg = {}) => create(cfg),
    contract: { tabs: "[{ id, label, icon?: 'mdi:…', badge? }]", active: 'tab id', align: "'center' | 'start'", style: "'bare' | 'panel'",
      look: 'textSize · iconSize · tabHeight · padX · tabGap (px) · distribute · shape · barPos · active · inactive · badgeStyle' },
    capabilities: ['tabs', 'one content region per tab (ordinary IniqDash content)', 'keyboard'], state: 'el.tabs.select(id) · onSelect(tabId)' });
})(window);
