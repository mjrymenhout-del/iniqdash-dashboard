/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Fan showroom. Demo data and local state only. */
(function () {
  'use strict';
  const G = window.MaisonGrid, F = window.MaisonFan, { mount, logger, overlay } = window.Showroom;
  const log = logger(document.getElementById('log'));
  const onChange = (n, p, m) => log(`onChange (${m.source}): ${p.state}/${p.speed ?? '–'}/${p.preset ?? '–'} → ${n.state}/${n.speed ?? '–'}/${n.preset ?? '–'}`);
  const fan = (cfg) => F.create({ onChange, ...cfg });
  const item = (id, cfg, layout, span) => ({ id, layout, constraints: F.constraints(cfg, { span }), content: fan(cfg) });
  const FULL = { capabilities: { power: true, speed: true, preset: true }, presets: ['Normal', 'Quiet', 'Boost'] };

  const c2 = (x, y, h) => ({ desktop: { x, y, w: 2, h }, tablet: { x: ((x - 1) % 8) + 1, y, w: 2, h }, mobile: { w: 2, h } });
  mount('states', G.create({ id: 'states', items: [
    item('1-on', { id: 'ceiling', name: 'Ceiling Fan', subtitle: 'Bedroom', state: 'on', speed: 60, preset: 'Normal', ...FULL }, c2(1, 1, 5)),
    item('2-off', { id: 'pedestal', name: 'Pedestal Fan', subtitle: 'Study', state: 'off', speed: 40, preset: 'Quiet', ...FULL }, c2(3, 1, 5)),
    item('3-unavailable', { id: 'attic', name: 'Attic Fan', subtitle: 'Attic', state: 'on', available: false, speed: 40, preset: 'Normal', ...FULL }, c2(5, 1, 5)),
  ] }));

  mount('caps', G.create({ id: 'caps', items: [
    item('4-power', { id: 'p-only', name: 'Bathroom Extractor', state: 'on', capabilities: { power: true } }, { desktop: { x: 1, y: 1, w: 2, h: 3 }, tablet: { x: 1, y: 1, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('5-speed', { id: 'p-speed', name: 'Ventilation', subtitle: 'Utility room', state: 'on', speed: 66.67, speedStep: 33.33, capabilities: { power: true, speed: true } }, { desktop: { x: 3, y: 1, w: 2, h: 4 }, tablet: { x: 3, y: 1, w: 2, h: 4 }, mobile: { w: 2, h: 4 } }),
    item('6-preset', { id: 'p-full', name: 'Living Room Fan', state: 'on', speed: 80, preset: 'Boost', ...FULL }, { desktop: { x: 5, y: 1, w: 2, h: 5 }, tablet: { x: 5, y: 1, w: 2, h: 5 }, mobile: { w: 2, h: 5 } }),
  ] }));

  mount('spans', G.create({ id: 'spans', items: [
    item('7-compact', { id: 's-compact', name: 'Desk Fan', state: 'on', speed: 40, capabilities: { power: true, speed: true } }, { desktop: { x: 1, y: 1, w: 2, h: 4 }, tablet: { x: 1, y: 1, w: 2, h: 4 }, mobile: { w: 2, h: 4 } }),
    item('8-standard', { id: 's-standard', name: 'Ceiling Fan', subtitle: 'Living room', state: 'on', speed: 60, preset: 'Normal', ...FULL }, { desktop: { x: 3, y: 1, w: 4, h: 4 }, tablet: { x: 3, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } }, 'standard'),
    item('9-wide', { id: 's-wide', name: 'Kitchen Extractor', subtitle: 'Kitchen', state: 'on', speed: 100, preset: 'Boost', ...FULL }, { desktop: { x: 7, y: 1, w: 6, h: 3 }, tablet: { x: 1, y: 5, w: 8, h: 3 }, mobile: { w: 4, h: 4 } }, 'wide'),
    item('9-wide-power', { id: 's-wide-p', name: 'Garage Extractor', subtitle: 'Garage', state: 'off', capabilities: { power: true } }, { desktop: { x: 7, y: 4, w: 6, h: 2 }, tablet: { x: 1, y: 8, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, 'wide'),
  ] }));

  const air = G.create({ id: 'air-grid', nested: true, items: [
    item('a1', { id: 'a1', name: 'Bedroom Fan', state: 'on', speed: 40, preset: 'Quiet', ...FULL }, { tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 2, h: 5 } }, 'standard'),
    item('a2', { id: 'a2', name: 'Ensuite Extractor', state: 'off', speed: 50, capabilities: { power: true, speed: true } }, { tablet: { x: 5, y: 1, w: 4, h: 4 }, mobile: { w: 2, h: 5 } }, 'standard'),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'air', layout: { desktop: { x: 1, y: 1, w: 6, h: 6 }, tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 7 } },
      content: { icon: window.DEMO_ICON.home, title: 'Air', subtitle: 'Primary container · nested grid', status: '1/2', layout: 'free', content: [air] } },
  ] }));

  overlay('[data-demo="states"] > .mg');
})();
