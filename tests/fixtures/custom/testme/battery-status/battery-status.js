/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Battery Status — CUSTOM widget package (widgets/custom/battery-status/, type "custom.battery-status").
   A display widget: the device name, the battery level as a large percentage and a battery graphic filled to it.
   Levels: normal (> 20 %), low (≤ 20 %), critical (≤ 10 %). Unavailable / unknown are shown as such.

   IniqBatteryStatus.create(config) → HTMLElement (.bat), with el.battery = { getState(), setState(patch) }
   config = { name, value (0–100, or a text state), available }   — without Home Assistant: demo value 76 %

   Home Assistant: this package contains NO Home Assistant code. widget.json declares
   "ha": { "domains": ["sensor"], "deviceClasses": ["battery"] }: the shared entity picker lists battery sensors only,
   and the shared read-only 'entity' binding hands over the normalised entity (config.haEntity at creation, then
   el.haEntity(entity) on every change). This widget reads its state (the level), unit and availability.
   Responsive: arrangements from the widget's OWN box (MaisonFit), never the screen.
   ========================================================================== */
(function (global) {
  'use strict';

  const TYPE = 'custom.battery-status';
  const LOW = 20, CRITICAL = 10;
  const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));

  /** the normalised entity (shared 'entity' binding) → this widget's state */
  const fromEntity = (e) => (e ? { value: e.available ? (num(e.state) ?? e.state) : (String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable'), available: e.available, unit: e.unit } : {});

  function create(config) {
    let s = { name: 'Battery', value: 76, available: true, ...(config || {}), ...fromEntity(config && config.haEntity) };
    delete s.haEntity;
    const root = document.createElement('article');
    root.className = 'bat';
    root.dataset.widget = TYPE;                       // the CSS scope, also when created outside the registry
    root.dataset.widgetSource = 'custom';
    root.setAttribute('role', 'meter');
    root.innerHTML = `
      <div class="bat__in">
        <h3 class="bat__name"></h3>
        <p class="bat__level"><b class="bat__num"></b><span class="bat__pct">%</span></p>
        <div class="bat__cell" aria-hidden="true"><div class="bat__body"><i class="bat__fill"></i></div><i class="bat__cap"></i></div>
        <p class="bat__note"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);

    function render() {
      const raw = s.value;
      const na = s.available === false || String(raw).toLowerCase() === 'unavailable';
      const unknown = !na && (raw === null || raw === undefined || raw === '' || String(raw).toLowerCase() === 'unknown');
      const v = !na && !unknown ? num(raw) : null;
      const pct = v !== null ? Math.max(0, Math.min(100, v)) : null;
      const level = pct === null ? 'none' : pct <= CRITICAL ? 'critical' : pct <= LOW ? 'low' : 'normal';
      root.dataset.state = na ? 'unavailable' : unknown ? 'unknown' : v !== null ? 'ok' : 'text';
      root.dataset.level = level;
      root.style.setProperty('--bat-level', pct === null ? '0' : String(pct / 100));
      $('.bat__name').textContent = s.name || 'Battery';
      $('.bat__num').textContent = v !== null ? String(Math.round(v)) : na ? '—' : unknown ? '—' : String(raw).slice(0, 12);
      $('.bat__pct').hidden = v === null;
      $('.bat__note').textContent = na ? 'Unavailable' : unknown ? 'Unknown' : level === 'critical' ? 'Critical' : level === 'low' ? 'Low' : '';
      root.setAttribute('aria-label', `${s.name || 'Battery'}: ${v !== null ? `${Math.round(v)} %${level === 'low' || level === 'critical' ? `, ${level}` : ''}` : na ? 'unavailable' : unknown ? 'unknown' : String(raw)}`);
      if (pct !== null) { root.setAttribute('aria-valuenow', String(Math.round(pct))); root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100'); }
      else ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].forEach((a) => root.removeAttribute(a));
    }

    render();
    if (global.MaisonFit) {
      global.MaisonFit.observe(root, {
        // full: name, big %, battery below · row: battery beside the % (short boxes) · mini: % and a small battery
        arrange: (w, h) => (h < 150 && h >= 80 && w >= 220 ? 'row' : w < 150 || h < 120 ? 'mini' : 'full'),
      });
    }
    root.battery = {
      getState: () => ({ value: s.value, state: root.dataset.state, level: root.dataset.level }),
      setState(patch) { s = { ...s, ...(patch || {}) }; render(); },
    };
    root.haEntity = (e) => root.battery.setState(fromEntity(e));   // the shared 'entity' binding: every HA change
    return root;
  }

  /** Smallest usable area: 2 × 2. */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  /** The registry entry: name + the Home Assistant battery entity (filters come from widget.json). */
  function define({ F }) {
    return {
      label: 'Battery Status',
      description: 'Custom · the battery level of one device: name, percentage and a battery that fills to it (low ≤ 20 %, critical ≤ 10 %).',
      glyph: '<rect x="2.5" y="7" width="17" height="10" rx="2.2"/><path d="M21.5 10.5v3"/><rect x="5" y="9.5" width="8" height="5" rx=".8"/>',
      size: { w: 3, h: 3 },
      defaults: { name: 'Front Door', value: 76, available: true },
      fields: [
        F.name(),
        { ...F.entity('entity'), help: 'A battery sensor. Linked: its live level. Not linked: a demo level.' },
      ],
    };
  }

  global.IniqBatteryStatus = { create, constraints, define };
})(window);
