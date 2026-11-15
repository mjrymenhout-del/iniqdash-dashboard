/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Humidifier V1 — a humidifier or dehumidifier (humidifier.*): on / off, the current and target humidity, −/+ for the target inside the
   entity's OWN min / max, its modes (only those it reports), and what it is doing (humidifying / drying / idle).

   MaisonHumidifier.create(config) → .iq-hum, el.humidifier = { getState(), setState(patch) }
   config = { name, step (1–10 %), items: LINKED [view] | demo, onRequest(entity, ctl: { power } | { target } | { mode }) }
   view = { entity, name, available, on, current, target, min, max, mode, modes: [], action, kind: 'humidifier' | 'dehumidifier' }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = { entity: 'd1', name: 'Bedroom humidifier', available: true, on: true, current: 41, target: 45, min: 30, max: 70, mode: 'normal', modes: ['normal', 'eco', 'sleep', 'boost'], action: 'humidifying', kind: 'humidifier' };
  const ACTION = { humidifying: 'Humidifying', drying: 'Drying', idle: 'Idle', off: 'Off' };
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const DROP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c3.5 4.4 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.6 6-11z"/><path d="M9 15a3 3 0 0 0 3 3"/></svg>';
  function create(config) {
    let s = { name: '', step: 1, ...(config || {}) };
    const local = { ...DEMO };
    const root = el('article', 'iq-hum', { role: 'group' });
    root.innerHTML = `<header class="iq-hum__head"><span class="iq-hum__ic">${DROP}</span><div class="iq-hum__t"><h3 class="iq-hum__name"></h3><span class="iq-hum__st"></span></div>
      <button type="button" class="iq-hum__pw" role="switch"></button></header>
      <div class="iq-hum__dial"><svg viewBox="0 0 120 70" aria-hidden="true"><path class="iq-hum__track" d="M10 62a50 50 0 0 1 100 0"/><path class="iq-hum__arc" d="M10 62a50 50 0 0 1 100 0" pathLength="100"/><circle class="iq-hum__cur" r="4"/></svg>
        <div class="iq-hum__val"><b></b><small></small></div></div>
      <div class="iq-hum__ctl"><button type="button" class="iq-hum__s" data-d="-1" aria-label="Lower the target humidity">−</button><span class="iq-hum__tgt"></span><button type="button" class="iq-hum__s" data-d="1" aria-label="Raise the target humidity">+</button></div>
      <div class="iq-hum__modes" role="group" aria-label="Mode"></div>`;
    const $ = (q) => root.querySelector(q);
    const u = () => (Array.isArray(s.items) ? s.items[0] || { available: false } : local);
    const ask = (ctl) => { if (Array.isArray(s.items) && typeof s.onRequest === 'function' && u().entity) s.onRequest(u().entity, ctl); };
    function render() {
      const v = u(), live = v.available !== false, min = Number.isFinite(v.min) ? v.min : 0, max = Number.isFinite(v.max) && v.max > min ? v.max : 100;
      $('.iq-hum__name').textContent = s.name || v.name || 'Humidifier';
      root.dataset.on = String(live && !!v.on); root.dataset.action = v.action || ''; root.dataset.available = String(live);
      $('.iq-hum__st').textContent = !live ? 'Unavailable' : !v.on ? 'Off' : [ACTION[v.action] || v.action, v.mode && v.mode !== 'normal' ? v.mode.replace(/_/g, ' ') : ''].filter(Boolean).join(' · ') || 'On';
      const pw = $('.iq-hum__pw'); pw.disabled = !live; pw.setAttribute('aria-checked', String(!!v.on)); pw.setAttribute('aria-label', `${s.name || v.name || 'Humidifier'} power`);
      const pct = (x) => Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100));
      const t = Number.isFinite(v.target) ? v.target : null, c = Number.isFinite(v.current) ? v.current : null;
      $('.iq-hum__arc').style.strokeDasharray = `${t === null ? 0 : pct(t)} 100`;
      const cur = $('.iq-hum__cur');
      if (c === null) cur.style.display = 'none'; else { const a = Math.PI * (1 - pct(c) / 100); /* the same scale as the arc: the device's own min–max */ cur.style.display = ''; cur.setAttribute('cx', String(60 + 50 * Math.cos(a))); cur.setAttribute('cy', String(62 - 50 * Math.sin(a))); }
      $('.iq-hum__val b').textContent = c === null ? '—' : `${Math.round(c)}%`;
      $('.iq-hum__val small').textContent = c === null ? '' : 'now';
      $('.iq-hum__tgt').textContent = t === null ? '—' : `Target ${Math.round(t)}%`;
      const step = Math.max(1, Math.min(10, Number(s.step) || 1));
      root.querySelectorAll('.iq-hum__s').forEach((b) => { const d = Number(b.dataset.d); b.disabled = !live || t === null || (d < 0 ? t - step < min - 1e-9 : t + step > max + 1e-9); });
      const modes = live && Array.isArray(v.modes) ? v.modes : [];
      const mb = $('.iq-hum__modes'); mb.hidden = modes.length < 2;
      mb.replaceChildren(...modes.map((m) => { const b = el('button', 'iq-hum__chip', { type: 'button', 'aria-pressed': String(v.mode === m) }); b.textContent = m.replace(/_/g, ' ');
        b.addEventListener('click', (e) => { e.stopPropagation(); if (v.mode === m) return; v.mode = m; ask({ mode: m }); render(); }); return b; }));
      root.setAttribute('aria-label', `${s.name || v.name || 'Humidifier'}: ${$('.iq-hum__st').textContent}${c !== null ? `, ${Math.round(c)} percent` : ''}`);
    }
    $('.iq-hum__pw').addEventListener('click', (e) => { e.stopPropagation(); const v = u(); v.on = !v.on; if (!v.on) v.action = 'off'; ask({ power: v.on }); render(); });
    root.querySelectorAll('.iq-hum__s').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const v = u(), step = Math.max(1, Math.min(10, Number(s.step) || 1)), min = Number.isFinite(v.min) ? v.min : 0, max = Number.isFinite(v.max) ? v.max : 100;
      const next = Math.max(min, Math.min(max, Math.round((v.target + Number(b.dataset.d) * step) / step) * step));
      if (next !== v.target) { v.target = next; ask({ target: next }); render(); }
    }));
    render();
    root.humidifier = { getState: () => ({ ...s, view: { ...u() } }), setState(p) { s = { ...s, ...(p || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 6 }; }
  global.MaisonHumidifier = { create, constraints, DEMO };
})(window);
