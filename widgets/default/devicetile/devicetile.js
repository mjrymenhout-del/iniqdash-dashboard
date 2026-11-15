/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Device tile V1 — one device as a square tile: what it is doing in one word (ON · HEAT · PLAYING · OFF · IDLE), a switch, its icon, its
   name and how long it has been like that ("5 min"). Active, the tile fills with its colour (warm yellow for a light, orange for heating…);
   off, it is a quiet dark tile. Optionally a picture of the device fades into the corner. One tile type for lights, switches, fans,
   heating and speakers.

   MaisonDeviceTile.create(config) → HTMLElement (.iq-dev), with el.devicetile = { getState(), setState(patch) }
   config = { id, name, icon ('mdi:…'), color ('yellow' | 'orange' | 'blue' | 'green' | 'pink' | 'purple' | '#rrggbb'), image?, entity?,
     state ('on' | 'off' | …), label (the word, e.g. HEAT), active (bool), since (ms), available, onChange(next, prev, meta) }
   Unlinked: a demo device that switches locally. The switch is the tile's own control (never a card gesture).
   ========================================================================== */
(function (global) {
  'use strict';
  const COLORS = { yellow: ['#ffd65a', '#ffb92e'], orange: ['#ffa550', '#fc7a22'], blue: ['#6fd0ff', '#2f9cf0'], green: ['#8ff06a', '#3fc35c'], pink: ['#ff86a8', '#ff4f7f'], purple: ['#c287ff', '#9248ff'] };
  const SAFE_IMG = /^(?!.*\.\.)((assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32})$/;
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const ago = (ms, now = Date.now()) => { if (!ms) return ''; const m = Math.max(0, Math.round((now - ms) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
  function create(config) {
    let s = { state: 'on', available: true, color: 'yellow', icon: 'mdi:lightbulb', ...(config || {}) };
    if (s.since === undefined && !s.entity) s.since = Date.now() - 5 * 60000;
    const root = el('article', 'iq-dev');
    const pic = el('span', 'iq-dev__pic', { 'aria-hidden': 'true' });
    const top = el('div', 'iq-dev__top'), word = el('span', 'iq-dev__word');
    const sw = el('button', 'iq-dev__sw', { type: 'button', role: 'switch' }); sw.append(el('span', 'iq-dev__knob'));
    const ic = el('span', 'iq-dev__ic', { 'aria-hidden': 'true' }), name = el('span', 'iq-dev__name'), since = el('span', 'iq-dev__since');
    top.append(word, sw);
    const body = el('div', 'iq-dev__body'); body.append(ic, name, since);
    root.append(pic, top, body);
    const active = () => (typeof s.active === 'boolean' ? s.active : s.state === 'on');
    sw.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (s.available === false) return;
      const prev = { state: s.state, active: active() };
      if (typeof s.onChange === 'function') { s.onChange({ toggle: true }, prev, { source: 'user' }); return; }
      s = { ...s, state: active() ? 'off' : 'on', active: !active(), label: undefined, since: Date.now() }; render();   // demo: switches locally
    });
    function render() {
      const on = active() && s.available !== false, c = COLORS[s.color] || (/^#[0-9a-f]{6}$/i.test(s.color || '') ? [s.color, s.color] : COLORS.yellow);
      root.dataset.on = on ? 'true' : 'false';
      root.dataset.available = s.available === false ? 'false' : 'true';
      root.style.setProperty('--dev-a', c[0]); root.style.setProperty('--dev-b', c[1]);
      word.textContent = s.available === false ? 'UNAVAILABLE' : String(s.label || (on ? 'On' : 'Off')).toUpperCase();
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      sw.setAttribute('aria-label', `${s.name || 'Device'}: ${on ? 'on' : 'off'}`);
      sw.disabled = s.available === false;
      ic.innerHTML = ''; ic.append(el('span', '', { 'data-mdi': /^mdi:[a-z0-9-]+$/.test(s.icon || '') ? s.icon : 'mdi:power' }));
      name.textContent = s.name || '';
      since.textContent = ago(s.since); since.hidden = !s.since;
      pic.style.backgroundImage = s.image && SAFE_IMG.test(s.image) ? `url("${s.image}")` : '';
      if (global.IniqIcons) global.IniqIcons.fill(root);
    }
    render();
    const tick = setInterval(() => { if (!root.isConnected) { clearInterval(tick); return; } since.textContent = ago(s.since); }, 60000);
    root.devicetile = { getState: () => ({ ...s }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 3 }; }
  global.MaisonDeviceTile = { create, constraints, COLORS };
})(window);
