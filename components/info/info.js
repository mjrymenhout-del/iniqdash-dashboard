/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqInfo — the shared INFORMATION ITEM renderer (docs/WIDGET-REFERENCE.md, "Information"): one value from a Home Assistant entity
   (its state, or one of the values the shared HA layer reports for it) with an optional label and an optional MDI icon. It knows no
   domain and no widget: the value and its formatting come from the shared layer (IniqHA.slots.item / IniqHA.subscribe — the same poll
   the widgets use); nothing is fetched here. Without Home Assistant (or before it answers) the value reads "—".

   Three parts, kept apart (docs/COMPONENT-FOUNDATION.md): RENDER (pure presentation: item + view → element; the layout context may
   give its own skin) · FOLLOW (the binding: the view from the shared HA layer) · the context's LAYOUT (Room lines, Climate places /
   bar / Digital ring, Popup hero 3 × 3 — never in here).
   IniqInfo.fact(item) → HTMLElement (.iqf) with el.stop() (stops following the entity) — render + follow
     item = { id, entity, value: 'state' | <a value key>, label?, showLabel? (false: no label element, no space),
              icon?: 'mdi:…' (none: no icon element, no space), iconSize?, iconBg?: 'subtle' | 'accent', iconPos?: 'top',
              color?: <design-token name> | '#rrggbb' (the icon), valueColor?: 'icon',
              animation?: <IniqIcons animation>, animateWhen?: 'active' | 'always' (active = the entity is active — HA's own state),
              style?: 'card' | 'emphasis' | 'minimal', align?: 'start' | 'center' | 'end', valueSize?, labelSize? (px), labelPos?: 'above' }
   Sizes: a number of px (the configurator's shared Slider + Number), else the style's own. An icon background never shrinks the glyph
   (the surface is padding around it). Colours: an allow-listed token name or a #rrggbb — never any other CSS.
   ========================================================================== */
(function (global) {
  'use strict';

  const MDI = /^mdi:[a-z0-9-]{1,64}$/, HEX = /^#[0-9a-fA-F]{6}$/;
  const TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const STYLES = ['card', 'emphasis', 'minimal'];
  /** a style's own sizes (px) and alignment when the item has not chosen them */
  const DEFAULT = { card: { v: 18, l: 12, i: 26, a: 'start' }, minimal: { v: 18, l: 12, i: 24, a: 'start' }, emphasis: { v: 40, l: 13, i: 34, a: 'center' } };
  const colour = (v) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : '') : '');
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);

  /* ---------------------------------------------------------------- RENDER (pure presentation): one information item from its
     configuration and a VIEW — never reads Home Assistant. The layout CONTEXT supplies a SKIN: its element / class names and its own
     decoration (sizes, style, colour) — so Room's lines, Climate's items and the Popup hero's facts are the SAME renderer with the
     context's own look (and CSS). The default skin is this module's own (.iqf).
       IniqInfo.render(item, skin?) → el (el.info.update(view))
       view = { value: text, label: text ('' → no label element, no space), state: 'ready' | 'unavailable' | 'loading' | 'missing' | …,
                run: the icon animation runs now (the OWNER decides: 'active' / 'always') }
       skin = { tag, root, ic, txt, v, vTag, l, decorate(el, item) (once), icon(item) → IconConfig extras ({ color?, background? }),
                state(el, view) (each update) } */
  const SKIN = {
    tag: 'div', root: 'iqf', ic: 'iqf__ic', txt: 'iqf__txt', v: 'iqf__v', vTag: 'span', l: 'iqf__l',
    decorate(el, x) {
      const style = STYLES.includes(x.style) ? x.style : 'card', d = DEFAULT[style];
      el.dataset.style = style;
      el.dataset.align = ['start', 'center', 'end'].includes(x.align) ? x.align : d.a;
      el.dataset.iconPos = x.iconPos === 'top' ? 'top' : 'start';
      el.dataset.labelPos = x.labelPos === 'above' ? 'above' : 'below';
      if (x.id) el.dataset.fact = String(x.id);
      el.style.setProperty('--iqf-v', `${num(x.valueSize, 10, 120) ?? d.v}px`);
      el.style.setProperty('--iqf-l', `${num(x.labelSize, 8, 48) ?? d.l}px`);
      el.style.setProperty('--iqf-i', `${num(x.iconSize, 12, 120) ?? d.i}px`);
      const c = colour(x.color);
      if (c) el.style.setProperty('--iqf-c', c);
      if (x.valueColor === 'icon' && c) el.dataset.valueTone = 'icon';
    },
    icon: (x) => (['subtle', 'accent'].includes(x.iconBg) ? { background: x.iconBg } : {}),
    state(el, view) { el.dataset.state = view.state || 'none'; },
  };
  function render(x, skin = SKIN) {
    x = x && typeof x === 'object' ? x : {};
    const k = { ...SKIN, ...skin };
    const el = document.createElement(k.tag);
    el.className = k.root;
    k.decorate(el, x);
    let ic = null;
    if (typeof x.icon === 'string' && MDI.test(x.icon)) {       // no icon chosen: no icon element, no space kept
      ic = document.createElement('span'); ic.className = k.ic;
      el.append(ic);
    }
    const txt = document.createElement('span'); txt.className = k.txt;
    const v = document.createElement(k.vTag); v.className = k.v; v.textContent = '—';
    txt.append(v); el.append(txt);
    const l = document.createElement('span'); l.className = k.l;
    const extra = k.icon ? k.icon(x) : {};
    function update(view = {}) {
      v.textContent = typeof view.value === 'string' ? view.value : '—';
      if (x.showLabel !== false && view.label) { l.textContent = view.label; if (!l.isConnected) txt.append(l); } else l.remove();
      if (ic && global.IniqIcons) global.IniqIcons.present(ic, { icon: x.icon, animation: x.animation, ...extra }, { run: !!view.run });
      k.state(el, view);
    }
    el.info = { update, icon: ic };
    return el;
  }

  /* ---------------------------------------------------------------- FOLLOW (the binding): what an item shows, from the SHARED Home
     Assistant layer (IniqHA.slots.item / IniqHA.subscribe — the same poll the widgets use; nothing is fetched here). A context that
     already receives the values (Room: its host binding) calls update() itself instead. Without Home Assistant (or before it answers):
     "—". Returns stop(). */
  function viewOf(x, e, known) {
    const HA = global.IniqHA, on = !!(HA && HA.enabled && HA.enabled() && HA.slots);
    const ent = typeof x.entity === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x.entity) ? x.entity : null;
    const it = ent && on ? HA.slots.item({ id: x.id, entity: ent, value: x.value || 'state' }, e, known) : null;
    const ready = it && it.state === 'ready';
    const own = typeof x.label === 'string' ? x.label.trim() : '';
    const anim = typeof x.animation === 'string' ? x.animation : 'none';
    return { value: ready ? it.text : it && it.state === 'missing' ? 'Not found' : '—', label: own || (e && e.name) || '',
      state: ready ? (it.available ? 'ready' : 'unavailable') : it ? it.state : 'none',
      run: anim !== 'none' && (x.animateWhen === 'always' || (!!ready && !!(HA.isActive && HA.isActive(e)))) };
  }
  function follow(el, x) {
    const HA = global.IniqHA, on = !!(HA && HA.enabled && HA.enabled() && HA.subscribe && HA.slots);
    const ent = typeof x.entity === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x.entity) ? x.entity : null;
    el.info.update(viewOf(x, ent && on ? HA.get(ent) : null, ent && on && HA.known ? HA.known(ent) : false));
    let un = null;
    if (ent && on) {
      let seen = false;
      un = HA.subscribe(ent, (e) => { if (el.isConnected) seen = true; else if (seen) { un(); un = null; return; } el.info.update(viewOf(x, e, true)); });
    }
    return () => { if (un) { try { un(); } catch (e) { /* stopped */ } un = null; } };
  }

  /** an item that follows its entity: render (this module's skin) + follow */
  function fact(x) {
    x = x && typeof x === 'object' ? x : {};
    const el = render(x);
    el.stop = follow(el, x);
    return el;
  }

  /* ---------------------------------------------------------------- BAR: a collection-level PRESENTATION of information items — one
     structured horizontal row. It knows no domain and no widget: it lays out the nodes it is given (each keeps its own look), in their order.
     IniqInfo.bar() → { el, set([node…]), update(look), fit(limit) }
       look = { width: 'content' | 'full' | 'custom', widthPct (20–100), align: 'left' | 'center' | 'right' | 'between' | 'equal',
                dividers (bool), dividerOpacity (%), topDivider (bool), background: 'none' | 'soft' | 'surface', gap (px), density: 'compact' }
       fit(limit) — the first `limit` items (the configured order has priority), then as many as fit the bar's OWN width (logical px —
       never the browser or the editor zoom); never squeezed. */
  const BAR = { width: ['content', 'full', 'custom'], align: ['left', 'center', 'right', 'between', 'equal'], background: ['none', 'soft', 'surface'] };
  function bar() {
    const el = document.createElement('div');
    el.className = 'iqi-bar';
    el.setAttribute('role', 'group');
    let cells = [];
    function set(nodes) {
      const list = (nodes || []).filter(Boolean);
      if (cells.length === list.length && cells.every((c, i) => c.firstChild === list[i])) return;
      cells = list.map((n) => { const c = document.createElement('div'); c.className = 'iqi-bar__cell'; c.append(n); return c; });
      el.replaceChildren(...cells.flatMap((c, i) => { if (!i) return [c]; const d = document.createElement('span'); d.className = 'iqi-bar__sep'; d.setAttribute('aria-hidden', 'true'); return [d, c]; }));
    }
    function update(look = {}) {
      el.dataset.width = BAR.width.includes(look.width) ? look.width : 'full';
      el.dataset.align = BAR.align.includes(look.align) ? look.align : 'equal';
      el.dataset.background = BAR.background.includes(look.background) ? look.background : 'none';
      el.dataset.dividers = look.dividers === false ? 'off' : 'on';
      el.dataset.top = look.topDivider === true ? 'on' : 'off';
      el.dataset.density = look.density === 'compact' ? 'compact' : 'normal';
      const w = num(look.widthPct, 20, 100), g = num(look.gap, 0, 48), o = num(look.dividerOpacity, 0, 100);
      if (w !== null && el.dataset.width === 'custom') el.style.setProperty('--iqi-w', `${w}%`); else el.style.removeProperty('--iqi-w');
      if (g !== null) el.style.setProperty('--iqi-gap', `${g}px`); else el.style.removeProperty('--iqi-gap');
      if (o !== null) el.style.setProperty('--iqi-div', `${o}%`); else el.style.removeProperty('--iqi-div');
    }
    function fit(limit = Infinity) {
      const show = (n) => cells.forEach((c, i) => { c.hidden = i >= n; const d = c.previousElementSibling; if (d) d.hidden = i >= n; });
      let n = Math.max(0, Math.min(cells.length, limit));
      show(n);
      // what does not fit the bar's own width is left out from the end (offsetWidth / scrollWidth: logical px)
      while (n > 1 && el.isConnected && el.clientWidth && el.scrollWidth > el.clientWidth + 1) show(--n);
      el.dataset.shown = String(n);
      el.hidden = n === 0;
      return n;
    }
    return { el, set, update, fit };
  }

  global.IniqInfo = Object.freeze({ fact, render, follow, viewOf, bar, SKIN, STYLES, DEFAULT, TOKENS, BAR });
  if (global.IniqComponents) {
    global.IniqComponents.define('information', { name: 'Information', category: 'data', module: 'IniqInfo.render', render: (x, skin) => render(x, skin),
      contract: { entity: 'the Home Assistant entity (read by the binding — IniqInfo.follow — never by the renderer)', value: "'state' | a value the shared HA layer reports",
        label: 'text (absent: Home Assistant’s name)', showLabel: 'false → no label element', icon: 'icon (IconConfig: icon · color · background → iconBg · animation · animateWhen)',
        iconSize: 'px', valueSize: 'px', labelSize: 'px', style: STYLES.join(' | '), align: "'start' | 'center' | 'end'", iconPos: "'start' | 'top'", labelPos: "'below' | 'above'", valueColor: "'icon'" },
      capabilities: ['value', 'label', 'icon', 'sizes', 'style', 'alignment', 'animation', 'skin (the layout context’s own look)'],
      state: '{ value, label, state, run } — IniqInfo.follow (the shared HA layer) or the context’s own binding',
      // standalone: the item is the configuration; the VALUE is the view (mock data through the same update() — later a binding)
      compose: { defaults: { label: 'Label', icon: 'mdi:shape-outline', color: 'accent', style: 'minimal' }, data: { value: 'Value', active: true }, box: { w: 170, h: 64 }, min: { w: 40, h: 24 },
        // LAYOUT: the box is the room the item lays out in (aligned by its own alignment); its value / label / icon sizes are its own
        resize: { mode: 'layout', aspect: 'free' },
        // SCALE (Shift + resize): its value, label and icon sizes in proportion (the value itself never changes)
        scale: { props: { valueSize: [10, 120], labelSize: [8, 48], iconSize: [12, 120] },
          base: (x) => { const d = DEFAULT[STYLES.includes(x.style) ? x.style : 'card'], n = (v, f) => (typeof v === 'number' ? v : f);
            return { valueSize: n(x.valueSize, d.v), ...(x.showLabel !== false ? { labelSize: n(x.labelSize, d.l) } : {}), ...(x.icon ? { iconSize: n(x.iconSize, d.i) } : {}) }; } },
        editor: { fields: ['showLabel', 'label', 'icon', 'style', 'align', 'valueSize', 'labelSize', 'labelPos', 'iconSize', 'iconPos', 'iconBg', 'color', 'valueColor', 'animation', 'animateWhen'] },
        dataFields: [{ key: 'data.value', type: 'text', label: 'Preview value', group: 'data', maxLength: 40, help: 'Design only — shown until its property has a preview entity.' },
          { key: 'data.active', type: 'boolean', label: 'Entity active (preview)', group: 'data' }],
        // BINDING (a host may feed the view — the item itself knows no entity here): the value text (with its unit), whether it is active;
        // status 'unavailable' / 'missing' dims it as every Information item does
        inputs: { value: { label: 'Value', kind: 'text', primary: true, unit: true }, active: { label: 'Active', kind: 'boolean', bindOnly: true } },
        render: (x, d = {}) => {
          const el = render(x), anim = typeof x.animation === 'string' ? x.animation : 'none';
          el.info.update({ value: typeof d.value === 'string' ? d.value : '—', label: typeof x.label === 'string' ? x.label.trim() : '', state: d.status === 'unavailable' || d.status === 'missing' ? 'unavailable' : 'ready', run: anim !== 'none' && (x.animateWhen === 'always' || !!d.active) });
          el.dataset.fill = '';                                   // composed: it lays out in its box
          return el;
        } } });
    global.IniqComponents.define('information-bar', { name: 'Information bar', category: 'layout', module: 'IniqInfo.bar', render: () => bar().el,
      contract: { width: BAR.width.join(' | '), widthPct: '%', align: BAR.align.join(' | '), dividers: 'bool', dividerOpacity: '%', topDivider: 'bool', background: BAR.background.join(' | '), gap: 'px' },
      capabilities: ['ordered items', 'fit to its own width'], state: 'set([node…]) · fit(limit)' });
  }
})(window);
