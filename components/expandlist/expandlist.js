/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqExpand — the shared EXPANDABLE LIST behaviour of list widgets (Entity List first; any widget with a <ul> of rows can use it).

   IniqExpand.apply(list, opts) → { expanded(), toggle(force?) }   — call after every render of the list's rows (it keeps its state)
     list    the list element (<ul>/<ol>); its row children (<li>) are the items
     opts    { mode: 'all' | 'expand' · count: rows shown collapsed (1–20, default 3) · expanded: start expanded (default false)
               control: 'arrow' | 'text' | 'button' · animate (default true) }
   'all' (the default): nothing changes — the list is what it always was (it scrolls inside its own box).
   'expand': the first `count` rows; a control reveals the rest (and hides them again). Fewer rows than `count` + 1: no control.
   Expanding never resizes the widget or its grid cell: the revealed rows scroll inside the widget's own box. The control is a real
   button (aria-expanded, aria-controls, keyboard, 44 px touch target); revealed rows fade in (none under reduced motion).
   The expanded state lives with the list element (it survives re-renders, not a reload — `expanded` sets how it starts).
   ========================================================================== */
(function (global) {
  'use strict';
  let uid = 0;
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const clean = (o = {}) => ({ mode: o.mode === 'expand' ? 'expand' : 'all', count: Math.min(20, Math.max(1, Math.round(Number(o.count) || 3))), expanded: o.expanded === true,
    control: ['arrow', 'text', 'button'].includes(o.control) ? o.control : 'button', animate: o.animate !== false });

  function apply(list, opts) {
    if (!list) return null;
    const o = clean(opts);
    const st = list.__iqx || (list.__iqx = { open: o.expanded, btn: null, startedExpanded: o.expanded });
    if (st.startedExpanded !== o.expanded) { st.open = o.expanded; st.startedExpanded = o.expanded; }   // the setting changed in the editor
    const rows = [...list.children].filter((n) => n.tagName === 'LI');
    const more = Math.max(0, rows.length - o.count);
    if (o.mode !== 'expand' || !more) {
      rows.forEach((r) => { r.hidden = false; delete r.dataset.iqxExtra; });
      if (st.btn) { st.btn.remove(); st.btn = null; }
      delete list.dataset.iqx;
      return { expanded: () => true, toggle() {} };
    }
    if (!list.id) list.id = `iqx-${++uid}`;
    list.dataset.iqx = st.open ? 'open' : 'closed';
    rows.forEach((r, i) => { const extra = i >= o.count; if (extra) r.dataset.iqxExtra = ''; else delete r.dataset.iqxExtra; r.hidden = extra && !st.open; });
    if (!st.btn) {
      st.btn = document.createElement('button');
      st.btn.type = 'button'; st.btn.className = 'iqx'; st.btn.dataset.iqControl = ''; st.btn.dataset.k = 'list-expand';
      st.btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
      list.after(st.btn);
    } else if (st.btn.previousElementSibling !== list) list.after(st.btn);
    const b = st.btn;
    b.dataset.control = o.control;
    b.setAttribute('aria-controls', list.id);
    b.setAttribute('aria-expanded', String(st.open));
    const label = st.open ? 'Show less' : `Show ${more} more`;
    b.setAttribute('aria-label', label);
    b.innerHTML = o.control === 'arrow' ? CHEV : `<span>${label}</span>${o.control === 'button' ? CHEV : ''}`;
    function toggle(force) {
      st.open = typeof force === 'boolean' ? force : !st.open;
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const extra = [...list.children].filter((n) => n.dataset && 'iqxExtra' in n.dataset);
      extra.forEach((r) => { r.hidden = !st.open; if (st.open && o.animate && !reduced && r.animate) r.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' }); });
      apply(list, opts);
      if (st.open && extra[0] && extra[0].scrollIntoView) extra[0].scrollIntoView({ block: 'nearest' });   // inside the list's own box only
    }
    return { expanded: () => st.open, toggle };
  }

  global.IniqExpand = { apply, clean };
})(window);
