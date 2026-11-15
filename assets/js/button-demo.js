/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Button showroom: every layout, shape and size; presses are logged (nothing is executed). */
(function () {
  'use strict';
  const G = window.MaisonGrid, B = window.MaisonButton, { mount, logger, overlay } = window.Showroom;
  const log = logger(document.getElementById('log'));
  const icons = window.DEMO_ICON || {};
  let n = 0;
  const it = (cfg, d, t, m) => ({ id: `b${++n}`, layout: { desktop: d, tablet: t, mobile: m }, constraints: B.constraints(),
    content: B.create({ icons, ...cfg, onPress: (r, meta) => log(`onPress (${meta.source}): ${r.action.type}${r.action.type === 'toggle' ? ` → ${r.on ? 'on' : 'off'}` : ''} · "${r.action.label}"`) }) });
  const P = (x, y, w, h) => ({ x, y, w, h });
  mount('layouts', G.create({ id: 'layouts', items: [
    it({ text: 'Scene', secondary: 'Evening', icon: 'star', layout: 'centered' }, P(1, 1, 3, 2), P(1, 1, 4, 2), { w: 2, h: 2 }),
    it({ text: 'Night', secondary: 'All lights', icon: 'moon', layout: 'icon-top', action: 'toggle' }, P(4, 1, 2, 3), P(5, 1, 2, 3), { w: 2, h: 3 }),
    it({ text: 'Lights', secondary: 'Living room', icon: 'bulb', layout: 'icon-left' }, P(6, 1, 4, 2), P(1, 3, 4, 2), { w: 4, h: 2 }),
    it({ text: 'Garage', secondary: 'Driveway', icon: 'garage', layout: 'icon-right' }, P(10, 1, 3, 2), P(5, 4, 4, 2), { w: 4, h: 2 }),
    it({ text: 'Tide', secondary: 'Album', image: 'assets/img/media/artwork-tide.jpg', layout: 'image-top' }, P(1, 3, 3, 4), P(1, 5, 3, 4), { w: 2, h: 4 }),
    it({ text: 'Dusk', secondary: 'Playlist', image: 'assets/img/media/artwork-dusk.jpg', layout: 'background' }, P(4, 4, 3, 3), P(4, 6, 4, 3), { w: 2, h: 3 }),
    it({ text: 'Indoor', value: '21.5', unit: '°C', icon: 'thermo', layout: 'value', action: 'none' }, P(7, 3, 2, 3), P(1, 9, 2, 3), { w: 2, h: 3 }),
    it({ text: 'Power', icon: 'power', layout: 'icon-only', action: 'toggle', on: true }, P(9, 3, 2, 2), P(3, 9, 2, 2), { w: 2, h: 2 }),
  ] }));
  mount('shapes', G.create({ id: 'shapes', items: [
    it({ text: 'Rectangle', icon: 'home', layout: 'icon-left', shape: 'rect' }, P(1, 1, 3, 2), P(1, 1, 4, 2), { w: 4, h: 2 }),
    it({ text: 'Square', icon: 'sofa', layout: 'icon-top', shape: 'square' }, P(4, 1, 2, 3), P(5, 1, 2, 3), { w: 2, h: 3 }),
    it({ text: 'Round', icon: 'power', layout: 'icon-only', shape: 'round' }, P(6, 1, 2, 3), P(7, 1, 2, 3), { w: 2, h: 3 }),
    it({ text: 'Open gate', icon: 'gate', layout: 'centered', shape: 'pill' }, P(8, 1, 4, 1), P(1, 4, 4, 1), { w: 4, h: 1 }),
  ] }));
  mount('sizes', G.create({ id: 'sizes', items: [6, 3, 2, 1].map((w, i) => it({ text: 'Lights', secondary: 'Living room', icon: 'bulb', layout: 'icon-left' },
    P([1, 7, 10, 12][i], 1, w, 2), P([1, 1, 4, 6][i], [1, 3, 3, 3][i], Math.min(w, 8), 2), { w: Math.min(w, 4), h: 2 })) }));
  overlay('[data-demo="layouts"] > .mg');
})();
