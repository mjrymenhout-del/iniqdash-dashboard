/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Application layer — the ONE page-switch mechanism, the action dispatcher, the app shell and the
   Navigation Dock. Not a widget, not on the grid.

   MaisonApp.createNavigator({ pages, start, onChange }) → navigator
     pages()            → [{ id, … }]   the configured pages (read live, never copied)
     go(id, source)     switch to an internal page. source: 'dock' | 'radial' | 'editor' | 'api'.
                        Unknown ids are refused (returns false) — targets are page ids, never URLs.
     current()          the active page id
     log                [{ id, source }] — every completed switch, in order (diagnostics/tests)
     onChange(id, previousId, source) is called once per completed switch.
   Every caller — the Navigation Dock, a Radial Action Menu "navigate" segment, the editor's page
   picker — goes through go(); there is no second switching path.

   MaisonApp.createActions({ navigator, notify, openPopup }) → { run(action, meta), register(type, handler), types() }
     Executes the requests widgets REPORT (a widget never executes anything itself). This is the
     SHARED request mechanism: an Action widget, a Radial segment (and later anything else) asks for
     { type, … } and the dispatcher decides what it means.
     Built-in safe local types (V1):  demo · navigate { page } · toggle · popup { popup }
       (openPopup(id) → boolean is supplied by the application, which owns the popup host)
     Future Home Assistant types (service, scene, script, entity-toggle, cover…) are added with
     register(type, handler) — the widgets that emit them do not change.

   MaisonApp.createShell({ dock, content, navigation }) → HTMLElement (.msh)
     el.shell = { setNavigation({ desktop, tablet, mobile }), setDockVisible(bool) }
     The dock occupies its own edge; the content gets the remaining space. The edge is chosen per
     breakpoint from the SHELL'S OWN WIDTH (same thresholds as the grid: ≥ 960 desktop, ≥ 560 tablet):
       desktop / tablet: left | right | top | bottom      mobile: top | bottom only
     (a left/right value can never reach the mobile layout: mobile CSS only implements top/bottom).

   MaisonApp.createScreen({ box }) → screen         the application's SCREEN layer for overlays
     box() → { left, top, width, height, scale }   the visible screen rectangle (viewport px) and the
       scale of the UI inside it (the editor previews a device frame, possibly scaled down)
     screen.layer      element (screen px) where popups and notifications render
     screen.size()     { w, h } in screen px ; screen.update() re-measure (resize / scroll / frame change)
     screen.visible()  { top, right, bottom, left } — how much of the screen (logical px) lies outside the browser window; also set
                       on the layer as --scr-vis-top|right|bottom|left, so screen-anchored notifications stay in the visible part
   Popups (MaisonPopup) and notifications (MaisonNotify) render into screen.layer, so they always
   cover exactly the (simulated) screen, never a widget's grid cell.

   MaisonApp.createDock({ items, active, label, onNavigate }) → HTMLElement (.mnav)
     items = [{ id, label, icon }]  icon: static SVG markup from the shared icon set
     el.dock = { getState() → { items, active }, setState({ items?, active? }) }  — setState never
     calls onNavigate. onNavigate(id, { source: 'pointer' | 'keyboard' }) only on a user press.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- navigator */
  function createNavigator({ pages, start, onChange } = {}) {
    const list = () => (typeof pages === 'function' ? pages() : pages) || [];
    let cur = start && list().some((p) => p.id === start) ? start : list()[0]?.id || null;
    const log = [];
    return {
      log,
      current: () => cur,
      has: (id) => list().some((p) => p.id === id),
      /** the single page-switch function */
      go(id, source = 'api') {
        if (typeof id !== 'string' || !list().some((p) => p.id === id)) return false;
        const prev = cur;
        cur = id;
        log.push({ id, source });
        if (log.length > 200) log.shift();
        if (onChange) onChange(id, prev, source);
        return true;
      },
      /** silent correction (the active page was deleted / a new configuration loaded) */
      reset(id) { cur = list().some((p) => p.id === id) ? id : list()[0]?.id || null; return cur; },
    };
  }

  /* ---------------------------------------------------------------- actions */
  function createActions({ navigator, notify, openPopup } = {}) {
    const say = (t) => notify && notify(t);
    const handlers = {
      demo: (a) => { say(`Demo action: ${a.label || 'action'}`); return true; },
      navigate: (a, meta) => {
        if (!navigator) return false;
        const ok = navigator.go(a.page, meta && meta.source === 'dock' ? 'dock' : 'radial');
        if (!ok) say('That page no longer exists');
        return ok;
      },
      toggle: (a, meta) => { say(`${a.label || 'Toggle'}: ${meta && meta.active ? 'on' : 'off'}`); return true; },
      popup: (a) => {
        const ok = !!(openPopup && typeof a.popup === 'string' && openPopup(a.popup));
        if (!ok) say('That popup no longer exists');
        return ok;
      },
    };
    return {
      run(action, meta = {}) {
        if (!action || typeof action.type !== 'string') return false;
        const fn = Object.prototype.hasOwnProperty.call(handlers, action.type) ? handlers[action.type] : null;
        if (!fn) { say(`"${action.type}" actions are not available yet`); return false; }
        return fn(action, meta);
      },
      register(type, fn) { if (typeof type === 'string' && typeof fn === 'function') handlers[type] = fn; },
      types: () => Object.keys(handlers),
    };
  }

  /* ---------------------------------------------------------------- shell */
  const EDGES = { desktop: ['left', 'right', 'top', 'bottom', 'none'], tablet: ['left', 'right', 'top', 'bottom', 'none'], mobile: ['top', 'bottom', 'none'] };
  function createShell({ dock, content, navigation } = {}) {
    const root = document.createElement('div');
    root.className = 'msh';
    const inner = document.createElement('div');
    inner.className = 'msh__in';
    const dockSlot = document.createElement('div');
    dockSlot.className = 'msh__dock';
    const main = document.createElement('div');
    main.className = 'msh__main';
    if (dock) dockSlot.append(dock);
    if (content) main.append(content);
    inner.append(dockSlot, main);
    root.append(inner);
    function setNavigation(nav = {}) {
      Object.keys(EDGES).forEach((bp) => {
        const v = EDGES[bp].includes(nav[bp]) ? nav[bp] : (bp === 'desktop' ? 'left' : 'bottom');
        root.dataset[`nav${bp[0].toUpperCase()}${bp.slice(1)}`] = v;   // data-nav-desktop / -tablet / -mobile
      });
    }
    setNavigation(navigation);
    root.shell = {
      setNavigation,
      setDockVisible(on) { dockSlot.hidden = !on; root.classList.toggle('msh--nodock', !on); },
      main, dockSlot,
    };
    return root;
  }

  /* ---------------------------------------------------------------- dock */
  function createDock({ items = [], active = null, label = 'Pages', onNavigate } = {}) {
    let s = { items: items.slice(), active };
    const root = document.createElement('nav');
    root.className = 'mnav';
    root.setAttribute('aria-label', label);
    const ul = document.createElement('ul');
    ul.className = 'mnav__list';
    root.append(ul);
    let lastKey = false;
    ul.addEventListener('keydown', (e) => {
      lastKey = e.key === 'Enter' || e.key === ' ';
      // roving arrows along the dock (both axes, whatever its orientation)
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      const bs = [...ul.querySelectorAll('.mnav__b')], i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length;
      bs[n].focus();
      bs[n].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    function render() {
      ul.replaceChildren(...s.items.map((it) => {
        const li = document.createElement('li');
        li.className = 'mnav__i';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mnav__b';
        b.dataset.page = it.id;
        b.title = it.label;                                     // tooltip (labels may be visually hidden)
        b.setAttribute('aria-label', it.label);
        if (it.id === s.active) b.setAttribute('aria-current', 'page');
        const ic = document.createElement('span');
        ic.className = 'mnav__icon';
        ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = it.icon || FALLBACK;                     // static markup from the shared icon set
        const t = document.createElement('span');
        t.className = 'mnav__label';
        t.textContent = it.label;
        b.append(ic, t);
        b.addEventListener('click', () => {
          const src = lastKey ? 'keyboard' : 'pointer'; lastKey = false;
          if (onNavigate) onNavigate(it.id, { source: src });
        });
        li.append(b);
        return li;
      }));
      root.hidden = !s.items.length;
    }
    render();
    root.dock = {
      getState: () => ({ items: s.items.map((i) => ({ ...i })), active: s.active }),
      /** external update (the active page changed elsewhere, pages were edited) — never navigates */
      setState(patch = {}) {
        const itemsChanged = patch.items !== undefined;
        s = { ...s, ...patch, items: itemsChanged ? patch.items.slice() : s.items };
        if (itemsChanged) render();
        else ul.querySelectorAll('.mnav__b').forEach((b) => { if (b.dataset.page === s.active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
        const cur = ul.querySelector('[aria-current="page"]');
        if (cur && root.isConnected) { const l = ul.getBoundingClientRect(), r = cur.getBoundingClientRect(); if (r.left < l.left || r.right > l.right) ul.scrollLeft += r.left < l.left ? r.left - l.left - 8 : r.right - l.right + 8; }
      },
    };
    return root;
  }
  const FALLBACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>';

  /* ---------------------------------------------------------------- screen (overlay layer) */
  function createScreen({ box } = {}) {
    const root = document.createElement('div');
    root.className = 'mscr';
    const layer = document.createElement('div');
    layer.className = 'mscr__layer';
    root.append(layer);
    document.body.append(root);
    let cur = { w: innerWidth, h: innerHeight }, vis = { top: 0, right: 0, bottom: 0, left: 0 };
    const MIN_VIS = { w: 160, h: 80 };          // a screen almost entirely out of the window: no insets (nothing sensible to keep in view)
    function update() {
      const b = box ? box() : { left: 0, top: 0, width: innerWidth, height: innerHeight, scale: 1 };
      const sc = b.scale || 1;
      Object.assign(root.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
      cur = { w: Math.round(b.width / sc), h: Math.round(b.height / sc) };
      Object.assign(layer.style, { width: `${cur.w}px`, height: `${cur.h}px`, transform: sc !== 1 ? `scale(${sc})` : '' });
      // the VISIBLE part of the screen: the (simulated) screen may extend past the browser window (a tall device preview, a scrolled
      // editor page). Screen-anchored overlays (notifications) keep to the part the user can see — in the screen's LOGICAL px (the
      // scale is undone), so a scaled preview never shifts them.
      const de = document.documentElement, vw = de.clientWidth || innerWidth, vh = de.clientHeight || innerHeight;
      const cut = (a) => Math.max(0, a / sc);
      vis = { top: cut(-b.top), left: cut(-b.left), bottom: cut(b.top + b.height - vh), right: cut(b.left + b.width - vw) };
      if (cur.w - vis.left - vis.right < MIN_VIS.w || cur.h - vis.top - vis.bottom < MIN_VIS.h) vis = { top: 0, right: 0, bottom: 0, left: 0 };
      Object.entries(vis).forEach(([k, v]) => layer.style.setProperty(`--scr-vis-${k}`, `${Math.round(v * 10) / 10}px`));
      layer.dispatchEvent(new CustomEvent('mscr:update'));
    }
    update();
    addEventListener('resize', update);
    if (global.visualViewport) global.visualViewport.addEventListener('resize', update);
    return { el: root, layer, update, size: () => ({ ...cur }), visible: () => ({ ...vis }) };
  }

  global.MaisonApp = { createNavigator, createActions, createShell, createDock, createScreen, EDGES };
})(window);
