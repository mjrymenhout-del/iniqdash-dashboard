/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Updates V1 — the update.* entities chosen: which have an update waiting (installed → latest version), the release notes link, an
   install in progress (with its percentage), and those already up to date (folded, or hidden).

   Installing is NEVER one tap: "Install" asks again ("Install now?" with a Cancel), and the second tap must come within 6 seconds. A
   backup before installing is offered (ticked) only when the update entity supports it. Install is offered only when Home Assistant
   says the entity can install. The server checks all of this again.

   MaisonUpdates.create(config) → .iq-upd, el.updates = { getState(), setState(patch) }
   config = { name, upToDate: 'fold' | 'show' | 'hide', items: LINKED [view…] | demo, onRequest(entity, { install: true, backup }) }
   view = { entity, name, available, pending (update waiting), installed, latest, url, canInstall, canBackup, inProgress, pct }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = [
    { entity: 'd1', name: 'Home core', available: true, pending: true, installed: '2026.10.4', latest: '2026.11.1', canInstall: true, canBackup: true },
    { entity: 'd2', name: 'Router firmware', available: true, pending: true, installed: '7.2.0', latest: '7.3.1', canInstall: true },
    { entity: 'd3', name: 'Hallway sensor', available: true, pending: false, installed: '1.4.2', latest: '1.4.2', canInstall: true },
  ];
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const SAFE = /^https:\/\/[^\s"'<>]+$/;
  function create(config) {
    let s = { name: 'Updates', upToDate: 'fold', ...(config || {}) };
    let open = false, arming = null, armT = 0;
    const backup = new Map();
    const local = DEMO.map((x) => ({ ...x }));
    const root = el('article', 'iq-upd', { role: 'group' });
    root.innerHTML = `<header class="iq-upd__head"><h3 class="iq-upd__name"></h3><span class="iq-upd__sum"></span></header>
      <ul class="iq-upd__list"></ul><button type="button" class="iq-upd__fold" aria-expanded="false"></button><ul class="iq-upd__ok"></ul>`;
    const $ = (q) => root.querySelector(q);
    const list = () => (Array.isArray(s.items) ? s.items : local);
    const disarm = () => { arming = null; clearTimeout(armT); };
    function install(u) {
      const b = backup.get(u.entity) !== false && !!u.canBackup;
      disarm();
      if (Array.isArray(s.items)) { if (typeof s.onRequest === 'function') s.onRequest(u.entity, { install: true, backup: b }); u.inProgress = true; }
      else { u.inProgress = true; render(); setTimeout(() => { u.inProgress = false; u.pending = false; u.installed = u.latest; render(); }, 1600); }
      render();
    }
    function row(u) {
      const li = el('li', 'iq-upd__item'); li.dataset.entity = u.entity; li.dataset.state = u.available === false ? 'off' : u.inProgress ? 'busy' : u.pending ? 'pending' : 'ok';
      const info = el('div', 'iq-upd__info'), n = el('b'), v = el('span');
      n.textContent = u.name || u.entity;
      v.textContent = u.available === false ? 'Unavailable' : u.inProgress ? `Installing${Number.isFinite(u.pct) ? ` · ${Math.round(u.pct)}%` : '…'}`
        : u.pending ? `${u.installed || '?'} → ${u.latest || '?'}` : `Up to date${u.installed ? ` · ${u.installed}` : ''}`;
      info.append(n, v);
      if (u.inProgress && Number.isFinite(u.pct)) { const bar = el('i', 'iq-upd__bar'); bar.style.setProperty('--iq-upd-p', `${Math.max(0, Math.min(100, u.pct))}%`); info.append(bar); }
      li.append(info);
      if (u.pending && u.url && SAFE.test(u.url)) { const a = el('a', 'iq-upd__notes', { href: u.url, target: '_blank', rel: 'noopener noreferrer' }); a.textContent = 'Notes'; a.addEventListener('click', (e) => e.stopPropagation()); li.append(a); }
      if (u.pending && u.available !== false && !u.inProgress && u.canInstall) {
        const box = el('div', 'iq-upd__act');
        if (arming === u.entity) {
          if (u.canBackup) {
            const lab = el('label', 'iq-upd__bk'), cb = el('input', '', { type: 'checkbox' });
            cb.checked = backup.get(u.entity) !== false; cb.addEventListener('click', (e) => e.stopPropagation()); cb.addEventListener('change', () => backup.set(u.entity, cb.checked));
            lab.append(cb, document.createTextNode('Backup first')); box.append(lab);
          }
          const yes = el('button', 'iq-upd__btn iq-upd__btn--go', { type: 'button' }), no = el('button', 'iq-upd__btn', { type: 'button' });
          yes.textContent = 'Install now'; no.textContent = 'Cancel';
          yes.addEventListener('click', (e) => { e.stopPropagation(); install(u); });
          no.addEventListener('click', (e) => { e.stopPropagation(); disarm(); render(); });
          box.append(no, yes);
        } else {
          const b = el('button', 'iq-upd__btn', { type: 'button', 'aria-label': `Install ${u.name || u.entity} ${u.latest || ''}`.trim() });
          b.textContent = 'Install';
          b.addEventListener('click', (e) => { e.stopPropagation(); disarm(); arming = u.entity; armT = setTimeout(() => { disarm(); render(); }, 6000); render(); });
          box.append(b);
        }
        li.append(box);
      }
      return li;
    }
    function render() {
      const all = list(), waiting = all.filter((u) => u.pending || u.inProgress || u.available === false), ok = all.filter((u) => !waiting.includes(u));
      $('.iq-upd__name').textContent = s.name || 'Updates';
      const n = all.filter((u) => u.pending && u.available !== false).length;
      $('.iq-upd__sum').textContent = n ? `${n} available` : all.length ? 'All up to date' : 'No update entities';
      root.dataset.pending = String(n > 0);
      $('.iq-upd__list').replaceChildren(...waiting.map(row));
      const mode = s.upToDate || 'fold', fold = $('.iq-upd__fold');
      fold.hidden = mode !== 'fold' || !ok.length;
      fold.textContent = `${open ? 'Hide' : 'Show'} ${ok.length} up to date`; fold.setAttribute('aria-expanded', String(open));
      const ul = $('.iq-upd__ok'); ul.hidden = mode === 'hide' || !ok.length || (mode === 'fold' && !open);
      ul.replaceChildren(...(ul.hidden ? [] : ok.map(row)));
      root.setAttribute('aria-label', `${s.name || 'Updates'}: ${$('.iq-upd__sum').textContent}`);
    }
    $('.iq-upd__fold').addEventListener('click', (e) => { e.stopPropagation(); open = !open; render(); });
    render();
    root.updates = { getState: () => ({ ...s, arming }), setState(p) { s = { ...s, ...(p || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 4 }; }
  global.MaisonUpdates = { create, constraints, DEMO };
})(window);
