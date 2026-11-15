/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Notification Centre V1 — a bell with an unread counter that opens the dashboard's notification inbox.

   THE INBOX (one per dashboard, in this browser — localStorage, never sent anywhere):
     MaisonInbox.store(key) → { list(), unread(), add(entry), markRead(id), markAllRead(), dismiss(id), clear(), reset(seed), seedOnce(seed),
                                on(fn) → off }
     entry = { title, message?, icon? ('mdi:…'), tone? ('info' | 'success' | 'warning' | 'danger'), category?, time? (ms), read?, demo? }
   The application adds every notification it SHOWS (MaisonNotify center) to the current dashboard's inbox; a widget only reads it.

   MaisonInbox.create(config) → HTMLElement (.ibx)
     config = { name ('Notifications'), showLabel (false), seed: [{ title, message, icon, tone, category, ago (minutes), read }],
                storeKey (the dashboard's id — the host supplies it), resetOn (an entity whose change resets the inbox to its seed),
                onReset? }   — the seed (demo entries) is added once, the first time this dashboard's inbox is empty and new.
   The panel: newest first, each entry with its icon, title, message, category and time; a click marks it read; × dismisses it;
   Mark all as read; Clear all. Escape / a click outside closes it; on a narrow screen it is a sheet. Reduced motion: no animation.
   ========================================================================== */
(function (global) {
  'use strict';
  const STORES = new Map();
  const TONES = ['info', 'success', 'warning', 'danger'];
  const safe = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
  function store(key) {
    const k = `iniqdash.inbox.${String(key || 'default').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'default'}`;
    if (STORES.has(k)) return STORES.get(k);
    let data = { seeded: false, items: [] };
    try { const j = JSON.parse(localStorage.getItem(k) || 'null'); if (j && Array.isArray(j.items)) data = { seeded: !!j.seeded, items: j.items.slice(0, 100) }; } catch (e) { /* none */ }
    const subs = new Set();
    const save = () => { try { localStorage.setItem(k, JSON.stringify(data)); } catch (e) { /* private mode: in memory only */ } subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); };
    let seq = 0;
    const norm = (e) => ({ id: `n${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: safe(e.title || 'Notification', 80), message: safe(e.message, 240),
      icon: /^mdi:[a-z0-9-]{1,64}$/.test(e.icon || '') ? e.icon : 'mdi:bell-outline', tone: TONES.includes(e.tone) ? e.tone : 'info', category: safe(e.category, 24),
      time: Number.isFinite(e.time) ? e.time : Date.now(), read: !!e.read, demo: !!e.demo });
    const fromSeed = (seed) => (Array.isArray(seed) ? seed : []).slice(0, 30).map((s) => norm({ ...s, time: Date.now() - Math.max(0, Number(s.ago) || 0) * 60000, demo: true }));
    const api = {
      list: () => data.items.slice().sort((a, b) => b.time - a.time),
      unread: () => data.items.filter((x) => !x.read).length,
      add(e) { data.items.push(norm(e || {})); if (data.items.length > 100) data.items = data.items.sort((a, b) => b.time - a.time).slice(0, 100); save(); },
      markRead(id) { const x = data.items.find((i) => i.id === id); if (x && !x.read) { x.read = true; save(); } },
      markAllRead() { data.items.forEach((x) => { x.read = true; }); save(); },
      dismiss(id) { data.items = data.items.filter((i) => i.id !== id); save(); },
      clear() { data.items = []; save(); },
      reset(seed) { data = { seeded: true, items: fromSeed(seed) }; save(); },
      seedOnce(seed) { if (data.seeded) return; data.seeded = true; data.items = [...fromSeed(seed), ...data.items]; save(); },
      on(fn) { subs.add(fn); return () => subs.delete(fn); },
    };
    STORES.set(k, api);
    return api;
  }
  // the dashboard shown now (the host sets it; ?d=… otherwise)
  let current = null;
  const currentKey = () => current || new URLSearchParams(location.search).get('d') || 'default';

  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" fill="currentColor"/></svg>';
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
  function ago(t) {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function el(tag, cls, attrs = {}) { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => { if (v != null) n.setAttribute(k, v); }); return n; }

  let openPanel = null;                                     // one panel at a time
  function create(config = {}) {
    const c = config;
    const st = store(c.storeKey || currentKey());
    if (Array.isArray(c.seed) && c.seed.length) st.seedOnce(c.seed);
    const root = el('div', 'ibx');
    const listMode = c.variant === 'list';
    root.dataset.variant = listMode ? 'list' : 'bell';
    const btn = el('button', 'ibx__btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    btn.innerHTML = `<span class="ibx__bell">${BELL}</span><span class="ibx__count" aria-hidden="true"></span><span class="ibx__label"></span>`;
    const label = c.name || 'Notifications';
    /* LIST: the notification centre ON the dashboard — a header (name, unread count, Mark all as read) and the most recent notifications,
       each readable, markable as read and dismissible right there (the same store as the bell) */
    let lv = null;
    if (listMode) {
      lv = el('section', 'ibx-l', { 'aria-label': label });
      lv.innerHTML = `<header class="ibx-l__head"><h3 class="ibx-l__h"></h3><span class="ibx-l__n"></span><button type="button" class="ibx-l__all">Mark all as read</button></header><ul class="ibx-p__list ibx-l__list"></ul>`;
      lv.querySelector('.ibx-l__h').textContent = label;
      lv.querySelector('.ibx-l__all').addEventListener('click', () => st.markAllRead());
      root.append(lv);
    } else root.append(btn);
    root.dataset.label = c.showLabel ? 'on' : 'off';
    btn.querySelector('.ibx__label').textContent = label;
    function paint() {
      if (lv) {
        const n = st.unread();
        lv.querySelector('.ibx-l__n').textContent = n ? `${n} new` : 'All read';
        lv.querySelector('.ibx-l__n').dataset.unread = n ? 'yes' : 'no';
        lv.querySelector('.ibx-l__all').disabled = !n;
        root.dataset.unread = n ? 'yes' : 'no';
        itemsInto(lv.querySelector('.ibx-l__list'), st.list(), Number.isInteger(c.max) ? c.max : 6);
        return;
      }
      const n = st.unread();
      const cnt = btn.querySelector('.ibx__count');
      cnt.textContent = n > 99 ? '99+' : String(n);
      cnt.hidden = n === 0;
      root.dataset.unread = n ? 'yes' : 'no';
      btn.setAttribute('aria-label', `${label}: ${n} unread`);
      if (openPanel && openPanel.owner === root) renderList(openPanel.panel);
    }
    const off = st.on(paint);
    paint();
    /** one notification: icon in its category colour, title, message, category · time · demo, unread dot; tap = read, × = dismiss */
    function itemsInto(list, items, max) {
      list.replaceChildren();
      if (!items.length) { const e = el('li', 'ibx-p__empty'); e.textContent = 'You are all caught up.'; list.append(e); return; }
      items.slice(0, max || items.length).forEach((x) => {
        const li = el('li', `ibx-p__item${x.read ? '' : ' is-unread'}`, { 'data-tone': x.tone, 'data-id': x.id });
        const main = el('button', 'ibx-p__main', { type: 'button', 'aria-label': `${x.title}${x.read ? '' : ' (unread)'} — mark as read` });
        const ico = el('span', 'ibx-p__icon', { 'data-mdi': x.icon, 'aria-hidden': 'true' });
        const txt = el('span', 'ibx-p__txt');
        const t = el('span', 'ibx-p__title'); t.textContent = x.title;
        const m = el('span', 'ibx-p__msg'); m.textContent = x.message; m.hidden = !x.message;
        const meta = el('span', 'ibx-p__meta'); meta.textContent = [x.category, ago(x.time), x.demo ? 'demo' : ''].filter(Boolean).join(' · ');
        txt.append(t, m, meta);
        main.append(ico, txt);
        main.addEventListener('click', () => st.markRead(x.id));
        const del = el('button', 'ibx-p__del', { type: 'button', 'aria-label': `Dismiss: ${x.title}`, title: 'Dismiss' });
        del.innerHTML = X;
        del.addEventListener('click', (ev) => { ev.stopPropagation(); st.dismiss(x.id); });
        li.append(main, del);
        list.append(li);
      });
      if (global.IniqIcons) global.IniqIcons.fill(list);
    }
    function renderList(panel) {
      const items = st.list();
      panel.querySelector('.ibx-p__all').disabled = !st.unread();
      panel.querySelector('.ibx-p__clear').disabled = !items.length;
      itemsInto(panel.querySelector('.ibx-p__list'), items);
    }
    function close() {
      if (!openPanel || openPanel.owner !== root) return;
      const { panel, cleanup } = openPanel;
      openPanel = null; cleanup();
      btn.setAttribute('aria-expanded', 'false');
      panel.classList.add('is-leaving');
      setTimeout(() => panel.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
      btn.focus({ preventScroll: true });
    }
    function open() {
      if (openPanel) { const o = openPanel; if (o.owner === root) { close(); return; } o.close(); }
      const panel = el('section', 'ibx-p', { role: 'dialog', 'aria-label': label });
      panel.innerHTML = `<header class="ibx-p__head"><h2 class="ibx-p__h"></h2><button type="button" class="ibx-p__all">Mark all as read</button>
        <button type="button" class="ibx-p__x" aria-label="Close">${X}</button></header><ul class="ibx-p__list"></ul>
        <footer class="ibx-p__foot"><button type="button" class="ibx-p__clear">Clear all</button></footer>`;
      panel.querySelector('.ibx-p__h').textContent = label;
      panel.querySelector('.ibx-p__all').addEventListener('click', () => st.markAllRead());
      panel.querySelector('.ibx-p__clear').addEventListener('click', () => st.clear());
      panel.querySelector('.ibx-p__x').addEventListener('click', close);
      document.body.append(panel);
      // on the page body the panel is outside the themed dashboard: it takes the dashboard's theme (MaisonTheme's active theme)
      if (global.MaisonTheme && global.MaisonTheme.scope) global.MaisonTheme.scope(panel);
      // beside the bell (below it, aligned to its right edge); on a narrow screen a sheet from the bottom
      const r = btn.getBoundingClientRect(), narrow = innerWidth < 560;
      panel.dataset.layout = narrow ? 'sheet' : 'drop';
      if (!narrow) {
        const w = Math.min(380, innerWidth - 24);
        panel.style.width = `${w}px`;
        panel.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.right - w))}px`;
        const below = r.bottom + 10, room = innerHeight - below - 16;
        if (room >= 260) { panel.style.top = `${below}px`; panel.style.maxHeight = `${room}px`; } else { panel.style.bottom = `${Math.max(12, innerHeight - r.top + 10)}px`; panel.style.maxHeight = `${Math.max(240, r.top - 26)}px`; }
      }
      renderList(panel);
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
      const onDown = (e) => { if (!panel.contains(e.target) && !root.contains(e.target)) close(); };
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
      openPanel = { owner: root, panel, close, cleanup: () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); } };
      btn.setAttribute('aria-expanded', 'true');
      (panel.querySelector('.ibx-p__all:not(:disabled)') || panel.querySelector('.ibx-p__x')).focus({ preventScroll: true });
    }
    btn.addEventListener('click', open);
    // an entity whose change resets the inbox to its seed (e.g. the demo's "Reset the demo home" button)
    if (c.resetOn && global.IniqHA && global.IniqHA.enabled && global.IniqHA.enabled()) {
      let last;
      const un = global.IniqHA.subscribe(c.resetOn, (s) => { const v = s && (s.last_changed || s.state); if (last !== undefined && v !== last) st.reset(c.seed); last = v; });
      root.ibxOff = un;
    }
    root.inbox = { store: st, open, close };
    const mo = new MutationObserver(() => { if (!root.isConnected) { off(); if (root.ibxOff) root.ibxOff(); if (openPanel && openPanel.owner === root) close(); mo.disconnect(); } });
    requestAnimationFrame(() => { if (root.parentNode) mo.observe(document.body, { childList: true, subtree: true }); });
    return root;
  }
  function constraints(c = {}) { return c.variant === 'list' ? { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 3 } : { minW: { desktop: 1, tablet: 1, mobile: 1 }, minH: 1 }; }
  global.MaisonInbox = { create, constraints, store, setCurrent: (k) => { current = k || null; }, current: () => store(currentKey()) };
})(window);
