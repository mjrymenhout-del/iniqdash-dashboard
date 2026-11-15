/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Entity List Widget V1 — a configurable list of Home Assistant entities: each row shows who it is and what it says now,
   and offers a control ONLY where the entity has an obvious, safe one (switch / light / fan / input_boolean: a switch;
   cover: open or close; scene / script / button: a run button). Everything else is a status row. Not a dashboard builder:
   no grouping logic, no automations — one list.

   MaisonEntityList.create(config) → HTMLElement (.iq-elist), with el.entitylist = { getState(), setState(patch) }

   config = {
     id, name, subtitle
     items:     LINKED (from the binding): [{ id, entity, name, text, kind, state: 'loading' | 'missing' | 'absent' | 'ready',
                available, control: null | { type: 'toggle', on } | { type: 'move', verb: 'open' | 'close' } | { type: 'run', label } }]
     demoRows:  UNLINKED (no Home Assistant): [{ name, text, control?: 'toggle' | 'run', on? }]  — a demo toggle changes only itself
     onRequest: (entity, control) => void       linked: the secure HA channel (the server decides the service)
     emptyText: shown when a linked list has no rows
     list:      optional { mode: 'all' | 'expand', count, expanded, control: 'arrow' | 'text' | 'button' } — the shared expandable
                list (components/expandlist): the first rows, a control for the rest; the widget's size never changes
   }
   Rows: identity (your label, else Home Assistant's name) · value in HA's words · control. A row that is not ready says so in
   words ("Not found", "Unavailable") — never a guessed value. The list scrolls inside its own box; the layout follows the
   widget's OWN width (MaisonFit): narrow → the value sits under the name, wide → three columns.
   ========================================================================== */
(function (global) {
  'use strict';

  function create(config) {
    let s = { ...(config || {}) };
    const linked = () => Array.isArray(s.items);
    const root = document.createElement('article');
    root.className = 'iq-elist';
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqElistId = s.id;
    root.innerHTML = `<header class="iq-elist__head"><h3 class="iq-elist__name"></h3><p class="iq-elist__sub"></p></header><ul class="iq-elist__list"></ul><p class="iq-elist__empty" hidden></p>`;
    const $ = (q) => root.querySelector(q);
    const list = $('.iq-elist__list');
    const pend = new Map();                                    // entity → timeout (a pressed control waits for Home Assistant's next state)

    function details(entity, label) {
      root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity, info: [], label }, meta: { source: 'more' }, widget: 'details' } }));
    }
    function rowsNow() {
      if (linked()) return s.items;
      return (Array.isArray(s.demoRows) ? s.demoRows : []).map((r, i) => ({ id: `d${i}`, entity: null, name: r.name, text: r.text, state: 'ready', available: true, demo: true,
        control: r.control === 'toggle' ? { type: 'toggle', on: !!r.on } : r.control === 'run' ? { type: 'run', label: 'Run' } : null }));
    }
    function press(it) {
      if (it.demo) {                                          // an unlinked demo: it only changes itself
        const r = s.demoRows[Number(it.id.slice(1))];
        if (r && it.control.type === 'toggle') { r.on = !r.on; r.text = r.on ? 'On' : 'Off'; render(); }
        return;
      }
      if (typeof s.onRequest !== 'function' || pend.has(it.entity)) return;
      pend.set(it.entity, setTimeout(() => { pend.delete(it.entity); render(); }, 5000));
      s.onRequest(it.entity, it.control);
      render();
    }
    /** a small glyph per row: the entity id's domain when linked, the control type for a demo row (decoration only — never state) */
    const G = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const GLYPHS = { light: G('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'), switch: G('<path d="M12 3v8M7 6.5a7 7 0 1 0 10 0"/>'), cover: G('<path d="M5 4h14v16H5zM5 8h14M5 12h14M5 16h14"/>'),
      lock: G('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), climate: G('<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>'), run: G('<path d="M8 5.5v13l10-6.5z"/>'),
      sensor: G('<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>'), binary_sensor: G('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/>'), person: G('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-4 3.4-6 7-6s6.4 2 7 6"/>'), device_tracker: G('<path d="M12 21s7-6 7-11.5A7 7 0 0 0 5 9.5C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>'),
      camera: G('<path d="M4 8h3l1.6-2h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/>'), alarm_control_panel: G('<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/>'), vacuum: G('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3.5v2.2"/>'), timer: G('<circle cx="12" cy="13.5" r="7"/><path d="M12 9.5v4l2.5 1.5M9.5 3h5"/>'), weather: G('<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.6 4.7 4.7 0 0 1 17 18z"/>'), sun: G('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
      media_player: G('<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'), fan: G('<circle cx="12" cy="12" r="1.8"/><path d="M12 10c-1-4 1-7 4-6 2 1 1 4-2 5M14 12c4-1 7 1 6 4-1 2-4 1-5-2M12 14c1 4-1 7-4 6-2-1-1-4 2-5M10 12c-4 1-7-1-6-4 1-2 4-1 5 2"/>'), dot: G('<circle cx="12" cy="12" r="3.2"/>') };
    const glyphOf = (it) => { const d = String(it.entity || '').split('.')[0]; return GLYPHS[d] || (['scene', 'script', 'button', 'input_button'].includes(d) ? GLYPHS.run : it.control && it.control.type === 'run' ? GLYPHS.run : it.control && it.control.type === 'toggle' ? GLYPHS.light : it.control && it.control.type === 'move' ? GLYPHS.cover : GLYPHS.dot); };
    const WORDS = { loading: 'Loading…', missing: 'Not found', absent: 'Not reported' };

    function render() {
      $('.iq-elist__name').textContent = s.name || 'Entities';
      $('.iq-elist__sub').textContent = s.subtitle || ''; $('.iq-elist__sub').hidden = !s.subtitle;
      const rows = rowsNow();
      const empty = $('.iq-elist__empty');
      empty.hidden = rows.length > 0; empty.textContent = s.emptyText || 'No entities yet — add them in the widget’s settings.';
      const keep = list.scrollTop;
      list.replaceChildren(...rows.map((it) => {
        const li = document.createElement('li');
        li.className = 'iq-elist__row'; li.dataset.state = it.state; li.dataset.na = it.state === 'ready' && it.available ? 'false' : 'true';
        const who = document.createElement(it.demo ? 'span' : 'button');
        who.className = 'iq-elist__who';
        if (!it.demo) { who.type = 'button'; who.dataset.iqControl = ''; who.setAttribute('aria-label', `${it.name}: details`); who.addEventListener('click', (e) => { e.stopPropagation(); if (it.entity) details(it.entity, it.name); }); }
        who.innerHTML = '<b class="iq-elist__n"></b>'; who.querySelector('b').textContent = it.name;
        who.querySelector('b').title = it.name || '';            // a long name is cut on screen: the whole name on hover
        const val = document.createElement('span');
        val.className = 'iq-elist__val';
        val.textContent = it.state === 'ready' ? it.text : WORDS[it.state] || '';
        const ic = document.createElement('span'); ic.className = 'iq-elist__ic'; ic.setAttribute('aria-hidden', 'true'); ic.innerHTML = glyphOf(it); ic.dataset.on = it.control && it.control.type === 'toggle' && it.control.on ? 'true' : 'false';
        li.append(ic, who, val);
        const c = it.control;
        if (c) {
          const b = document.createElement('button');
          b.type = 'button'; b.dataset.iqControl = ''; b.dataset.type = c.type;
          if (c.type === 'toggle') { b.className = 'iq-elist__sw'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!c.on)); b.setAttribute('aria-label', `${it.name}`); b.innerHTML = '<i></i>'; }
          else { b.className = 'iq-elist__btn'; b.textContent = c.type === 'move' ? (c.verb === 'open' ? 'Open' : 'Close') : c.label || 'Run'; b.setAttribute('aria-label', `${b.textContent} ${it.name}`); }
          b.disabled = !!(it.entity && pend.has(it.entity));
          if (b.disabled) b.setAttribute('aria-busy', 'true');
          b.addEventListener('click', (e) => { e.stopPropagation(); press(it); });
          li.append(b);
        }
        return li;
      }));
      list.scrollTop = keep;
      // the shared expandable-list behaviour (components/expandlist) — off unless configured (config.list.mode = 'expand')
      if (global.IniqExpand) global.IniqExpand.apply(list, s.list || {});
      root.dataset.count = String(rows.length);
      root.setAttribute('aria-label', `${s.name || 'Entities'}: ${rows.map((r) => `${r.name} ${r.state === 'ready' ? r.text : (WORDS[r.state] || '')}`).join(', ')}`);
    }
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w) => (w >= 360 ? 'wide' : 'narrow') });
    render();
    root.entitylist = {
      getState: () => ({ rows: rowsNow().map((r) => ({ entity: r.entity, name: r.name, text: r.text, state: r.state, control: r.control ? r.control.type : null })) }),
      /** External update (Home Assistant). Never sends anything. */
      setState(patch = {}) { s = { ...s, ...patch }; if (patch.items) (patch.items || []).forEach((it) => { if (pend.has(it.entity)) { clearTimeout(pend.get(it.entity)); pend.delete(it.entity); } }); render(); },
    };
    return root;
  }

  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonEntityList = { create, constraints };
})(window);
