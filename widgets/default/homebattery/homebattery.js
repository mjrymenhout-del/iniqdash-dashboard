/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Home battery V1 — a home storage battery: charge level, energy left, charging / discharging power, time to full or to the reserve,
   health, temperature and today's in / out. Any integration: every value is an entity chosen by hand.

   Honesty rules: the power's DIRECTION comes only from its sign (with the "positive means" setting); kWh left = level × usable capacity
   (said so); time to full / to reserve is an ESTIMATE from the current power (marked "≈"), replaced by a remaining-time sensor when one
   is mapped; an unavailable value shows "—" (nothing is computed from it).

   MaisonHomeBattery.create(config) → .iq-hb, el.homebattery = { getState(), setState(patch) }
   config = { name, capacity (kWh, number) , reserve (%), positive: 'charge' | 'discharge', vals: LINKED { level, power, health, temp, inToday, outToday,
     runtime, capacityEntity } each { value, unit, ok } | null; demo: UNLINKED same shape }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = { level: { value: 64, unit: '%', ok: true }, power: { value: 1500, unit: 'W', ok: true }, health: { value: 97, unit: '%', ok: true }, temp: { value: 22.5, unit: '°C', ok: true },
    inToday: { value: 6.2, unit: 'kWh', ok: true }, outToday: { value: 3.1, unit: 'kWh', ok: true } };
  const W = { W: 1, kW: 1000, MW: 1e6 };
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const nf = (v, d = 1) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
  const dur = (h) => (h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(h * 60))} min`);
  function create(config) {
    // LINKED (bindMany): config.items = { <role>: { value, unit, ok } | null } — every value from Home Assistant, no demo value mixed in
    const lk = (p) => (p && p.items && typeof p.items === 'object' ? { ...p, vals: p.items, linked: true, items: undefined } : p);
    let s = { name: 'Home battery', reserve: 0, positive: 'charge', ...lk(config || {}) };
    const root = el('article', 'iq-hb'); root.setAttribute('role', 'group');
    root.innerHTML = `<header class="iq-hb__head"><h3 class="iq-hb__name"></h3><span class="iq-hb__state"></span></header>
      <div class="iq-hb__main"><div class="iq-hb__cell"><i class="iq-hb__fill"></i><i class="iq-hb__res"></i><b class="iq-hb__pct"></b></div>
        <div class="iq-hb__facts"><p class="iq-hb__kwh"></p><p class="iq-hb__pw"></p><p class="iq-hb__time"></p></div></div>
      <ul class="iq-hb__chips"></ul>`;
    const $ = (q) => root.querySelector(q);
    function render() {
      const v = s.vals || (s.linked ? {} : DEMO), ok = (k) => v[k] && v[k].ok && Number.isFinite(Number(v[k].value));
      const lvl = ok('level') ? Math.max(0, Math.min(100, Number(v.level.value))) : null;
      const capE = ok('capacityEntity') ? Number(v.capacityEntity.value) * (/^Wh$/i.test(v.capacityEntity.unit) ? 0.001 : 1) : null;
      const cap = capE ?? (Number(s.capacity) > 0 ? Number(s.capacity) : null);
      const pw = ok('power') ? Number(v.power.value) * (W[v.power.unit] || 1) * (s.positive === 'discharge' ? -1 : 1) : null;   // + charging
      $('.iq-hb__name').textContent = s.name || 'Home battery';
      const st = pw === null ? (s.vals && !ok('level') ? 'Unavailable' : '') : Math.abs(pw) < 20 ? 'Idle' : pw > 0 ? 'Charging' : 'Discharging';
      $('.iq-hb__state').textContent = st; root.dataset.state = st.toLowerCase();
      $('.iq-hb__pct').textContent = lvl === null ? '—' : `${Math.round(lvl)}%`;
      $('.iq-hb__fill').style.height = `${lvl ?? 0}%`;
      $('.iq-hb__cell').dataset.tone = lvl === null ? 'unknown' : lvl <= Math.max(10, s.reserve || 0) ? 'low' : lvl < 30 ? 'mid' : 'ok';
      $('.iq-hb__res').hidden = !(s.reserve > 0); $('.iq-hb__res').style.bottom = `${s.reserve || 0}%`;
      const left = lvl !== null && cap ? (lvl / 100) * cap : null;
      $('.iq-hb__kwh').textContent = left === null ? '' : `${nf(left, 1)} of ${nf(cap, 1)} kWh`;
      $('.iq-hb__pw').textContent = pw === null || Math.abs(pw) < 20 ? '' : `${pw > 0 ? 'In' : 'Out'} ${Math.abs(pw) >= 1000 ? `${nf(Math.abs(pw) / 1000, 2)} kW` : `${Math.round(Math.abs(pw))} W`}`;
      // time: a remaining-time sensor when mapped, else ≈ from the current power (to full, or to the reserve)
      let t = '';
      if (ok('runtime')) { const u = String(v.runtime.unit || 'min').toLowerCase(), m = Number(v.runtime.value) * (u.startsWith('h') ? 60 : u === 's' ? 1 / 60 : 1); t = `${pw !== null && pw > 0 ? 'Full in' : 'Empty in'} ${dur(m / 60)}`; }
      else if (pw !== null && Math.abs(pw) >= 20 && lvl !== null && cap) {
        const kw = Math.abs(pw) / 1000, target = pw > 0 ? 100 : Math.max(0, s.reserve || 0), need = Math.abs(target - lvl) / 100 * cap;
        if ((pw > 0 && lvl < 99.5) || (pw < 0 && lvl > target)) t = `≈ ${pw > 0 ? 'full' : s.reserve > 0 ? 'reserve' : 'empty'} in ${dur(need / kw)}`;
      }
      $('.iq-hb__time').textContent = t;
      $('.iq-hb__time').title = t.startsWith('≈') ? 'An estimate from the current power and the usable capacity' : '';
      const chips = [ok('health') && ['Health', `${nf(v.health.value, 0)}${v.health.unit === '%' ? '%' : ` ${v.health.unit || ''}`}`], ok('temp') && ['Temperature', `${nf(v.temp.value, 1)} ${v.temp.unit || ''}`],
        ok('inToday') && ['In today', `${nf(v.inToday.value, 2)} ${v.inToday.unit || 'kWh'}`], ok('outToday') && ['Out today', `${nf(v.outToday.value, 2)} ${v.outToday.unit || 'kWh'}`]].filter(Boolean);
      $('.iq-hb__chips').replaceChildren(...chips.map(([k, x]) => { const li = el('li'); const a = el('span'), b = el('b'); a.textContent = k; b.textContent = x.trim(); li.append(a, b); return li; }));
      root.setAttribute('aria-label', `${s.name || 'Home battery'}: ${lvl === null ? 'level unknown' : `${Math.round(lvl)} percent`}${st ? `, ${st.toLowerCase()}` : ''}`);
    }
    render();
    root.homebattery = { getState: () => ({ ...s }), setState(p) { s = { ...s, ...lk(p || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 4 }; }
  global.MaisonHomeBattery = { create, constraints, DEMO };
})(window);
