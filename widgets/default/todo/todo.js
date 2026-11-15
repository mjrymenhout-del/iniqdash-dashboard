/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   To-do V1 — one or several Home Assistant to-do lists (shopping list, Local To-do, CalDAV, …): the open items, ticked items (shown or
   folded away), tick / untick, and adding an item. Several lists: tabs, one at a time.

   Nothing is assumed: adding is offered only when the list supports creating items, ticking only when it supports updating them
   (as Home Assistant reports). A list that cannot be loaded says so; the other lists keep working.

   MaisonTodo.create(config) → .iq-todo, el.todo = { getState(), setState(patch) }
   config = { name, showDone: 'fold' | 'show' | 'hide', items: LINKED [list view…] | demo, onRequest(entity, ctl) }
   list view = { entity, name, available, canAdd, canUpdate, loading, message, items: [{ uid, summary, status, due? }] }
   ctl = { add: text } | { complete: uid } | { reopen: uid }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = [
    { entity: 'd-shop', name: 'Shopping list', available: true, canAdd: true, canUpdate: true,
      items: [['Milk'], ['Bread'], ['Apples'], ['Coffee beans', 1]].map(([s, d], i) => ({ uid: `s${i}`, summary: s, status: d ? 'completed' : 'needs_action' })) },
    { entity: 'd-chores', name: 'Chores', available: true, canAdd: true, canUpdate: true,
      items: [['Water the plants'], ['Change the bed sheets'], ['Take the bins out', 1]].map(([s, d], i) => ({ uid: `c${i}`, summary: s, status: d ? 'completed' : 'needs_action' })) },
  ];
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const dueText = (d) => {
    if (!d) return '';
    const t = new Date(/T/.test(d) ? d : `${d}T00:00:00`);
    if (Number.isNaN(t.getTime())) return '';
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - day) / 864e5);
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n < 0 ? `${-n} days late` : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  function create(config) {
    let s = { name: 'To-do', showDone: 'fold', ...(config || {}) };
    let tab = 0, open = false;
    const local = DEMO.map((l) => ({ ...l, items: l.items.map((x) => ({ ...x })) }));
    const pending = new Map();   // uid → status asked for, until Home Assistant answers
    const root = el('article', 'iq-todo', { role: 'group' });
    root.innerHTML = `<header class="iq-todo__head"><h3 class="iq-todo__name"></h3><span class="iq-todo__count"></span></header>
      <div class="iq-todo__tabs" role="tablist"></div><p class="iq-todo__msg" role="status"></p>
      <ul class="iq-todo__list"></ul><button type="button" class="iq-todo__fold" aria-expanded="false"></button><ul class="iq-todo__done"></ul>
      <form class="iq-todo__add"><input type="text" maxlength="200" placeholder="Add an item" aria-label="New item"><button type="submit" aria-label="Add">+</button></form>`;
    const $ = (q) => root.querySelector(q);
    const lists = () => (Array.isArray(s.items) ? s.items : local);
    const linked = () => Array.isArray(s.items);
    const ask = (l, ctl) => { if (linked() && typeof s.onRequest === 'function') s.onRequest(l.entity, ctl); };
    function row(l, x) {
      const st = pending.get(x.uid) || x.status, done = st === 'completed';
      const li = el('li', 'iq-todo__item'); li.dataset.done = String(done);
      const b = el('button', 'iq-todo__tick', { type: 'button', role: 'checkbox', 'aria-checked': String(done), 'aria-label': x.summary });
      b.disabled = !l.canUpdate || !x.uid;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = done ? 'needs_action' : 'completed';
        if (linked()) { pending.set(x.uid, next); setTimeout(() => { pending.delete(x.uid); render(); }, 8000); ask(l, done ? { reopen: x.uid } : { complete: x.uid }); } else x.status = next;
        render();
      });
      const t = el('span', 'iq-todo__text'); t.textContent = x.summary;
      li.append(b, t);
      const due = dueText(x.due);
      if (due) { const d = el('small', 'iq-todo__due'); d.textContent = due; d.dataset.late = String(/late|Yesterday/.test(due)); li.append(d); }
      return li;
    }
    function render() {
      const all = lists();
      if (tab >= all.length) tab = 0;
      const l = all[tab] || { name: '', items: [], available: false };
      $('.iq-todo__name').textContent = s.name || (all.length === 1 ? l.name : 'To-do');
      const tabs = $('.iq-todo__tabs'); tabs.hidden = all.length < 2;
      tabs.replaceChildren(...all.map((x, i) => { const b = el('button', 'iq-todo__tab', { type: 'button', role: 'tab', 'aria-selected': String(i === tab) });
        const n = (x.items || []).filter((y) => (pending.get(y.uid) || y.status) !== 'completed').length;
        b.textContent = x.name; if (x.available !== false && n) { const c = el('span'); c.textContent = String(n); b.append(c); }
        b.addEventListener('click', (e) => { e.stopPropagation(); tab = i; render(); }); return b; }));
      const items = Array.isArray(l.items) ? l.items : [];
      const todo = items.filter((x) => (pending.get(x.uid) || x.status) !== 'completed'), done = items.filter((x) => (pending.get(x.uid) || x.status) === 'completed');
      $('.iq-todo__count').textContent = l.available === false ? '' : todo.length ? `${todo.length} to do` : items.length ? 'All done' : '';
      const msg = l.available === false ? (l.message || 'This list is unavailable') : l.loading && !items.length ? 'Loading…' : l.message || (!items.length ? 'Nothing on this list' : '');
      $('.iq-todo__msg').textContent = msg; $('.iq-todo__msg').hidden = !msg;
      $('.iq-todo__list').replaceChildren(...todo.map((x) => row(l, x)));
      const mode = s.showDone || 'fold', fold = $('.iq-todo__fold');
      fold.hidden = mode !== 'fold' || !done.length;
      fold.textContent = `${open ? 'Hide' : 'Show'} ${done.length} done`; fold.setAttribute('aria-expanded', String(open));
      const dl = $('.iq-todo__done');
      dl.hidden = mode === 'hide' || !done.length || (mode === 'fold' && !open);
      dl.replaceChildren(...(dl.hidden ? [] : done.map((x) => row(l, x))));
      $('.iq-todo__add').hidden = !l.canAdd || l.available === false;
      root.setAttribute('aria-label', `${l.name || s.name}: ${todo.length} to do`);
    }
    $('.iq-todo__fold').addEventListener('click', (e) => { e.stopPropagation(); open = !open; render(); });
    $('.iq-todo__add').addEventListener('click', (e) => e.stopPropagation());
    $('.iq-todo__add').addEventListener('submit', (e) => {
      e.preventDefault(); e.stopPropagation();
      const inp = $('.iq-todo__add input'), text = inp.value.replace(/[<>]/g, '').trim();
      const l = lists()[tab];
      if (!text || !l || !l.canAdd) return;
      if (linked()) { ask(l, { add: text }); l.items = [...(l.items || []), { uid: null, summary: text, status: 'needs_action' }]; } else l.items.push({ uid: `n${Date.now()}`, summary: text, status: 'needs_action' });
      inp.value = ''; render();
    });
    render();
    root.todo = { getState: () => ({ ...s, tab }), setState(p) { s = { ...s, ...(p || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 5 }; }
  global.MaisonTodo = { create, constraints, DEMO };
})(window);
