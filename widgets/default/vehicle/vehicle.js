/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Vehicle V1 — an electric vehicle (any brand): its picture, battery and range, charging (animated), the target charge, and its
   plug / lock / climate status. Several vehicles in one card: a tap on a name switches.

   MaisonVehicle.create(config) → HTMLElement (.iq-veh), with el.vehicle = { getState(), setState(patch) }
   config = { id, name, variant: 'hero' (default) | 'compact', show: { range, charging, target, status } (each default true),
     items:  LINKED (binding): [vehicle view…] — every value from Home Assistant, unavailable ones null (never a guess)
     demo:   UNLINKED: [vehicle view…]
     onRequest(entity, ctl): LINKED — { target: n } | { lock: 'lock' | 'unlock' } | { climate: true } | { charge: true }; the binding plans it }
   vehicle view = { key, name, image, level (0–100 | null), range { value, unit } | null, target (0–100 | null),
     targetCtl { entity, min, max, step } | null (a number entity: the target can be set), charging (bool | null), power { value, unit } | null,
     remaining (minutes | null), plugged (bool | null), locked (bool | null), lockEntity, climate (bool | null), climateEntity, climateKind,
     chargeEntity, charge (bool | null), mileage { value, unit } | null, available (bool) }
   Unlock asks for a second tap (an accidental tap never opens a car). Nothing is shown for a value that is not mapped.
   ========================================================================== */
