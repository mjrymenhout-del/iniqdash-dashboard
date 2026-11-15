/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Batteries V1 — every battery of the home in one card, the EMPTIEST FIRST: a level bar (red below the "low" threshold, orange below
   twice it, green above), the percentage, the device's name, and how many are low. Read only: a row opens the entity's details.

   MaisonBatteries.create(config) → HTMLElement (.iq-bat), with el.batteries = { getState(), setState(patch) }
   config = { id, name, low (5–50 %, default 20), max (rows shown, 1–30, default 8), only ('all' | 'low'),
     items: LINKED (binding): [{ id, entity, label, level (0–100 | null), available }] — the binding finds every battery sensor (auto) or
            uses the chosen ones; this widget sorts and cuts
     demo:  UNLINKED: [{ label, level }] }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = [{ label: 'Garden motion', level: 7 }, { label: 'Front door lock', level: 18 }, { label: 'Kitchen leak sensor', level: 41 }, { label: 'Hallway motion', level: 64 }, { label: 'Bedroom window', level: 92 }];
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 4h-1V2H9v2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H8V6h8v14Z"/></svg>';
  function create(config) {
    let s = { low: 20, max: 8, only: 'all', ...(config || {}) };
    const root = el('article', 'iq-bat', { role: 'group' });
    const head = el('header', 'iq-bat__head'), title = el('h3', 'iq-bat__title'), count = el('span', 'iq-bat__count');
    head.append(title, count);
    const list = el('ul', 'iq-bat__list'), empty = el('p', 'iq-bat__empty');
    root.append(head, list, empty);
    function render() {
      const low = Math.max(5, Math.min(50, Number(s.low) || 20)), max = Math.max(1, Math.min(30, Number(s.max) || 8));
      const all = (Array.isArray(s.items) ? s.items : (Array.isArray(s.demo) && s.demo.length ? s.demo : DEMO).map((d, i) => ({ id: `d${i}`, ...d, available: true })))
        .map((x) => ({ ...x, level: Number.isFinite(Number(x.level)) && x.level !== null && x.level !== '' ? Math.max(0, Math.min(100, Number(x.level))) : null }));
      // the emptiest first; unknown levels (unavailable) after the known ones
      all.sort((a, b) => (a.level === null) - (b.level === null) || (a.level ?? 0) - (b.level ?? 0) || String(a.label).localeCompare(String(b.label)));
      const lowN = all.filter((x) => x.level !== null && x.level < low).length;
      const shown = (s.only === 'low' ? all.filter((x) => x.level !== null && x.level < low) : all).slice(0, max);
      title.textContent = s.name || 'Batteries';
      count.textContent = lowN ? `${lowN} low` : all.length ? 'All good' : '';
      count.dataset.tone = lowN ? 'low' : 'ok';
      root.setAttribute('aria-label', `${s.name || 'Batteries'}: ${lowN ? `${lowN} low` : 'all good'}`);
      list.replaceChildren(...shown.map((x) => {
        const tone = x.level === null ? 'unknown' : x.level < low ? 'low' : x.level < low * 2 ? 'mid' : 'ok';
        const li = el('li', 'iq-bat__it'), b = el(x.entity ? 'button' : 'div', 'iq-bat__b');
        b.dataset.tone = tone;
        if (x.entity) { b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation();
          root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity: x.entity, info: [], label: x.label }, meta: { source: 'more' }, widget: 'details' } })); }); }
        const ic = el('span', 'iq-bat__ic'); ic.innerHTML = ICON;
        const name = el('span', 'iq-bat__name'); name.textContent = x.label || x.entity || '';
        const bar = el('span', 'iq-bat__bar', { 'aria-hidden': 'true' }), fill = el('span', 'iq-bat__fill'); fill.style.width = `${x.level ?? 0}%`; bar.append(fill);
        const pct = el('span', 'iq-bat__pct'); pct.textContent = x.level === null ? '—' : `${Math.round(x.level)} %`;
        b.append(ic, name, bar, pct);
        b.setAttribute('aria-label', `${name.textContent}: ${x.level === null ? 'unknown' : `${Math.round(x.level)} percent`}${tone === 'low' ? ', low' : ''}`);
        li.append(b); return li;
      }));
      empty.hidden = shown.length > 0;
      empty.textContent = s.only === 'low' && all.length ? 'No battery is low.' : 'No batteries found.';
    }
    render();
    root.batteries = { getState: () => ({ ...s }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 3 }; }
  global.MaisonBatteries = { create, constraints, DEMO };
})(window);
