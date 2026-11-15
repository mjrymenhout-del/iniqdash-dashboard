/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Calendar showroom. Demo events only (fixed "now" so the page always looks the same). */
(function () {
  'use strict';
  const G = window.MaisonGrid, K = window.MaisonCalendar, { mount, overlay } = window.Showroom;
  const NOW = '2026-10-14T09:30:00+02:00';
  const at = (d, hm) => `2026-10-${String(d).padStart(2, '0')}T${hm}:00+02:00`;
  const FAMILY = [
    { title: 'School run', start: at(14, '08:00'), end: at(14, '08:30') },
    { title: 'Design review', start: at(14, '10:00'), end: at(14, '11:00'), location: 'Studio' },
    { title: 'Lunch with Sam', start: at(14, '12:30'), end: at(14, '13:30'), location: 'Town centre' },
    { title: 'Dentist', start: at(14, '16:15'), end: at(14, '16:45'), location: 'Town centre' },
    { title: 'Football training', start: at(15, '18:00'), end: at(15, '19:30'), location: 'Sports hall' },
    { title: 'Bin collection', start: at(16, '00:00'), allDay: true },
    { title: 'Weekend in the Ardennes', start: at(17, '00:00'), allDay: true },
    { title: 'Boiler service', start: at(20, '09:00'), end: at(20, '10:00') },
  ];
  const cal = (cfg) => K.create({ now: NOW, name: 'Family', events: FAMILY, ...cfg });
  const item = (id, cfg, layout) => ({ id, layout, constraints: K.constraints(cfg), content: cal(cfg) });
  const c2 = (i) => ({ desktop: { x: 1 + i * 2, y: 1, w: 2, h: 3 }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * 3, w: 2, h: 3 }, mobile: { w: 2, h: 3 } });
  mount('states', G.create({ id: 'states', items: [
    item('next', { id: 'c1' }, c2(0)),
    item('live', { id: 'c2', name: 'Work', now: '2026-10-14T10:20:00+02:00' }, c2(1)),
    item('allday', { id: 'c3', name: 'Home', events: FAMILY.slice(5) }, c2(2)),
    item('empty', { id: 'c4', name: 'Holidays', events: [] }, c2(3)),
    item('na', { id: 'c5', name: 'School', available: false }, c2(4)),
  ] }));
  mount('spans', G.create({ id: 'spans', items: [
    item('std-3', { id: 's1' }, { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('std-5', { id: 's2' }, { desktop: { x: 5, y: 1, w: 4, h: 5 }, tablet: { x: 5, y: 1, w: 4, h: 5 }, mobile: { w: 4, h: 5 } }),
    item('wide-4', { id: 's3', now: '2026-10-14T10:20:00+02:00' }, { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 4, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('wide-6', { id: 's4' }, { desktop: { x: 1, y: 6, w: 6, h: 4 }, tablet: { x: 1, y: 7, w: 8, h: 4 }, mobile: { w: 4, h: 4 } }),
    item('wide-8', { id: 's5' }, { desktop: { x: 7, y: 6, w: 6, h: 5 }, tablet: { x: 1, y: 11, w: 8, h: 5 }, mobile: { w: 4, h: 5 } }),
  ] }));
  const agenda = G.create({ id: 'agenda-grid', nested: true, items: [
    item('n1', { id: 'n1' }, { tablet: { x: 1, y: 1, w: 8, h: 4 }, mobile: { w: 4, h: 4 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'agenda', layout: { desktop: { x: 1, y: 1, w: 6, h: 6 }, tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 6 } },
      content: { icon: window.DEMO_ICON.home, title: 'Agenda', subtitle: 'Primary container · nested grid', layout: 'free', content: [agenda] } },
  ] }));
  overlay('[data-demo="states"] > .mg');
})();