(function (global) {
  'use strict';
  const S = (d, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    plug: S('<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v4"/>'),
    lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    unlock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>'),
    fan: S('<path d="M12 12c0-3.5 1.2-7 4-7s2.5 4-4 7Zm0 0c3.5 0 7 1.2 7 4s-4 2.5-7-4Zm0 0c0 3.5-1.2 7-4 7s-2.5-4 4-7Zm0 0c-3.5 0-7-1.2-7-4s4-2.5 7 4Z"/>'),
    bolt: S('<path d="M13 2 5 13.5h6L10 22l9-12h-6.2z" fill="currentColor" stroke="none"/>'),
    road: S('<path d="M5 21 9 3M19 21 15 3M12 5v2M12 11v2M12 17v2"/>'),
  };
  // an ORIGINAL side view (IniqDash artwork): a generic five-door shape, no brand
  const CAR = `<svg class="iq-veh__art" viewBox="0 0 320 120" aria-hidden="true">
    <defs><linearGradient id="vb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".95"/><stop offset="1" stop-color="currentColor" stop-opacity=".62"/></linearGradient></defs>
    <ellipse cx="160" cy="108" rx="140" ry="7" fill="#000" opacity=".28"/>
    <path d="M22 84c-4 0-6-3-5-7l4-14c2-6 6-9 13-10l44-6 38-21c8-4 15-6 25-6h62c11 0 20 4 28 11l24 21 30 6c8 2 12 6 13 13l2 6c1 4-2 7-6 7z" fill="url(#vb)"/>
    <path d="M118 30c7-4 13-5 21-5h28v26h-75zM175 25h20c9 0 16 3 22 9l17 17h-59z" fill="#0b1220" opacity=".55"/>
    <path d="M30 70h18M276 66h16" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    <circle cx="82" cy="86" r="21" fill="#151b26"/><circle cx="82" cy="86" r="11" fill="#5b6576"/>
    <circle cx="244" cy="86" r="21" fill="#151b26"/><circle cx="244" cy="86" r="11" fill="#5b6576"/>
  </svg>`;
  const DEMO = [
    { key: 'd1', name: 'City car', level: 68, range: { value: 312, unit: 'km' }, target: 80, targetCtl: { entity: '', min: 50, max: 100, step: 5 }, charging: true, power: { value: 7.4, unit: 'kW' }, remaining: 85, plugged: true, locked: true, climate: false, mileage: { value: 48210, unit: 'km' }, available: true },
    { key: 'd2', name: 'Van', level: 41, range: { value: 118, unit: 'km' }, target: null, charging: false, plugged: false, locked: null, climate: null, available: true },
  ];
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const fmtNum = (v, max = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: max });
  const dur = (m) => (m === null || m === undefined || !Number.isFinite(m) ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);

  function create(config) {
    let s = { variant: 'hero', ...(config || {}) };
    let sel = 0, armed = '', armT = 0;
    const root = el('article', 'iq-veh', { role: 'group' });
    if (s.id) root.dataset.vehicleId = s.id;
    root.innerHTML = `
      <header class="iq-veh__head"><h3 class="iq-veh__name"></h3><div class="iq-veh__tabs" role="tablist" aria-label="Vehicles"></div></header>
      <div class="iq-veh__pic"></div>
      <div class="iq-veh__main">
        <div class="iq-veh__lvl"><b class="iq-veh__pct"></b><span class="iq-veh__range"></span></div>
        <div class="iq-veh__bar" role="img"><span class="iq-veh__fill"></span><i class="iq-veh__tgt"></i></div>
        <p class="iq-veh__state" role="status" aria-live="polite"></p>
        <div class="iq-veh__target"><span>Charge to</span><button type="button" class="iq-veh__step" data-d="-1" aria-label="Lower the target">−</button><b class="iq-veh__tval"></b><button type="button" class="iq-veh__step" data-d="1" aria-label="Raise the target">+</button></div>
      </div>
      <ul class="iq-veh__chips"></ul>`;
    const $ = (q) => root.querySelector(q);
    const list = () => (Array.isArray(s.items) ? s.items : Array.isArray(s.demo) && s.demo.length ? s.demo : DEMO);
    const show = (k) => !(s.show && s.show[k] === false);
    const ask = (v, ctl) => { if (typeof s.onRequest === 'function') s.onRequest(v, ctl); };
    function render() {
      const all = list();
      if (sel >= all.length) sel = 0;
      const v = all[sel] || { name: s.name || 'Vehicle', available: false };
      root.dataset.variant = s.variant === 'compact' ? 'compact' : 'hero';
      root.dataset.available = String(v.available !== false);
      root.dataset.charging = String(v.charging === true);
      $('.iq-veh__name').textContent = all.length > 1 ? s.name || 'Vehicles' : v.name || s.name || 'Vehicle';
      // the vehicles (several): one tab each
      const tabs = $('.iq-veh__tabs');
      tabs.hidden = all.length < 2;
      tabs.replaceChildren(...all.map((x, i) => { const b = el('button', 'iq-veh__tab', { type: 'button', role: 'tab', 'aria-selected': String(i === sel) }); b.textContent = x.name || `Vehicle ${i + 1}`;
        b.addEventListener('click', (e) => { e.stopPropagation(); sel = i; armed = ''; render(); }); return b; }));
      // the picture
      const pic = $('.iq-veh__pic');
      if (v.image) { if (!pic.querySelector('img') || pic.querySelector('img').getAttribute('src') !== v.image) { const im = el('img', 'iq-veh__img', { alt: '' }); im.src = v.image; pic.replaceChildren(im); } }
      else if (!pic.querySelector('.iq-veh__art')) pic.innerHTML = CAR;
      // battery and range
      const lvl = v.level === null || v.level === undefined ? null : Math.max(0, Math.min(100, Number(v.level)));
      $('.iq-veh__pct').textContent = lvl === null ? '—' : `${Math.round(lvl)}%`;
      const rg = $('.iq-veh__range');
      rg.hidden = !show('range') || !v.range;
      rg.innerHTML = v.range ? `${ICON.road}<span></span>` : '';
      if (v.range) rg.querySelector('span').textContent = `${fmtNum(v.range.value)} ${v.range.unit || ''}`.trim();
      const bar = $('.iq-veh__bar');
      $('.iq-veh__fill').style.width = `${lvl ?? 0}%`;
      bar.dataset.tone = lvl === null ? 'unknown' : lvl < 15 ? 'low' : lvl < 30 ? 'mid' : 'ok';
      const tgt = v.target === null || v.target === undefined ? null : Math.max(0, Math.min(100, Number(v.target)));
      $('.iq-veh__tgt').hidden = tgt === null || !show('target');
      $('.iq-veh__tgt').style.left = `${tgt ?? 0}%`;
      bar.setAttribute('aria-label', `Battery ${lvl === null ? 'unknown' : `${Math.round(lvl)} percent`}${tgt !== null ? `, charging to ${Math.round(tgt)} percent` : ''}`);
      // charging line
      const st = $('.iq-veh__state');
      st.hidden = !show('charging');
      const parts = [];
      if (v.available === false) parts.push('Unavailable');
      else if (v.charging === true) {
        parts.push('Charging');
        if (v.power && Number.isFinite(Number(v.power.value))) parts.push(`${fmtNum(Math.abs(v.power.value), 1)} ${v.power.unit || ''}`.trim());
        if (v.remaining !== null && v.remaining !== undefined) parts.push(`full in ${dur(v.remaining)}`);
      } else if (v.plugged === true) parts.push(tgt !== null && lvl !== null && lvl >= tgt - 0.5 ? 'Plugged in · charged' : 'Plugged in · not charging');
      else if (v.plugged === false) parts.push('Not plugged in');
      if (v.mileage) parts.push(`${fmtNum(v.mileage.value)} ${v.mileage.unit || ''}`.trim());
      st.innerHTML = v.charging === true ? `<i class="iq-veh__bolt">${ICON.bolt}</i>` : '';
      st.append(document.createTextNode(parts.join(' · ')));
      // the target control (a number entity only)
      const tg = $('.iq-veh__target');
      tg.hidden = !show('target') || !v.targetCtl || tgt === null;
      $('.iq-veh__tval').textContent = tgt === null ? '' : `${Math.round(tgt)}%`;
      tg.querySelectorAll('.iq-veh__step').forEach((b) => {
        const c = v.targetCtl, next = c && tgt !== null ? tgt + Number(b.dataset.d) * (c.step || 5) : null;
        b.disabled = !c || next === null || next < c.min || next > c.max || v.available === false;
        b.onclick = (e) => { e.stopPropagation(); if (!b.disabled) { v.target = next; render(); ask(c.entity, { target: next }); } };
      });
      // status chips: plug · lock (tap: lock / unlock — unlock asks twice) · climate (tap: on / off) · charging switch
      const chips = $('.iq-veh__chips');
      chips.hidden = !show('status');
      const chip = (k, icon, label, on, tap) => {
        const li = el('li'), b = el(tap ? 'button' : 'span', 'iq-veh__chip');
        if (tap) { b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); tap(b); }); }
        b.dataset.k = k; b.dataset.on = String(on === true); b.dataset.armed = String(armed === k);
        b.innerHTML = `${icon}<span></span>`; b.querySelector('span').textContent = armed === k ? 'Tap again to unlock' : label;
        li.append(b); return li;
      };
      const out = [];
      if (v.plugged !== null && v.plugged !== undefined) out.push(chip('plug', ICON.plug, v.plugged ? 'Plugged in' : 'Unplugged', v.plugged));
      if (v.locked !== null && v.locked !== undefined) out.push(chip('lock', v.locked ? ICON.lock : ICON.unlock, v.locked ? 'Locked' : 'Unlocked', v.locked,
        v.lockEntity ? () => {
          if (v.locked && armed !== 'lock') { armed = 'lock'; clearTimeout(armT); armT = setTimeout(() => { armed = ''; render(); }, 4000); render(); return; }
          armed = ''; const act = v.locked ? 'unlock' : 'lock'; v.locked = !v.locked; render(); ask(v.lockEntity, { lock: act });
        } : null));
      if (v.climate !== null && v.climate !== undefined) out.push(chip('climate', ICON.fan, v.climate ? 'Climate on' : 'Climate off', v.climate,
        v.climateEntity ? () => { if (v.climateKind !== 'button') v.climate = !v.climate; render(); ask(v.climateEntity, { climate: true }); } : null));
      if (v.charge !== null && v.charge !== undefined && v.chargeEntity) out.push(chip('charge', ICON.bolt, v.charge ? 'Charging on' : 'Charging off', v.charge, () => { v.charge = !v.charge; render(); ask(v.chargeEntity, { charge: true }); }));
      chips.replaceChildren(...out);
      root.setAttribute('aria-label', `${v.name || 'Vehicle'}: ${lvl === null ? 'battery unknown' : `${Math.round(lvl)} percent`}${v.charging ? ', charging' : ''}`);
    }
    render();
    root.vehicle = { getState: () => ({ ...s, selected: sel, vehicles: list().length }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); }, select(i) { sel = i; render(); } };
    return root;
  }
  function constraints(c) { return c && c.variant === 'compact' ? { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 3 } : { minW: { desktop: 3, tablet: 3, mobile: 4 }, minH: 5 }; }
  global.MaisonVehicle = { create, constraints, DEMO };
})(window);
