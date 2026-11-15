/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Who's home V1 — the household at a glance: several people (Home Assistant person / device_tracker entities), each an avatar (their
   picture, else their initial) with a ring in their presence colour — home · away · in a zone · unknown — their name and status, and a
   count ("2 of 4 home"). Read only: a tap opens the person's Entity Details. The Person widget shows ONE person in depth; this one shows
   everyone, side by side.

   MaisonPresence.create(config) → HTMLElement (.iq-pres), with el.presence = { getState(), setState(patch) }
   config = { id, name, variant: 'row' | 'list',
     items:  LINKED (from the binding): [{ id, entity, name, picture, presence: 'home'|'away'|'zone'|'unknown'|'unavailable', zone, state, since }]
     demo:   UNLINKED (no Home Assistant): [{ name, presence, zone? }]
     showCount (default true), showStatus (default true) }
   The layout follows the widget's OWN size (container queries): avatars shrink before names are dropped; a list in a tall box.
   ========================================================================== */
(function (global) {
  'use strict';
  const STATUS = { home: 'Home', away: 'Away', unknown: 'Unknown', unavailable: 'Unavailable' };
  const DEMO = [{ name: 'Alex', presence: 'home' }, { name: 'Sam', presence: 'home' }, { name: 'Robin', presence: 'zone', zone: 'Work' }, { name: 'Charlie', presence: 'away' }];
  const SAFE_IMG = /^(?!.*\.\.)((assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|api\/ha_img\.php\?[A-Za-z0-9_.=&%-]+|\/api\/image\/serve\/[A-Za-z0-9_\/.-]+)$/;
  function create(config) {
    let s = { showCount: true, showStatus: true, ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'iq-pres';
    root.setAttribute('role', 'group');
    root.innerHTML = '<header class="iq-pres__head"><h3 class="iq-pres__name"></h3><span class="iq-pres__count"></span></header><ul class="iq-pres__list"></ul>';
    const $ = (q) => root.querySelector(q);
    function people() {
      if (Array.isArray(s.items)) return s.items;
      return (Array.isArray(s.demo) && s.demo.length ? s.demo : DEMO).map((d, i) => ({ id: `d${i}`, name: d.name, presence: d.presence, zone: d.zone, demo: true }));
    }
    function render() {
      root.dataset.variant = s.variant === 'list' ? 'list' : 'row';
      $('.iq-pres__name').textContent = s.name || "Who's home";
      const list = people();
      const home = list.filter((p) => p.presence === 'home').length;
      const cnt = $('.iq-pres__count');
      cnt.textContent = `${home} of ${list.length} home`; cnt.hidden = s.showCount === false;
      root.setAttribute('aria-label', `${s.name || "Who's home"}: ${home} of ${list.length} home`);
      const ul = $('.iq-pres__list');
      ul.replaceChildren(...list.map((p) => {
        const li = document.createElement('li');
        li.className = 'iq-pres__p'; li.dataset.presence = p.presence || 'unknown';
        const status = p.presence === 'zone' ? (p.zone || 'Away') : STATUS[p.presence] || 'Unknown';
        const b = document.createElement(p.entity ? 'button' : 'div');
        // a linked person: a tap opens Entity Details (the app's shared action channel — the same as an Entity List row)
        if (b.tagName === 'BUTTON') { b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation();
          root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity: p.entity, info: [], label: p.name }, meta: { source: 'more' }, widget: 'details' } })); }); }
        b.className = 'iq-pres__b';
        b.setAttribute('aria-label', `${p.name}: ${status}${p.since ? `, since ${p.since}` : ''}`);
        const av = document.createElement('span'); av.className = 'iq-pres__av'; av.setAttribute('aria-hidden', 'true');
        if (p.picture && SAFE_IMG.test(p.picture)) { const img = document.createElement('img'); img.alt = ''; img.src = p.picture; img.loading = 'lazy'; av.append(img); }
        else av.textContent = String(p.name || '?').trim().charAt(0).toUpperCase();
        const dot = document.createElement('span'); dot.className = 'iq-pres__dot'; av.append(dot);
        const tx = document.createElement('span'); tx.className = 'iq-pres__tx';
        const n = document.createElement('span'); n.className = 'iq-pres__n'; n.textContent = p.name || '';
        const st = document.createElement('span'); st.className = 'iq-pres__st'; st.textContent = status; st.hidden = s.showStatus === false;
        tx.append(n, st); b.append(av, tx); li.append(b);
        return li;
      }));
    }
    render();
    root.presence = { getState: () => ({ ...s }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 2 }; }
  global.MaisonPresence = { create, constraints, DEMO };
})(window);
