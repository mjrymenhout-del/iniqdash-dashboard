/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Solar V1 — solar panels now and today: power now (and % of the system size), produced today against the day's FORECAST (ahead /
   behind of what the forecast expected by now), what is still expected today, tomorrow's forecast, and where the power goes (house /
   battery / grid). Works with any integration (Forecast.Solar, Solcast, an inverter's own sensors): every value is a chosen entity.

   Honesty: "expected by now" = forecast today − forecast remaining today (both from the forecast integration); without a remaining
   sensor no ahead / behind is claimed. Unavailable → "—".

   MaisonSolar.create(config) → .iq-sol, el.solar = { getState(), setState(patch) }
   config = { name, capacity (kWp), vals: LINKED { power, today, forecast, remaining, tomorrow, toHouse, toBattery, toGrid } | demo }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = { power: { value: 4200, unit: 'W', ok: true }, today: { value: 18.4, unit: 'kWh', ok: true }, forecast: { value: 24.6, unit: 'kWh', ok: true }, remaining: { value: 7.9, unit: 'kWh', ok: true },
    tomorrow: { value: 19.2, unit: 'kWh', ok: true }, toHouse: { value: 1800, unit: 'W', ok: true }, toBattery: { value: 1500, unit: 'W', ok: true }, toGrid: { value: 900, unit: 'W', ok: true } };
  const W = { W: 1, kW: 1000, MW: 1e6 }, KWH = { Wh: 0.001, kWh: 1, MWh: 1000 };
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const nf = (v, d = 1) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  function create(config) {
    // LINKED (bindMany): config.items = { <role>: { value, unit, ok } | null } — every value from Home Assistant, no demo value mixed in
    const lk = (p) => (p && p.items && typeof p.items === 'object' ? { ...p, vals: p.items, linked: true, items: undefined } : p);
    let s = { name: 'Solar', ...lk(config || {}) };
    const root = el('article', 'iq-sol'); root.setAttribute('role', 'group');
    root.innerHTML = `<header class="iq-sol__head"><span class="iq-sol__ic">${SUN}</span><h3 class="iq-sol__name"></h3><span class="iq-sol__vs"></span></header>
      <div class="iq-sol__now"><b class="iq-sol__w"></b><span class="iq-sol__cap"></span></div>
      <div class="iq-sol__day"><div class="iq-sol__bar"><i class="iq-sol__made"></i><i class="iq-sol__exp"></i></div><p class="iq-sol__today"></p></div>
      <div class="iq-sol__split"></div><p class="iq-sol__tom"></p>`;
    const $ = (q) => root.querySelector(q);
    function render() {
      const v = s.vals || (s.linked ? {} : DEMO), ok = (k) => v[k] && v[k].ok && Number.isFinite(Number(v[k].value));
      const w = (k) => (ok(k) ? Number(v[k].value) * (W[v[k].unit] || 1) : null), e = (k) => (ok(k) ? Number(v[k].value) * (KWH[v[k].unit] ?? 1) : null);
      $('.iq-sol__name').textContent = s.name || 'Solar';
      const p = w('power');
      $('.iq-sol__w').textContent = p === null ? '—' : p >= 1000 ? `${nf(p / 1000, 2)} kW` : `${Math.round(p)} W`;
      root.dataset.producing = String(p !== null && p > 20);
      $('.iq-sol__cap').textContent = p !== null && Number(s.capacity) > 0 ? `${Math.round((p / 1000 / Number(s.capacity)) * 100)}% of ${nf(s.capacity, 1)} kWp` : p === null && s.vals ? 'Unavailable' : 'now';
      // today against the forecast
      const today = e('today'), fc = e('forecast'), rem = e('remaining');
      const day = $('.iq-sol__day'); day.hidden = today === null && fc === null;
      const max = Math.max(today ?? 0, fc ?? 0) || 1;
      $('.iq-sol__made').style.width = `${((today ?? 0) / max) * 100}%`;
      const expected = fc !== null && rem !== null ? Math.max(0, fc - rem) : null;
      $('.iq-sol__exp').hidden = expected === null; $('.iq-sol__exp').style.left = `${((expected ?? 0) / max) * 100}%`;
      $('.iq-sol__today').textContent = [today !== null && `${nf(today, 1)} kWh today`, fc !== null && `forecast ${nf(fc, 1)}`, rem !== null && `${nf(rem, 1)} still expected`].filter(Boolean).join(' · ');
      const vs = $('.iq-sol__vs');
      if (today !== null && expected !== null && expected > 0.2) { const d = (today - expected) / expected; vs.textContent = Math.abs(d) < 0.05 ? 'On forecast' : d > 0 ? `${Math.round(d * 100)}% above forecast` : `${Math.round(-d * 100)}% below forecast`; vs.dataset.tone = Math.abs(d) < 0.05 ? 'even' : d > 0 ? 'up' : 'down'; }
      else { vs.textContent = ''; delete vs.dataset.tone; }
      // where it goes now
      const parts = [['House', w('toHouse'), 'info'], ['Battery', w('toBattery'), 'success'], ['Grid', w('toGrid'), 'purple']].filter(([, x]) => x !== null && x > 0);
      const tot = parts.reduce((a, [, x]) => a + x, 0);
      const sp = $('.iq-sol__split'); sp.hidden = !parts.length;
      sp.replaceChildren(...parts.map(([k, x, c]) => { const d = el('span', 'iq-sol__seg'); d.style.flex = String(x / tot); d.style.setProperty('--iq-sol-c', `var(--${c})`); d.textContent = `${k} ${x >= 1000 ? `${nf(x / 1000, 1)} kW` : `${Math.round(x)} W`}`; d.title = d.textContent; return d; }));
      const tom = e('tomorrow');
      $('.iq-sol__tom').textContent = tom === null ? '' : `Tomorrow ≈ ${nf(tom, 1)} kWh (forecast)`;
      root.setAttribute('aria-label', `${s.name || 'Solar'}: ${$('.iq-sol__w').textContent} now${today !== null ? `, ${nf(today, 1)} kilowatt-hours today` : ''}`);
    }
    render();
    root.solar = { getState: () => ({ ...s }), setState(p) { s = { ...s, ...lk(p || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 4 }; }
  global.MaisonSolar = { create, constraints, DEMO };
})(window);
