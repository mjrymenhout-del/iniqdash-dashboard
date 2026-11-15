/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Live Activity Widget V1 — what is ACTIVE in the home right now, as a stack of activity cards (Active Status mode).

   MaisonActivity.create(config) → HTMLElement (.iq-act), with el.activity = { getState(), setState(patch) }
   MaisonActivity.entry(e) → HTMLElement (.iq-act__entry)   the reusable ACTIVITY ENTRY (icon · title · status · detail · badge · value)

   config = {
     id, name, subtitle
     items:   LINKED (the HA binding): [{ id, entity, domain, name, text, detail, active, changed (ms), state: 'loading'|'missing'|'ready', available }]
              (Home Assistant's words — nothing is invented; "active" is decided by the binding from the condition you chose)
     demoItems: UNLINKED demo: the same shape, labelled Demo by the registry
     show:    'active' (default: only what is active) | 'all'
     order:   'list' (your order) | 'recent' (most recently changed first — Home Assistant's last_changed)
     max:     at most this many entries (1–20, default 6)
     emptyText, list (the shared expandable list), look per entry / per type / default:
     style:   { color?, icon?, background?: 'tint' | 'solid' | 'surface', badge? }        the widget default
     types:   [{ domain, color?, icon?, background?, badge? }]                            per entity TYPE (domain)
     entries: [{ entity, …, color?, icon?, background?, badge? }]                          per ENTITY (wins)
   }
   Precedence: the entity's own look > its type's look > the widget default. A tap opens Entity Details (the system surface); this
   widget never runs a Home Assistant action itself.
   ========================================================================== */
(function (global) {
  'use strict';
  const ICON = { light: 'mdi:lightbulb', switch: 'mdi:power-plug', fan: 'mdi:fan', climate: 'mdi:fire', binary_sensor: 'mdi:alert-circle-outline', sensor: 'mdi:gauge', media_player: 'mdi:music', cover: 'mdi:window-shutter',
    lock: 'mdi:lock', alarm_control_panel: 'mdi:shield-home', vacuum: 'mdi:robot-vacuum', input_boolean: 'mdi:toggle-switch', person: 'mdi:account', device_tracker: 'mdi:map-marker', water_heater: 'mdi:water-boiler', default: 'mdi:circle-medium' };
  const TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const colour = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : TOKENS.includes(v) ? `var(--${v})` : null);
  const BG = ['tint', 'solid', 'surface'];

  /** the reusable ACTIVITY ENTRY (a future Studio element): plain text only, colours as tokens / #rrggbb */
  function entry(e = {}) {
    const li = document.createElement('li');
    li.className = 'iq-act__entry';
    li.dataset.bg = BG.includes(e.background) ? e.background : 'tint';
    li.dataset.active = String(!!e.active);
    if (e.state && e.state !== 'ready') li.dataset.state = e.state;
    const c = colour(e.color); if (c) li.style.setProperty('--iq-act-c', c);
    const b = document.createElement(e.onOpen ? 'button' : 'div');
    b.className = 'iq-act__btn';
    if (e.onOpen) { b.type = 'button'; b.dataset.iqControl = ''; b.addEventListener('click', (ev) => { ev.stopPropagation(); e.onOpen(); }); }
    const ic = document.createElement('span'); ic.className = 'iq-act__ic'; ic.setAttribute('aria-hidden', 'true');
    const id = typeof e.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(e.icon) ? e.icon : ICON[e.domain] || ICON.default;
    ic.dataset.mdi = id; if (global.IniqIcons) global.IniqIcons.fill(ic);
    const tx = document.createElement('span'); tx.className = 'iq-act__tx';
    const t = document.createElement('b'); t.className = 'iq-act__title'; t.textContent = e.title || '';
    const s = document.createElement('span'); s.className = 'iq-act__status'; s.textContent = e.text || '';
    tx.append(t, s);
    if (e.detail) { const d = document.createElement('span'); d.className = 'iq-act__detail'; d.textContent = e.detail; tx.append(d); }
    b.append(ic, tx);
    if (e.badge) { const bd = document.createElement('span'); bd.className = 'iq-act__badge'; bd.textContent = String(e.badge).slice(0, 12); b.append(bd); }
    b.setAttribute('aria-label', [e.title, e.text, e.detail].filter(Boolean).join(', ') + (e.onOpen ? ' — details' : ''));
    li.append(b);
    return li;
  }

  function create(config) {
    let s = { ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'iq-act';
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqActId = s.id;
    root.innerHTML = '<header class="iq-act__head"><div class="iq-act__ids"><h3 class="iq-act__name"></h3><p class="iq-act__sub"></p></div><span class="iq-act__count"></span></header><ul class="iq-act__list"></ul><p class="iq-act__empty" hidden></p>';
    const $ = (q) => root.querySelector(q);
    const list = $('.iq-act__list');
    const details = (it) => root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity: it.entity, info: [], label: it.name }, meta: { source: 'activity' }, widget: 'details' } }));
    /** the look of one item: the entity's own > its type's > the widget default */
    function lookOf(it) {
      const own = (Array.isArray(s.entries) ? s.entries : []).find((x) => x && x.entity === it.entity) || {};
      const type = (Array.isArray(s.types) ? s.types : []).find((x) => x && x.domain === it.domain) || {};
      const def = s.style || {};
      const pick = (k) => (own[k] !== undefined && own[k] !== '' ? own[k] : type[k] !== undefined && type[k] !== '' ? type[k] : def[k]);
      return { color: pick('color'), icon: pick('icon'), background: pick('background'), badge: pick('badge') };
    }
    function render() {
      $('.iq-act__name').textContent = s.name || 'Live activity';
      $('.iq-act__sub').textContent = s.subtitle || ''; $('.iq-act__sub').hidden = !s.subtitle;
      const all = Array.isArray(s.items) ? s.items : Array.isArray(s.demoItems) ? s.demoItems : [];
      let rows = s.show === 'all' ? all.slice() : all.filter((x) => x.active);
      if (s.order === 'recent') rows.sort((a, b) => (b.changed || 0) - (a.changed || 0));
      const max = Math.min(20, Math.max(1, Math.round(Number(s.max) || 6)));
      rows = rows.slice(0, max);
      const nActive = all.filter((x) => x.active).length;
      $('.iq-act__count').textContent = `${nActive} active`; $('.iq-act__count').hidden = !all.length;
      list.replaceChildren(...rows.map((it) => {
        const L = lookOf(it);
        const text = it.state === 'loading' ? 'Loading…' : it.state === 'missing' ? 'Not found' : it.text;
        return entry({ title: it.name, text, detail: it.detail, active: it.active, state: it.state, domain: it.domain, color: L.color, icon: L.icon, background: L.background, badge: L.badge,
          onOpen: it.entity && !it.demo ? () => details(it) : null });
      }));
      const empty = $('.iq-act__empty');
      empty.hidden = rows.length > 0;
      empty.textContent = s.emptyText || (all.length ? 'Nothing active right now.' : 'No entities yet — add them in the widget’s settings.');
      if (global.IniqExpand) global.IniqExpand.apply(list, s.list || {});
      root.dataset.count = String(rows.length);
      root.setAttribute('aria-label', `${s.name || 'Live activity'}: ${nActive} active${rows.length ? ` — ${rows.map((r) => `${r.name} ${r.text || ''}`).join(', ')}` : ''}`);
    }
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w) => (w >= 360 ? 'wide' : 'narrow') });
    render();
    root.activity = {
      getState: () => ({ items: (s.items || s.demoItems || []).map((x) => ({ entity: x.entity, active: !!x.active, text: x.text })) }),
      /** External update (Home Assistant). Never sends anything. */
      setState(patch = {}) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 3 }; }

  global.MaisonActivity = { create, constraints, entry };
})(window);
