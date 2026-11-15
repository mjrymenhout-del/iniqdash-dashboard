/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Room tile V1 — a room as a photo card: its picture fills the card; its humidity (top left) and how many lights are on (top right) in
   chips; its temperature large in the middle; at the bottom an icon in the room's colour, its name, what it has ("Lights · Climate") and
   a chevron. The card's own Tap (Interactions) opens the room — typically its popup. Read only.

   MaisonRoomTile.create(config) → HTMLElement (.iq-rt), with el.roomtile = { getState(), setState(patch) }
   config = { id, name, subtitle, icon ('mdi:…'), color ('#rrggbb' | 'purple' | 'orange' | 'green' | 'pink' | 'blue' | 'yellow'), image,
     temperature / humidity / lights: entity ids (each optional);
     items: LINKED (binding): { temperature: { text, unit }, humidity: { text, unit }, lights: { text } } — each absent when not linked / unknown
     demo:  UNLINKED: { temperature: '18.0', humidity: '61', lights: '1/1' } }
   ========================================================================== */
(function (global) {
  'use strict';
  const COLORS = { purple: '#a74cff', orange: '#ff8c2d', green: '#8ee63a', pink: '#ff5181', blue: '#3fb6ff', yellow: '#ffc23d' };
  const SAFE_IMG = /^(?!.*\.\.)((assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32})$/;
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  function create(config) {
    let s = { icon: 'mdi:sofa-outline', color: 'purple', ...(config || {}) };
    const root = el('article', 'iq-rt');
    root.innerHTML = `<span class="iq-rt__pic" aria-hidden="true"></span><span class="iq-rt__big" aria-hidden="true"></span><span class="iq-rt__shade" aria-hidden="true"></span>
      <div class="iq-rt__top"><span class="iq-rt__chip" data-k="humidity"><span data-mdi="mdi:water-outline"></span><b></b></span><span class="iq-rt__chip" data-k="lights"><span data-mdi="mdi:lightbulb"></span><b></b></span></div>
      <div class="iq-rt__temp"></div>
      <div class="iq-rt__foot"><span class="iq-rt__ic" aria-hidden="true"></span><span class="iq-rt__tx"><span class="iq-rt__name"></span><span class="iq-rt__sub"></span></span><span class="iq-rt__go" aria-hidden="true">${CHEV}</span></div>`;
    const $ = (q) => root.querySelector(q);
    function vals() {
      if (s.items && typeof s.items === 'object') return s.items;
      const d = s.demo || { temperature: '20.0', humidity: '50', lights: '1/2' };
      return { temperature: d.temperature !== undefined ? { text: String(d.temperature), unit: '°' } : null, humidity: d.humidity !== undefined ? { text: String(d.humidity), unit: '%' } : null,
        lights: d.lights !== undefined ? { text: String(d.lights) } : null };
    }
    function render() {
      const v = vals(), col = COLORS[s.color] || (/^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : COLORS.purple);
      root.style.setProperty('--rt-c', col);
      const photo = !!(s.image && SAFE_IMG.test(s.image));
      $('.iq-rt__pic').style.backgroundImage = photo ? `url("${s.image}")` : '';
      // NO PICTURE: a surface in the room's own colour with its icon drawn large and faint — never a flat black card
      root.dataset.photo = String(photo);
      const big = $('.iq-rt__big'); big.innerHTML = ''; if (!photo) big.append(el('span', '', { 'data-mdi': /^mdi:[a-z0-9-]+$/.test(s.icon || '') ? s.icon : 'mdi:home-outline' }));
      const chip = (k, x, fmt) => { const c = $(`.iq-rt__chip[data-k="${k}"]`); c.hidden = !x; if (x) c.querySelector('b').textContent = fmt(x); };
      chip('humidity', v.humidity, (x) => `${x.text}${x.unit || ''}`);
      chip('lights', v.lights, (x) => x.text);
      const lit = v.lights && /^([1-9]\d*)/.test(String(v.lights.text)); $('.iq-rt__chip[data-k="lights"]').dataset.on = lit ? 'true' : 'false';
      const t = v.temperature; $('.iq-rt__temp').textContent = t ? `${t.text}${t.unit === '°C' || t.unit === '°F' || t.unit === '°' ? '°' : t.unit ? ` ${t.unit}` : '°'}` : '';
      const ic = $('.iq-rt__ic'); ic.innerHTML = ''; ic.append(el('span', '', { 'data-mdi': /^mdi:[a-z0-9-]+$/.test(s.icon || '') ? s.icon : 'mdi:home-outline' }));
      $('.iq-rt__name').textContent = s.name || 'Room';
      $('.iq-rt__sub').textContent = s.subtitle || ''; $('.iq-rt__sub').hidden = !s.subtitle;
      root.setAttribute('aria-label', [s.name || 'Room', t ? `${t.text}°` : '', v.humidity ? `humidity ${v.humidity.text}%` : '', v.lights ? `lights ${v.lights.text}` : ''].filter(Boolean).join(', '));
      if (global.IniqIcons) global.IniqIcons.fill(root);
    }
    render();
    root.roomtile = { getState: () => ({ ...s }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 4 }; }
  global.MaisonRoomTile = { create, constraints, COLORS };
})(window);
