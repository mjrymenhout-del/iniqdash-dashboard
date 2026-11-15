/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqDashUI — the PUBLIC, VERSIONED interface of IniqDash's shared visual components, for built-in AND custom widgets
   (widgets/custom/<package>). A custom widget uses these instead of building its own button, value, slider or dial — and instead of
   reaching for an internal global that may change. Each entry is the same module the built-in widgets use (never a copy).

     IniqDashUI.version            1 — bumped only when a listed module changes incompatibly
     IniqDashUI.controls           IniqControls  — button (power / toggle / momentary / ± / action), segmented, stepper, select, placement
     IniqDashUI.info               IniqInfo      — information items (value · label · unit · icon · status), the information bar
     IniqDashUI.text               IniqText      — a formatted value / text
     IniqDashUI.slider             IniqSlider    — the slider
     IniqDashUI.dial               IniqDial      — the thermostat dial (no Climate dependency)
     IniqDashUI.gauge              IniqGauge     — a one-value arc / ring gauge
     IniqDashUI.visuals            IniqVisuals   — rings, badges, state-driven animation layers
     IniqDashUI.icons              IniqIcons     — Material Design Icons (mdi:…) and their animations
     IniqDashUI.flow               IniqFlow      — the flow connector
     IniqDashUI.sunArc             IniqSunArc    — the sun arc
     IniqDashUI.components         IniqComponents — the registry (catalog() for element metadata)
     IniqDashUI.has(name)          whether a module is present in this build
   Every module stays a pure renderer: it knows no Home Assistant entity; a widget feeds it values and receives the user's intent. The
   Home Assistant side (reads, secure actions) stays the host binding's (components/ha) — custom widgets get it through their roles.
   ========================================================================== */
(function (global) {
  'use strict';
  const M = { controls: 'IniqControls', info: 'IniqInfo', text: 'IniqText', slider: 'IniqSlider', dial: 'IniqDial', gauge: 'IniqGauge', visuals: 'IniqVisuals',
    icons: 'IniqIcons', flow: 'IniqFlow', sunArc: 'IniqSunArc', components: 'IniqComponents' };
  const api = { version: 1, has: (name) => !!(M[name] && global[M[name]]) };
  // getters: modules loaded after this file (icons) are found when first used
  Object.keys(M).forEach((k) => Object.defineProperty(api, k, { enumerable: true, get: () => global[M[k]] || null }));
  global.IniqDashUI = Object.freeze(api);
})(window);
