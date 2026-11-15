/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Activity log V1 — what happened lately, as a timeline: one row per followed entity — its LATEST change in plain words ("Motion detected",
   "Door closed", "Unlocked"), the entity's name and area, and when ("Today 09:03"), newest first. An icon tile per kind (motion, door,
   window, leak, lock, light …), a dot on the timeline that glows while the change is recent. Read only: a tap opens the entity's details;
   the header link (optional) opens a popup or a page through the dashboard's own actions.

   MaisonActivityLog.create(config) → HTMLElement (.iq-alog), with el.activitylog = { getState(), setState(patch) }
   config = { id, name, max (1–20, default 6), recent (minutes a change counts as recent, default 10), link: { label, popup? , page? },
     items: LINKED (from the binding): [{ id, entity, domain, dc, name, area, state, available, changed (ms) }]
     demo:  UNLINKED: [{ domain, dc, name, area, state, ago (minutes) }] }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = [
    { domain: 'binary_sensor', dc: 'motion', name: 'Kitchen', area: 'Occupancy', state: 'off', ago: 3 },
    { domain: 'binary_sensor', dc: 'motion', name: 'Hallway', area: 'Occupancy', state: 'on', ago: 4 },
    { domain: 'binary_sensor', dc: 'door', name: 'Front door', area: 'Opening', state: 'off', ago: 12 },
    { domain: 'lock', dc: null, name: 'Back door', area: 'Lock', state: 'locked', ago: 25 },
    { domain: 'binary_sensor', dc: 'window', name: 'Bedroom window', area: 'Opening', state: 'on', ago: 41 },
    { domain: 'binary_sensor', dc: 'moisture', name: 'Bathroom', area: 'Leak', state: 'off', ago: 95 }];
  const OPEN = ['door', 'garage_door', 'opening', 'window'];
  /** the change in plain words, and its icon: by domain and device class (Home Assistant's own meaning of on / off) */
  function describe(x) {
    const on = x.state === 'on', st = String(x.state || '');
    if (x.available === false) return ['Unavailable', 'mdi:help-circle-outline', 'off'];
    if (x.domain === 'binary_sensor') {
      const dc = x.dc || '';
      if (['motion', 'occupancy', 'presence'].includes(dc)) return [dc === 'motion' ? (on ? 'Motion detected' : 'Motion cleared') : (on ? 'Occupied' : 'Clear'), 'mdi:walk', on ? 'on' : 'off'];
      if (OPEN.includes(dc)) { const w = dc === 'window' ? 'Window' : dc === 'garage_door' ? 'Garage door' : 'Door';
        return [`${w} ${on ? 'opened' : 'closed'}`, dc === 'window' ? (on ? 'mdi:window-open-variant' : 'mdi:window-closed-variant') : (on ? 'mdi:door-open' : 'mdi:door'), on ? 'on' : 'off']; }
      if (dc === 'moisture') return [on ? 'Leak detected' : 'Dry', on ? 'mdi:water-alert' : 'mdi:water-outline', on ? 'alert' : 'off'];
      if (dc === 'smoke' || dc === 'gas' || dc === 'carbon_monoxide') return [on ? 'Alarm' : 'Clear', 'mdi:smoke-detector-variant', on ? 'alert' : 'off'];
      return [on ? 'On' : 'Off', 'mdi:checkbox-blank-circle-outline', on ? 'on' : 'off'];
    }
    if (x.domain === 'lock') return [st === 'locked' ? 'Locked' : st === 'unlocked' ? 'Unlocked' : st.charAt(0).toUpperCase() + st.slice(1), st === 'locked' ? 'mdi:lock' : 'mdi:lock-open-variant', st === 'unlocked' ? 'on' : 'off'];
    if (x.domain === 'light') return [on ? 'Turned on' : 'Turned off', 'mdi:lightbulb', on ? 'on' : 'off'];
    if (x.domain === 'switch' || x.domain === 'fan' || x.domain === 'input_boolean') return [on ? 'Turned on' : 'Turned off', 'mdi:power', on ? 'on' : 'off'];
    if (x.domain === 'alarm_control_panel') return [st === 'disarmed' ? 'Disarmed' : st === 'triggered' ? 'Alarm triggered' : st.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), 'mdi:shield-home', st === 'triggered' ? 'alert' : 'off'];
    if (x.domain === 'cover') return [st === 'open' ? 'Opened' : st === 'closed' ? 'Closed' : st, 'mdi:window-shutter', st === 'open' ? 'on' : 'off'];
    if (x.domain === 'person' || x.domain === 'device_tracker') return [st === 'home' ? 'Arrived home' : st === 'not_home' ? 'Left home' : `At ${st}`, 'mdi:account', st === 'home' ? 'on' : 'off'];
    return [st ? st.charAt(0).toUpperCase() + st.slice(1) : '—', 'mdi:information-outline', 'off'];
  }
  /** "Today 09:03", "Yesterday 18:40" or "Mon 12 Nov 07:15" — in the viewer's own clock */
  function stamp(ms, now = Date.now()) {
    if (!ms) return '';
    const d = new Date(ms), n = new Date(now), t = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const day = (a) => new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime(), diff = Math.round((day(n) - day(d)) / 86400000);
    return diff === 0 ? `Today ${t}` : diff === 1 ? `Yesterday ${t}` : `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${t}`;
  }
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  function create(config) {
    let s = { max: 6, recent: 10, ...(config || {}) };
    const root = el('article', 'iq-alog', { role: 'group' });
    const head = el('header', 'iq-alog__head'), title = el('h3', 'iq-alog__title'), link = el('button', 'iq-alog__link', { type: 'button' });
    const list = el('ol', 'iq-alog__list');
    head.append(title, link); root.append(head, list);
    link.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const l = s.link || {}, action = l.popup ? { type: 'popup', popup: l.popup } : l.page ? { type: 'navigate', page: l.page } : null;
      if (action) root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action, meta: { source: 'link' }, widget: 'activitylog' } }));
    });
    function rows() {
      if (Array.isArray(s.items)) return s.items;
      const now = Date.now();
      return (Array.isArray(s.demo) && s.demo.length ? s.demo : DEMO).map((d, i) => ({ id: `d${i}`, ...d, available: true, changed: now - (d.ago || 0) * 60000, demo: true }));
    }
    function render() {
      title.textContent = s.name || 'Activity';
      const l = s.link || {};
      link.textContent = l.label || ''; link.hidden = !(l.label && (l.popup || l.page));
      const now = Date.now(), recent = Math.max(1, Number(s.recent) || 10) * 60000;
      const items = rows().slice().sort((a, b) => (b.changed || 0) - (a.changed || 0)).slice(0, Math.max(1, Math.min(20, Number(s.max) || 6)));
      root.setAttribute('aria-label', `${s.name || 'Activity'}: ${items.length} recent changes`);
      if (!items.length) { const e = el('li', 'iq-alog__empty'); e.textContent = 'Nothing has happened yet'; list.replaceChildren(e); return; }
      list.replaceChildren(...items.map((x) => {
        const [what, icon, tone] = describe(x);
        const li = el('li', 'iq-alog__row', { 'data-tone': tone });
        if (x.changed && now - x.changed < recent) li.dataset.recent = '';
        const b = el(x.entity ? 'button' : 'div', 'iq-alog__b');
        if (x.entity) { b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation();
          root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity: x.entity, info: [], label: x.name }, meta: { source: 'more' }, widget: 'details' } })); }); }
        const sub = [x.name, x.area].filter(Boolean).join(' · '), when = stamp(x.changed, now);
        b.setAttribute('aria-label', `${what}, ${sub}${when ? `, ${when}` : ''}`);
        const ic = el('span', 'iq-alog__ic', { 'data-mdi': icon, 'aria-hidden': 'true' });
        const tx = el('span', 'iq-alog__tx'), t = el('span', 'iq-alog__t'), st = el('span', 'iq-alog__s'), tm = el('time', 'iq-alog__time');
        t.textContent = what; st.textContent = sub; tm.textContent = when; if (x.changed) tm.dateTime = new Date(x.changed).toISOString();
        tx.append(t, st); b.append(ic, tx, tm); li.append(el('span', 'iq-alog__dot', { 'aria-hidden': 'true' }), b);
        return li;
      }));
      if (global.IniqIcons) global.IniqIcons.fill(list);
    }
    render();
    // relative stamps change at midnight and "recent" ends: redraw every minute while connected
    const tick = setInterval(() => { if (!root.isConnected) { clearInterval(tick); return; } render(); }, 60000);
    root.activitylog = { getState: () => ({ ...s }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 3 }; }
  global.MaisonActivityLog = { create, constraints, describe, stamp, DEMO };
})(window);
