/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Climate group V1 — several thermostats / air-conditioning units in one card: the average temperature, ONE target for all of them,
   the modes and fan speeds they ALL support, and each unit below with its own controls.

   Nothing is assumed about a unit: a control is offered only from what Home Assistant reports for it —
     · group target −/+ : shown when at least one unit has a single set point; each such unit moves one of ITS OWN steps from ITS OWN
       target, kept inside ITS OWN min / max (different targets keep their difference; a unit without a set point is left alone)
     · group modes : only the HVAC modes every available unit offers (the intersection); group fan speeds: only when every available
       unit supports a fan mode, and only the speeds they all share
     · each unit: its own −/+ (when it has a set point), its own mode as reported, its heating / cooling action; unavailable → dimmed

   MaisonClimateGroup.create(config) → HTMLElement (.iq-cg), with el.climategroup = { getState(), setState(patch) }
   config = { id, name, items: LINKED [unit view…] | demo, onRequest(entity, ctl): { target } | { mode } | { fan } }
   unit view = { entity, name, available, mode, action, current, target, min, max, step, modes: [], fanModes: [], fan, canTarget, canFan }
   ========================================================================== */
(function (global) {
  'use strict';
  const DEMO = [
    { entity: 'd1', name: 'Living room', available: true, mode: 'heat', action: 'heating', current: 20.4, target: 21, min: 7, max: 30, step: 0.5, modes: ['off', 'heat', 'auto'], fanModes: [], canTarget: true },
    { entity: 'd2', name: 'Bedroom', available: true, mode: 'heat', action: 'idle', current: 19.1, target: 19, min: 7, max: 30, step: 0.5, modes: ['off', 'heat'], fanModes: [], canTarget: true },
    { entity: 'd3', name: 'Office', available: true, mode: 'off', action: 'off', current: 18.6, target: 20, min: 5, max: 28, step: 1, modes: ['off', 'heat', 'cool'], fanModes: [], canTarget: true },
  ];
  const MODE = { off: 'Off', heat: 'Heat', cool: 'Cool', heat_cool: 'Heat / cool', auto: 'Auto', dry: 'Dry', fan_only: 'Fan' };
  const ACTION = { heating: 'Heating', cooling: 'Cooling', drying: 'Drying', fan: 'Fan', idle: 'Idle', off: 'Off', preheating: 'Preheating', defrosting: 'Defrosting' };
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
  /** a target for ONE unit: inside its own range, on its own step */
  function forUnit(u, t) {
    const step = u.step > 0 ? u.step : 0.5, min = Number.isFinite(u.min) ? u.min : 7, max = Number.isFinite(u.max) ? u.max : 35;
    return Math.max(min, Math.min(max, Math.round(t / step) * step));
  }
  const intersect = (lists) => (lists.length ? lists.reduce((a, l) => a.filter((x) => l.includes(x))) : []);

  function create(config) {
    let s = { name: 'Climate', ...(config || {}) };
    const root = el('article', 'iq-cg', { role: 'group' });
    if (s.id) root.dataset.cgId = s.id;
    root.innerHTML = `<header class="iq-cg__head"><h3 class="iq-cg__name"></h3><span class="iq-cg__avg"></span></header>
      <div class="iq-cg__group"><button type="button" class="iq-cg__step" data-d="-1" aria-label="Lower every target">−</button><div class="iq-cg__tgt"><b></b><small>All units</small></div><button type="button" class="iq-cg__step" data-d="1" aria-label="Raise every target">+</button></div>
      <div class="iq-cg__modes" role="group" aria-label="Mode for all units"></div><div class="iq-cg__fans" role="group" aria-label="Fan speed for all units"></div>
      <ul class="iq-cg__units"></ul>`;
    const $ = (q) => root.querySelector(q);
    const units = () => (Array.isArray(s.items) ? s.items : DEMO);
    const ask = (u, ctl) => { if (typeof s.onRequest === 'function' && !String(u.entity).startsWith('d')) s.onRequest(u.entity, ctl); };
    function render() {
      const all = units(), live = all.filter((u) => u.available !== false), targets = live.filter((u) => u.canTarget && Number.isFinite(u.target));
      $('.iq-cg__name').textContent = s.name || 'Climate';
      const cur = live.map((u) => u.current).filter((v) => Number.isFinite(v));
      $('.iq-cg__avg').textContent = cur.length ? `${fmt(cur.reduce((a, b) => a + b, 0) / cur.length)}° average` : '';
      // the shared target: the units' targets (the same → that value; different → the range)
      const grp = $('.iq-cg__group');
      grp.hidden = !targets.length;
      if (targets.length) {
        const lo = Math.min(...targets.map((u) => u.target)), hi = Math.max(...targets.map((u) => u.target));
        $('.iq-cg__tgt b').textContent = lo === hi ? `${fmt(lo)}°` : `${fmt(lo)}–${fmt(hi)}°`;
        $('.iq-cg__tgt small').textContent = lo === hi ? `All ${targets.length} units` : 'Different targets';
        grp.querySelectorAll('.iq-cg__step').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const d = Number(b.dataset.d);
          // every unit moves by ITS OWN step from ITS OWN target (different targets keep their difference; a unit at its limit stays)
          targets.forEach((u) => { const step = u.step > 0 ? u.step : 0.5, next = forUnit(u, u.target + d * step); if (next !== u.target) { u.target = next; ask(u, { target: next }); } }); render(); }; });
      }
      // the shared modes (every available unit has them)
      const modes = intersect(live.map((u) => (Array.isArray(u.modes) ? u.modes : [])));
      const mbox = $('.iq-cg__modes');
      mbox.hidden = live.length < 2 || !modes.length;
      const allMode = live.length && live.every((u) => u.mode === live[0].mode) ? live[0].mode : null;
      mbox.replaceChildren(...modes.map((m) => { const b = el('button', 'iq-cg__chip', { type: 'button', 'aria-pressed': String(allMode === m) }); b.textContent = MODE[m] || m.replace(/_/g, ' ');
        b.addEventListener('click', (e) => { e.stopPropagation(); live.forEach((u) => { if (u.mode !== m) { u.mode = m; ask(u, { mode: m }); } }); render(); }); return b; }));
      // the shared fan speeds (every available unit supports a fan mode, and these speeds)
      const fans = live.length && live.every((u) => u.canFan) ? intersect(live.map((u) => u.fanModes || [])) : [];
      const fbox = $('.iq-cg__fans');
      fbox.hidden = !fans.length;
      const allFan = live.length && live.every((u) => u.fan === live[0].fan) ? live[0].fan : null;
      fbox.replaceChildren(...fans.map((f) => { const b = el('button', 'iq-cg__chip iq-cg__chip--fan', { type: 'button', 'aria-pressed': String(allFan === f) }); b.textContent = `Fan ${f}`;
        b.addEventListener('click', (e) => { e.stopPropagation(); live.forEach((u) => { if (u.fan !== f) { u.fan = f; ask(u, { fan: f }); } }); render(); }); return b; }));
      // each unit
      $('.iq-cg__units').replaceChildren(...all.map((u) => {
        const li = el('li', 'iq-cg__unit'); li.dataset.available = String(u.available !== false); li.dataset.action = u.action || ''; li.dataset.entity = u.entity;
        const info = el('div', 'iq-cg__info'), n = el('b'), sub = el('span');
        n.textContent = u.name || u.entity;
        sub.textContent = u.available === false ? 'Unavailable' : [`${fmt(u.current)}°`, MODE[u.mode] || u.mode, u.action && u.action !== 'off' && u.action !== u.mode ? ACTION[u.action] || u.action : ''].filter(Boolean).join(' · ');
        info.append(n, sub);
        li.append(info);
        if (u.available !== false && u.canTarget && Number.isFinite(u.target)) {
          const ctl = el('div', 'iq-cg__ctl'), minus = el('button', 'iq-cg__s', { type: 'button', 'aria-label': `Lower ${u.name}` }), plus = el('button', 'iq-cg__s', { type: 'button', 'aria-label': `Raise ${u.name}` }), v = el('b');
          minus.textContent = '−'; plus.textContent = '+'; v.textContent = `${fmt(u.target)}°`;
          const step = u.step > 0 ? u.step : 0.5;
          minus.disabled = u.target - step < (Number.isFinite(u.min) ? u.min : -Infinity) - 1e-9; plus.disabled = u.target + step > (Number.isFinite(u.max) ? u.max : Infinity) + 1e-9;
          const go = (d) => (e) => { e.stopPropagation(); const next = forUnit(u, u.target + d * step); if (next !== u.target) { u.target = next; ask(u, { target: next }); render(); } };
          minus.addEventListener('click', go(-1)); plus.addEventListener('click', go(1));
          ctl.append(minus, v, plus); li.append(ctl);
        }
        return li;
      }));
      root.setAttribute('aria-label', `${s.name || 'Climate'}: ${live.length} of ${all.length} units available`);
    }
    render();
    root.climategroup = { getState: () => ({ ...s, units: units().map((u) => ({ ...u })) }), setState(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 4, tablet: 4, mobile: 4 }, minH: 6 }; }
  global.MaisonClimateGroup = { create, constraints, forUnit, intersect, DEMO };
})(window);
