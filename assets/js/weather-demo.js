/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Weather showroom. Demo data only. */
(function () {
  'use strict';
  const G = window.MaisonGrid, W = window.MaisonWeather, { mount, overlay } = window.Showroom;
  const item = (id, cfg, layout) => ({ id, layout, constraints: W.constraints(cfg), content: W.create(cfg) });
  const FC = [
    { label: 'Thu', condition: 'showers', high: 13, low: 7, precipitation: 60 },
    { label: 'Fri', condition: 'cloudy', high: 12, low: 6, precipitation: 20 },
    { label: 'Sat', condition: 'partly-cloudy', high: 15, low: 8, precipitation: 10 },
    { label: 'Sun', condition: 'clear', high: 17, low: 9, precipitation: 0 },
    { label: 'Mon', condition: 'rain', high: 11, low: 7, precipitation: 80 },
    { label: 'Tue', condition: 'thunder', high: 14, low: 9, precipitation: 70 },
  ];
  const OTT = { location: 'Home', condition: 'partly-cloudy', temperature: 14, feelsLike: 12, high: 16, low: 8, humidity: 72, wind: { speed: 14, unit: 'km/h', direction: 'SW' }, precipitation: { value: 20, unit: '%' }, forecast: FC };
  const c2 = (i) => ({ desktop: { x: 1 + (i % 6) * 2, y: 1 + Math.floor(i / 6) * 3, w: 2, h: 3 }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * 3, w: 2, h: 3 }, mobile: { w: 2, h: 3 } });
  const C = [
    { id: 'w1', location: 'Home', condition: 'partly-cloudy', temperature: 14, high: 16, low: 8 },
    { id: 'w2', location: 'City', condition: 'rain', temperature: 11, high: 12, low: 7 },
    { id: 'w3', location: 'Riverside', condition: 'clear', temperature: 19, high: 21, low: 9 },
    { id: 'w4', location: 'Liège', condition: 'thunder', temperature: 16, high: 18, low: 11 },
    { id: 'w5', location: 'Ardennes', condition: 'snow', temperature: -2, high: 0, low: -5 },
    { id: 'w6', location: 'Coast', condition: 'clear-night', temperature: 9, high: 15, low: 7 },
    { id: 'w7', location: 'Antwerp', condition: 'fog', temperature: 7 },
    { id: 'w8', location: 'Ghent', condition: 'wind', temperature: 10, conditionLabel: 'Windy' },
  ];
  mount('states', G.create({ id: 'states', items: C.map((c, i) => item(c.id, c, c2(i))) }));
  mount('spans', G.create({ id: 'spans', items: [
    item('standard', { id: 's-std', ...OTT }, { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('wide', { id: 's-wide', ...OTT }, { desktop: { x: 5, y: 1, w: 8, h: 4 }, tablet: { x: 1, y: 4, w: 8, h: 4 }, mobile: { w: 4, h: 3 } }),
    item('wide-short', { id: 's-wide-short', ...OTT, location: 'Town centre', condition: 'cloudy', temperature: 13 }, { desktop: { x: 1, y: 5, w: 6, h: 3 }, tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('wide-nostats', { id: 's-nostats', location: 'Town centre', condition: 'showers', temperature: 12, high: 14, low: 6, forecast: FC.slice(0, 4) }, { desktop: { x: 7, y: 5, w: 4, h: 3 }, tablet: { x: 1, y: 8, w: 6, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('unavailable', { id: 's-na', location: 'Garden station', condition: 'clear', temperature: null, available: false }, { desktop: { x: 11, y: 5, w: 2, h: 3 }, tablet: { x: 7, y: 8, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
  ] }));
  const out = G.create({ id: 'out-grid', nested: true, items: [
    item('o1', { id: 'o1', ...OTT }, { tablet: { x: 1, y: 1, w: 8, h: 4 }, mobile: { w: 4, h: 3 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'outside', layout: { desktop: { x: 1, y: 1, w: 8, h: 6 }, tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 5 } },
      content: { icon: window.DEMO_ICON.home, title: 'Outside', subtitle: 'Primary container · nested grid', layout: 'free', content: [out] } },
  ] }));
  overlay('[data-demo="states"] > .mg');
})();
