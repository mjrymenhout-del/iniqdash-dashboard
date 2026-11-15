/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Readings V1 — a few values side by side in ONE card: each a coloured bar, its value large with its unit, and a label ("18.2 °C ·
   Indoor temp", "61 % · Humidity"). Two columns by default, thin dividers between. Read only: a tap opens the entity's details.

   MaisonReadings.create(config) → HTMLElement (.iq-rd), with el.readings = { getState(), setState(patch) }
   config = { id, columns (1–4, default 2),
     items: LINKED (binding): [{ id, entity, label, color, value (text), unit, available }]
     demo:  UNLINKED: [{ label, value, unit, color }] }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = [{ label: 'Indoor temp', value: '20.6', unit: '°C', color: 'danger' }, { label: 'Outdoor temp', value: '10.2', unit: '°C', color: 'warning' },
    { label: 'Humidity', value: '46', unit: '%', color: 'info' }, { label: 'Wind', value: '9', unit: 'km/h', color: 'purple' }];
  const TOKENS = { danger: 'var(--danger, #ff5d6c)', warning: 'var(--warning, #fc8427)', info: 'var(--info, #3fb6ff)', success: 'var(--success, #3ddc84)', accent: 'var(--accent)', purple: '#a74cff', yellow: '#ffcb42' };
  const colour = (c) => TOKENS[c] || (/^#[0-9a-f]{6}$/i.test(c || '') ? c : TOKENS.accent);
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  function create(config) {
    let s = { columns: 2, ...(config || {}) };
    const root = el('article', 'iq-rd', { role: 'group' });
    const grid = el('ul', 'iq-rd__grid'); root.append(grid);
    let lastNarrow = null;
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { const n = root.getBoundingClientRect().width < 400; if (n !== lastNarrow) { lastNarrow = n; render(); } }).observe(root);
    function render() {
      const list = Array.isArray(s.items) ? s.items : (Array.isArray(s.demo) && s.demo.length ? s.demo : DEMO).map((d, i) => ({ id: `d${i}`, ...d, available: true }));
      // a narrow card (a phone) shows at most two columns: three or four values side by side would overflow their cells
      const want = Math.max(1, Math.min(4, Number(s.columns) || 2)), w = root.getBoundingClientRect().width;
      const cols = w > 0 && w < 400 ? Math.min(want, 2) : want;
      root.style.setProperty('--rd-cols', String(cols)); root.dataset.cols = String(cols);
      root.setAttribute('aria-label', s.name || 'Readings');
      grid.replaceChildren(...list.map((x, i) => {
        const li = el('li', 'iq-rd__it');
        if (i % cols !== 0) li.dataset.left = '';
        if (i >= cols) li.dataset.top = '';
        const b = el(x.entity ? 'button' : 'div', 'iq-rd__b');
        if (x.entity) { b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation();
          root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity: x.entity, info: [], label: x.label }, meta: { source: 'more' }, widget: 'details' } })); }); }
        b.style.setProperty('--rd-c', colour(x.color));
        const v = el('span', 'iq-rd__v'), u = el('span', 'iq-rd__u'), l = el('span', 'iq-rd__l');
        v.textContent = x.available === false ? '—' : (x.value ?? '—'); u.textContent = x.available === false ? '' : (x.unit || '');
        l.textContent = x.label || ''; if (x.label) l.title = x.label;
        const val = el('span', 'iq-rd__val'); val.append(v, u);
        b.append(el('span', 'iq-rd__bar', { 'aria-hidden': 'true' }), val, l);
        b.setAttribute('aria-label', `${x.label || ''}: ${v.textContent} ${u.textContent}`.trim());
        li.append(b); return li;
      }));
    }
    render();
    root.readings = { getState: () => ({ ...s }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }
  global.MaisonReadings = { create, constraints, DEMO };
})(window);
