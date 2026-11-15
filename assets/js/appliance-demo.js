/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Appliance showroom. Demo data only; a small responder answers action requests via setState(). */
(function () {
  'use strict';
  const G = window.MaisonGrid, P = window.MaisonAppliance, { mount, logger, overlay } = window.Showroom;
  const log = logger(document.getElementById('log'));
  const WASHER = { image: 'widgets/default/appliance/assets/washing-machine.png', imageRatio: 300 / 360 };
  const reply = { pause: { state: 'paused', status: 'Paused' }, resume: { state: 'running', status: 'Running' }, start: { state: 'running', status: 'Running', progress: 0 }, stop: { state: 'idle', status: 'Idle', progress: null, remaining: null } };
  const nextActions = { paused: [{ id: 'resume', label: 'Resume' }, { id: 'stop', label: 'Stop' }] };
  const appliance = (cfg) => {
    let el;
    el = P.create({ ...cfg, onAction: (id, m) => { log(`onAction (${m.source}): ${id} → ${cfg.name}`); setTimeout(() => el.appliance.setState(reply[id] || {}), 500); } });
    return el;
  };
  const item = (id, cfg, layout, span) => ({ id, layout, constraints: P.constraints(cfg, { span }), content: appliance(cfg) });
  const c2 = (i) => ({ desktop: { x: 1 + (i % 6) * 2, y: 1 + Math.floor(i / 6) * 3, w: 2, h: 3 }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * 3, w: 2, h: 3 }, mobile: { w: 2, h: 3 } });
  const D = [
    { id: 'washer', icon: 'washer', name: 'Washing Machine', state: 'running', programme: 'Cotton', remaining: 42, progress: 65, actions: [{ id: 'pause', label: 'Pause' }] },
    { id: 'dryer', icon: 'dryer', name: 'Dryer', state: 'paused', programme: 'Delicates', remaining: 25, progress: 40 },
    { id: 'dish', icon: 'dishwasher', name: 'Dishwasher', state: 'finished', programme: 'Eco' },
    { id: 'oven', icon: 'oven', name: 'Oven', state: 'heating', status: 'Heating', programme: 'Fan bake', secondary: '180 °C' },
    { id: 'coffee', icon: 'coffee', name: 'Coffee Machine', state: 'idle', status: 'Ready' },
    { id: 'vacuum', icon: 'vacuum', name: 'Robot Vacuum', state: 'error', status: 'Stuck', secondary: 'Living room' },
    { id: 'na', icon: 'washer', name: 'Laundry Dryer', state: 'running', available: false, progress: 30 },
  ];
  mount('states', G.create({ id: 'states', items: D.map((d, i) => item(d.id, d, c2(i))) }));

  mount('spans', G.create({ id: 'spans', items: [
    item('compact-art', { id: 'c-art', icon: 'washer', name: 'Washer', state: 'running', programme: 'Quick 30', remaining: 18, progress: 40, ...WASHER }, { desktop: { x: 1, y: 1, w: 2, h: 3 }, tablet: { x: 1, y: 1, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('standard', { id: 's-art', icon: 'washer', name: 'Washing Machine', subtitle: 'Utility room', state: 'running', programme: 'Cotton 40°', remaining: 42, progress: 65, secondary: '1400 rpm', actions: [{ id: 'pause', label: 'Pause' }, { id: 'stop', label: 'Stop' }], ...WASHER },
      { desktop: { x: 3, y: 1, w: 4, h: 4 }, tablet: { x: 3, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } }),
    item('standard-noart', { id: 's-noart', icon: 'dishwasher', name: 'Dishwasher', subtitle: 'Kitchen', state: 'idle', status: 'Ready to start', programme: 'Eco 50°', actions: [{ id: 'start', label: 'Start' }] },
      { desktop: { x: 7, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 5, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('wide', { id: 'w-art', icon: 'washer', name: 'Washing Machine', subtitle: 'Utility room', state: 'running', programme: 'Cotton 40°', remaining: 95, progress: 22, actions: [{ id: 'pause', label: 'Pause' }], ...WASHER },
      { desktop: { x: 1, y: 5, w: 6, h: 2 }, tablet: { x: 1, y: 8, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, 'wide'),
    item('wide-oven', { id: 'w-oven', icon: 'oven', name: 'Oven', subtitle: 'Kitchen', state: 'heating', programme: 'Fan bake', secondary: '180 °C', progress: 70 },
      { desktop: { x: 7, y: 5, w: 6, h: 2 }, tablet: { x: 1, y: 10, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, 'wide'),
  ] }));

  const util = G.create({ id: 'util-grid', nested: true, items: [
    item('u1', { id: 'u1', icon: 'washer', name: 'Washer', state: 'running', programme: 'Cotton', remaining: 42, progress: 65, ...WASHER }, { tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('u2', { id: 'u2', icon: 'dryer', name: 'Dryer', state: 'finished', programme: 'Cupboard dry' }, { tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'utility', layout: { desktop: { x: 1, y: 1, w: 6, h: 5 }, tablet: { x: 1, y: 1, w: 8, h: 5 }, mobile: { w: 4, h: 5 } },
      content: { icon: P.ICONS.washer, title: 'Utility room', subtitle: 'Primary container · nested grid', status: '1 running', layout: 'free', content: [util] } },
  ] }));
  overlay('[data-demo="states"] > .mg');
})();
