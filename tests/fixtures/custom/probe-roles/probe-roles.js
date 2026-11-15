/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* TEST FIXTURE (not a shipped widget): a package that declares unrelated roles and an action slot, to prove the custom-widget HA contract is
   manifest-driven — two sensors, a multiple "doors" role and a switch action slot. It shows the raw haState and exposes haRequest to the test. */
(function (global) {
  'use strict';
  function create(config) {
    let s = { ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'iq-probe';
    root.innerHTML = '<h3 class="iq-probe__name"></h3><pre class="iq-probe__out"></pre><button type="button" class="iq-probe__on">On</button><button type="button" class="iq-probe__off">Off</button>';
    const render = () => { root.querySelector('.iq-probe__name').textContent = s.name || 'Probe'; root.querySelector('.iq-probe__out').textContent = JSON.stringify(s.haState || null); };
    root.haState = (st) => { s = { ...s, haState: st }; render(); };
    root.probe = { request: (r) => (typeof s.haRequest === 'function' ? s.haRequest(r) : Promise.resolve({ ok: false, error: 'no_channel' })), state: () => s.haState || null };
    root.querySelector('.iq-probe__on').addEventListener('click', () => root.probe.request({ slot: 'power', index: 0, action: 'turn_on' }));
    root.querySelector('.iq-probe__off').addEventListener('click', () => root.probe.request({ slot: 'power', index: 0, action: 'turn_off' }));
    render();
    return root;
  }
  const constraints = () => ({ minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 });
  function define() {
    return { label: 'Probe (roles fixture)', description: 'Test fixture', size: { w: 3, h: 3 }, defaults: { name: 'Probe' }, fields: [{ key: 'name', type: 'text', label: 'Name', group: 'identity', maxLength: 40 }] };
  }
  global.IniqProbeRoles = { create, constraints, define };
})(window);
