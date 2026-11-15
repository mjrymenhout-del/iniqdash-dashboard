/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqHA entity inspector — the COMPLETE current Home Assistant data of a selected entity, read-only.
   Reusable: the schema form adds it under every field of type 'entity' (and every Information line), so every widget
   that lets you choose an entity gets it without code of its own.

   IniqHA.inspector({ entity }) → HTMLElement (a collapsed <details>)   el.setEntity(id) follows another entity
     Collapsed: nothing is fetched. Open: IniqHA.inspect(id) (api/ha_entity.php) — the entity's state and EVERY attribute
     Home Assistant reports, in HA's order, with HA's own values; re-read every few seconds and whenever the shared poll
     sees the entity change, so an attribute HA drops disappears here too. Credentials and precise location (the Entity
     Details policy, HaService::LOCATION_KEYS) are withheld by the server and listed by name only. Nothing is invented, renamed, filtered or stored: live runtime information, never configuration.
     Without the IniqDash server (demo) there is no Home Assistant data and the form shows no picker, hence no inspector.
   ========================================================================== */
(function (global) {
  'use strict';

  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c !== null && c !== undefined && n.append(c));
    return n;
  };
  const EVERY = 5000;            // re-read while open
  const SHORT = 90;              // a value longer than this (or any list / object that does not fit) gets a "View" toggle
  const ERR = {
    unreachable: 'Home Assistant cannot be reached right now', timeout: 'Home Assistant did not answer in time', auth: 'Home Assistant refused the connection',
    too_large: 'This entity’s data is too large to show', not_configured: 'Home Assistant is not configured on this server',
    signed_out: 'Your session has expired — sign in again', offline: 'The IniqDash server cannot be reached', bad_entity: 'Not a valid entity id',
  };

  /** one value as HA reports it: { text, kind, full? } — full (pretty JSON) when the compact text does not show everything */
  function show(v) {
    if (v === null) return { text: 'null', kind: 'null' };
    if (typeof v === 'boolean') return { text: String(v), kind: 'boolean' };
    if (typeof v === 'number') return { text: String(v), kind: 'number' };
    if (typeof v === 'string') return v === '' ? { text: '""', kind: 'string empty' } : { text: v.length > SHORT ? `${v.slice(0, SHORT)}…` : v, kind: 'string', full: v.length > SHORT ? v : null };
    const list = Array.isArray(v);
    const n = list ? v.length : Object.keys(v).length;
    const flat = list && v.every((x) => x === null || typeof x !== 'object');
    const compact = flat ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') : JSON.stringify(v);
    const kind = list ? `list · ${n}` : `object · ${n}`;
    if (!n) return { text: list ? '[ ]' : '{ }', kind };
    return { text: compact.length > SHORT ? `${compact.slice(0, SHORT)}…` : compact, kind, full: flat && compact.length <= SHORT ? null : JSON.stringify(v, null, 2) };
  }

  function row(name, v, note) {
    const s = show(v);
    const val = h('span', { class: `iq-insp__v iq-insp__v--${s.kind.split(' ')[0]}`, 'data-k': 'insp-value', text: s.text });
    const kids = [h('code', { class: 'iq-insp__n', 'data-k': 'insp-name', text: name }), h('span', { class: 'iq-insp__val' }, [val, h('span', { class: 'iq-insp__t', text: s.kind })])];
    const r = h('div', { class: 'iq-insp__row', 'data-attr': name }, kids);
    if (s.full) r.append(h('details', { class: 'iq-insp__more' }, [h('summary', { text: 'View' }), h('pre', { 'data-k': 'insp-full', text: s.full })]));
    if (note) r.append(h('p', { class: 'iq-insp__note', text: note }));
    return r;
  }

  function inspector({ entity = '' } = {}) {
    const HA = global.IniqHA;
    let id = entity || '', timer = 0, unsub = null, seq = 0, busy = false, last = null;
    const count = h('span', { class: 'iq-insp__c', 'data-k': 'insp-count' });
    const body = h('div', { class: 'iq-insp__b', 'aria-live': 'polite' });
    const el = h('details', { class: 'iq-insp', 'data-k': 'ha-values' }, [h('summary', { class: 'iq-insp__h' }, [h('span', { text: 'Home Assistant values' }), count]), body]);

    const say = (text, tone) => body.replaceChildren(h('p', { class: `iq-insp__msg${tone ? ` iq-insp__msg--${tone}` : ''}`, 'data-k': 'insp-msg', text }));
    function render(r) {
      if (!r.ok) { count.textContent = ''; return say(`Not available — ${ERR[r.error] || 'Home Assistant data could not be read'}.`, 'warn'); }
      const e = r.entity;
      if (!e) { count.textContent = ''; return say('Home Assistant has no entity with this id.', 'warn'); }
      const attrs = Array.isArray(e.attributes) ? e.attributes : [];
      const hidden = (e.redacted || []).filter((n) => !n.includes('.'));
      const place = (e.location || []).filter((n) => !n.includes('.'));
      const total = attrs.length + hidden.length + place.length;
      count.textContent = `Attributes (${total})`;
      const at = r.at ? new Date(r.at) : null;
      const sec = (title, kids) => h('div', { class: 'iq-insp__s' }, [h('h4', { class: 'iq-insp__sh', text: title }), ...kids]);
      const list = attrs.map(([n, v]) => row(n, v, n === 'supported_features'
        ? 'Raw value (bit flags) as Home Assistant reports it. IniqDash’s reading of it is the “This entity supports” list.' : null));
      const withheld = (n, text) => list.push(h('div', { class: 'iq-insp__row', 'data-attr': n }, [h('code', { class: 'iq-insp__n', text: n }),
        h('span', { class: 'iq-insp__val' }, [h('span', { class: 'iq-insp__v iq-insp__v--hidden', 'data-k': 'insp-value', text })])]));
      hidden.forEach((n) => withheld(n, 'Hidden — a credential is never sent to the browser'));
      place.forEach((n) => withheld(n, 'Hidden — precise location is never shown (as in Entity Details)'));
      const nested = [...(e.redacted || []), ...(e.location || [])].filter((n) => n.includes('.'));
      body.replaceChildren(
        h('p', { class: 'iq-insp__src', 'data-k': 'insp-source', text: `Live from Home Assistant${at && !Number.isNaN(at.getTime()) ? ` · read ${at.toLocaleTimeString()}` : ''}` }),
        sec('Entity', [row('entity_id', e.id), row('domain', e.domain), row('state', e.state),
          ...(e.last_changed ? [row('last_changed', e.last_changed)] : []), ...(e.last_updated ? [row('last_updated', e.last_updated)] : [])]),
        sec(`Attributes (${total})`, list.length ? list : [h('p', { class: 'iq-insp__msg', 'data-k': 'insp-none', text: 'This entity reports no attributes.' })]),
        nested.length ? h('p', { class: 'iq-insp__msg', text: `Credentials and precise location inside values are hidden: ${nested.join(', ')}.` }) : null,
        e.truncated ? h('p', { class: 'iq-insp__msg iq-insp__msg--warn', text: 'Some very long or deeply nested values are shortened.' }) : null,
      );
      // keep a "View" the user opened open across re-reads
      if (last) last.forEach((n) => { const d = body.querySelector(`.iq-insp__row[data-attr="${CSS.escape(n)}"] > details`); if (d) d.open = true; });
    }
    async function load() {
      if (!el.isConnected && timer) return stop();
      if (!el.open || !id || busy) return;
      busy = true;
      const mine = ++seq, want = id;
      try {
        const r = await HA.inspect(want);
        if (mine !== seq || want !== id) return;            // the selection changed meanwhile: that answer is not this entity's
        last = [...body.querySelectorAll('.iq-insp__row > details[open]')].map((d) => d.parentElement.dataset.attr);
        render(r);
      } finally { busy = false; }
    }
    function stop() { clearInterval(timer); timer = 0; if (unsub) unsub(); unsub = null; }
    function begin() {
      stop();
      if (!el.open || !id) return;
      if (!body.firstChild) say('Reading the values from Home Assistant…');
      unsub = HA.subscribe(id, () => load());               // a change seen by the shared poll → read again
      timer = setInterval(load, EVERY);                     // attributes the poll does not follow change too
      load();
    }
    el.addEventListener('toggle', () => (el.open ? begin() : stop()));
    el.setEntity = (next) => {
      next = next || '';
      el.hidden = !next;
      if (next === id) return;
      id = next; seq++; last = null; count.textContent = ''; body.replaceChildren();
      begin();
    };
    el.setEntity(id);
    el.hidden = !id;
    return el;
  }

  if (global.IniqHA) global.IniqHA.inspector = inspector;
})(window);
