/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Person showroom. Demo data only. */
(function () {
  'use strict';
  const G = window.MaisonGrid, R = window.MaisonPerson, { mount, overlay } = window.Showroom;
  const NOW = '2026-10-14T21:00:00+02:00';
  const item = (id, cfg, layout) => ({ id, layout, constraints: R.constraints(cfg), content: R.create({ now: NOW, ...cfg }) });
  const c2 = (i, h = 3) => ({ desktop: { x: 1 + (i % 6) * 2, y: 1 + Math.floor(i / 6) * h, w: 2, h }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * h, w: 2, h }, mobile: { w: 2, h } });
  const P = [
    { id: 'p1', name: 'Marcel', presence: 'home', secondary: 'Phone 64%' },
    { id: 'p2', name: 'Sam', presence: 'away', lastSeen: '2026-10-14T20:42:00+02:00' },
    { id: 'p3', name: 'Guest', icon: 'guest', initials: '', presence: 'zone', zone: 'Office', lastSeen: '2026-10-14T19:55:00+02:00' },
    { id: 'p4', name: 'Charlie', presence: 'unknown', lastSeen: '2026-10-13T08:10:00+02:00' },
    { id: 'p5', name: 'Old Phone', presence: 'home', available: false },
    { id: 'p6', name: 'Demo Person', presence: 'home', image: 'widgets/default/person/assets/avatar-demo.jpg' },
  ];
  mount('states', G.create({ id: 'states', items: P.map((p, i) => item(p.id, p, c2(i))) }));
  mount('spans', G.create({ id: 'spans', items: [
    item('short-1', { id: 's1', name: 'Marcel', presence: 'home' }, { desktop: { x: 1, y: 1, w: 2, h: 2 }, tablet: { x: 1, y: 1, w: 2, h: 2 }, mobile: { w: 2, h: 2 } }),
    item('short-2', { id: 's2', name: 'Sam', presence: 'away', lastSeen: '18 min ago' }, { desktop: { x: 3, y: 1, w: 2, h: 2 }, tablet: { x: 3, y: 1, w: 2, h: 2 }, mobile: { w: 2, h: 2 } }),
    item('std-1', { id: 's3', name: 'Sam', presence: 'away', lastSeen: '18 min ago', secondary: 'Phone 41%' }, { desktop: { x: 5, y: 1, w: 4, h: 2 }, tablet: { x: 5, y: 1, w: 4, h: 2 }, mobile: { w: 4, h: 2 } }),
    item('std-2', { id: 's4', name: 'Demo Person', presence: 'zone', zone: 'Gym', lastSeen: '2026-10-14T20:15:00+02:00', image: 'widgets/default/person/assets/avatar-demo.jpg' }, { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 3, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('broken', { id: 's5', name: 'Broken Photo', presence: 'home', image: 'data:image/png;base64,AAAA' }, { desktop: { x: 1, y: 3, w: 4, h: 2 }, tablet: { x: 5, y: 3, w: 4, h: 2 }, mobile: { w: 4, h: 2 } }),
  ] }));
  const people = G.create({ id: 'people-grid', nested: true, items: [
    item('n1', { id: 'n1', name: 'Marcel', presence: 'home' }, { tablet: { x: 1, y: 1, w: 4, h: 2 }, mobile: { w: 2, h: 2 } }),
    item('n2', { id: 'n2', name: 'Sam', presence: 'away', lastSeen: '18 min ago' }, { tablet: { x: 5, y: 1, w: 4, h: 2 }, mobile: { w: 2, h: 2 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'people', layout: { desktop: { x: 1, y: 1, w: 6, h: 4 }, tablet: { x: 1, y: 1, w: 8, h: 4 }, mobile: { w: 4, h: 4 } },
      content: { icon: window.DEMO_ICON.home, title: 'People', subtitle: 'Primary container · nested grid', status: { text: '1 home', tone: 'success' }, layout: 'free', content: [people] } },
  ] }));
  overlay('[data-demo="states"] > .mg');
})();
