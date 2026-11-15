/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Component gallery: every component built through the registry and placed on the grid. */
(function () {
  'use strict';
  const G = window.MaisonGrid, R = window.MaisonRegistry, { mount, overlay } = window.Showroom;
  let n = 0;
  /** one grid item from a registry type; constraints use the desktop width the item will get */
  const it = (type, config, desktop, tablet, mobile) => {
    const px = desktop.w * 104 - 16;
    return { id: `${type}-${++n}`, layout: { desktop, tablet, mobile }, constraints: R.TYPES[type].constraints({ ...R.TYPES[type].defaults, ...config }, px), content: R.build(type, config) };
  };
  const grid = (id, items, nested) => G.create({ id, nested, items });

  mount('controls', grid('controls', [
    it('light', {}, { x: 1, y: 1, w: 3, h: 4 }, { x: 1, y: 1, w: 3, h: 4 }, { w: 2, h: 4 }),
    it('fan', { name: 'Ceiling Fan' }, { x: 4, y: 1, w: 4, h: 4 }, { x: 4, y: 1, w: 5, h: 4 }, { w: 4, h: 4 }),
    it('climate', {}, { x: 8, y: 1, w: 5, h: 7 }, { x: 1, y: 5, w: 4, h: 7 }, { w: 4, h: 7 }),
    it('switch', {}, { x: 1, y: 5, w: 2, h: 3 }, { x: 5, y: 5, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('switch', { name: 'Garden Pump', subtitle: 'Garden', icon: 'pump', state: 'off' }, { x: 3, y: 5, w: 2, h: 3 }, { x: 7, y: 5, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('cover', { name: 'Study Blind', subtitle: 'Office', position: 55 }, { x: 5, y: 5, w: 3, h: 3 }, { x: 5, y: 8, w: 4, h: 3 }, { w: 4, h: 3 }),
  ]));

  mount('info', grid('info', [
    it('sensor', {}, { x: 1, y: 1, w: 2, h: 3 }, { x: 1, y: 1, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('sensor', { name: 'Humidity', icon: 'humidity', value: 58, unit: '%', precision: 0, status: 'Normal' }, { x: 3, y: 1, w: 2, h: 3 }, { x: 3, y: 1, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('sensor', { name: 'Solar Power', icon: 'solar', value: 3.84, unit: 'kW', precision: 2, status: 'Producing', tone: 'positive', trend: 'up', secondary: { label: 'Today', value: 14.2, unit: 'kWh' } }, { x: 5, y: 1, w: 4, h: 3 }, { x: 5, y: 1, w: 4, h: 3 }, { w: 4, h: 3 }),
    it('weather', {}, { x: 9, y: 1, w: 4, h: 3 }, { x: 1, y: 4, w: 4, h: 3 }, { w: 4, h: 3 }),
    it('person', {}, { x: 1, y: 4, w: 2, h: 2 }, { x: 5, y: 4, w: 2, h: 2 }, { w: 2, h: 2 }),
    it('person', { name: 'Sam', presence: 'away', lastSeen: '18 min ago' }, { x: 3, y: 4, w: 2, h: 2 }, { x: 7, y: 4, w: 2, h: 2 }, { w: 2, h: 2 }),
    it('sensor', { name: 'Front Door', icon: 'battery', value: 18, unit: '%', precision: 0, status: 'Low', tone: 'warning' }, { x: 1, y: 6, w: 2, h: 3 }, { x: 5, y: 6, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('sensor', { name: 'Garage', icon: 'temperature', value: 'unavailable' }, { x: 3, y: 6, w: 2, h: 3 }, { x: 7, y: 6, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('calendar', {}, { x: 5, y: 4, w: 8, h: 5 }, { x: 1, y: 9, w: 8, h: 5 }, { w: 4, h: 5 }),
  ]));

  mount('data', grid('data', [
    it('text', { primary: 'Ground Floor', secondary: 'Living room · Kitchen · Hall', size: 'l' }, { x: 1, y: 1, w: 6, h: 2 }, { x: 1, y: 1, w: 8, h: 2 }, { w: 4, h: 2 }),
    it('text', { primary: 'Outside', secondary: '12.4 °C', align: 'right', surface: true, size: 's' }, { x: 7, y: 1, w: 3, h: 2 }, { x: 1, y: 3, w: 4, h: 2 }, { w: 2, h: 2 }),
    it('text', { primary: 'Welcome Home', secondary: '', align: 'center', emphasis: 'muted' }, { x: 10, y: 1, w: 3, h: 2 }, { x: 5, y: 3, w: 4, h: 2 }, { w: 2, h: 2 }),
    it('gauge', {}, { x: 1, y: 3, w: 3, h: 4 }, { x: 1, y: 5, w: 3, h: 4 }, { w: 2, h: 4 }),
    it('gauge', { name: 'Battery', value: 18, unit: '%', decimals: 0, style: 'hbar', thresholds: 'falling', warning: 30, critical: 15 }, { x: 4, y: 3, w: 3, h: 2 }, { x: 4, y: 5, w: 5, h: 2 }, { w: 2, h: 2 }),
    it('gauge', { name: 'Power', value: 2860, unit: 'W', decimals: 0, style: 'value', min: 0, max: 4000, thresholds: 'rising', warning: 2500, critical: 3500 }, { x: 4, y: 5, w: 3, h: 2 }, { x: 4, y: 7, w: 5, h: 2 }, { w: 2, h: 2 }),
    it('gauge', { name: 'CO₂', value: 850, unit: 'ppm', decimals: 0, style: 'vbar', thresholds: 'rising', warning: 1000, critical: 1400 }, { x: 7, y: 3, w: 2, h: 4 }, { x: 1, y: 9, w: 2, h: 4 }, { w: 2, h: 4 }),
    it('gauge', { name: 'Pressure', value: 2.1, unit: 'bar', style: 'arc' }, { x: 9, y: 3, w: 2, h: 2 }, { x: 3, y: 9, w: 2, h: 2 }, { w: 2, h: 2 }),
    it('image', {}, { x: 11, y: 3, w: 2, h: 4 }, { x: 5, y: 9, w: 4, h: 4 }, { w: 2, h: 3 }),
    it('chart', {}, { x: 1, y: 7, w: 6, h: 5 }, { x: 1, y: 13, w: 8, h: 5 }, { w: 4, h: 4 }),
    it('chart', { name: 'Humidity', kind: 'area', range: '7d', unit: '%' }, { x: 7, y: 7, w: 4, h: 3 }, { x: 1, y: 18, w: 4, h: 3 }, { w: 4, h: 3 }),
    it('chart', { name: 'Solar', kind: 'bar', range: '12h', unit: 'kW' }, { x: 11, y: 7, w: 2, h: 3 }, { x: 5, y: 18, w: 4, h: 3 }, { w: 2, h: 3 }),
    it('gauge', { name: 'Garage', value: 'unavailable', unit: '°C' }, { x: 9, y: 5, w: 2, h: 2 }, { x: 3, y: 11, w: 2, h: 2 }, { w: 2, h: 2 }),
  ]));

  mount('media', grid('media', [
    it('media', {}, { x: 1, y: 1, w: 6, h: 4 }, { x: 1, y: 1, w: 8, h: 4 }, { w: 4, h: 4 }),
    it('appliance', {}, { x: 7, y: 1, w: 6, h: 2 }, { x: 1, y: 5, w: 8, h: 2 }, { w: 4, h: 3 }),
    it('appliance', { name: 'Dishwasher', subtitle: 'Kitchen', icon: 'dishwasher', state: 'finished', programme: 'Eco', progress: null, remaining: null, image: null }, { x: 7, y: 3, w: 2, h: 3 }, { x: 1, y: 7, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('action', {}, { x: 9, y: 3, w: 2, h: 2 }, { x: 3, y: 7, w: 2, h: 2 }, { w: 2, h: 2 }),
    it('action', { name: 'Open Gate', subtitle: 'Driveway', icon: 'gate', requiresConfirmation: true }, { x: 11, y: 3, w: 2, h: 2 }, { x: 5, y: 7, w: 4, h: 2 }, { w: 2, h: 2 }),
  ]));

  mount('security', grid('security', [
    it('camera', {}, { x: 1, y: 1, w: 5, h: 5 }, { x: 1, y: 1, w: 5, h: 5 }, { w: 4, h: 4 }),
    it('camera', { name: 'Driveway', fit: 'contain', state: 'recording' }, { x: 6, y: 1, w: 3, h: 3 }, { x: 6, y: 1, w: 3, h: 3 }, { w: 2, h: 2 }),
    it('lock', {}, { x: 9, y: 1, w: 2, h: 4 }, { x: 1, y: 6, w: 2, h: 4 }, { w: 2, h: 4 }),
    it('lock', { name: 'Garage Door', state: 'unlocked' }, { x: 11, y: 1, w: 2, h: 2 }, { x: 3, y: 6, w: 3, h: 2 }, { w: 2, h: 2 }),
    it('alarm', {}, { x: 6, y: 5, w: 5, h: 4 }, { x: 1, y: 10, w: 8, h: 4 }, { w: 4, h: 4 }),
    it('alarm', { name: 'Garage', state: 'armed_away', modes: ['arm_away'] }, { x: 11, y: 3, w: 2, h: 3 }, { x: 6, y: 6, w: 3, h: 3 }, { w: 2, h: 3 }),
  ]));

  mount('radial', grid('radial', [
    it('radial', { name: 'Go to', count: 4 }, { x: 1, y: 1, w: 2, h: 3 }, { x: 1, y: 1, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('radial', { name: 'Scenes', count: 6 }, { x: 3, y: 1, w: 3, h: 4 }, { x: 3, y: 1, w: 3, h: 4 }, { w: 2, h: 3 }),
    it('radial', { name: 'Quick actions', count: 8 }, { x: 6, y: 1, w: 6, h: 4 }, { x: 1, y: 5, w: 8, h: 4 }, { w: 4, h: 3 }),
  ]));

  mount('buttons', grid('buttons', [
    it('button', { text: 'Lights', secondary: 'Living room', icon: 'bulb', layout: 'icon-left' }, { x: 1, y: 1, w: 3, h: 2 }, { x: 1, y: 1, w: 3, h: 2 }, { w: 2, h: 2 }),
    it('button', { text: 'Night', icon: 'moon', layout: 'icon-top', shape: 'square', action: 'toggle' }, { x: 4, y: 1, w: 2, h: 3 }, { x: 4, y: 1, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('button', { text: 'Power', icon: 'power', layout: 'icon-only', shape: 'round' }, { x: 6, y: 1, w: 2, h: 3 }, { x: 6, y: 1, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('button', { text: 'Indoor', value: '21.5', unit: '°C', icon: 'thermo', layout: 'value', action: 'none' }, { x: 8, y: 1, w: 2, h: 3 }, { x: 1, y: 4, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('button', { text: 'Dusk', secondary: 'Playlist', image: 'assets/img/media/artwork-dusk.jpg', layout: 'background' }, { x: 10, y: 1, w: 3, h: 3 }, { x: 3, y: 4, w: 3, h: 3 }, { w: 2, h: 3 }),
    it('button', { text: 'Open gate', icon: 'gate', layout: 'centered', shape: 'pill' }, { x: 1, y: 3, w: 3, h: 1 }, { x: 6, y: 4, w: 3, h: 1 }, { w: 4, h: 1 }),
  ]));

  const home = grid('home-grid', [
    it('light', { name: 'Pendant' }, { x: 1, y: 1, w: 3, h: 4 }, { x: 1, y: 1, w: 3, h: 4 }, { w: 2, h: 4 }),
    it('sensor', { name: 'Temperature' }, { x: 4, y: 1, w: 2, h: 3 }, { x: 4, y: 1, w: 2, h: 3 }, { w: 2, h: 3 }),
    it('switch', { name: 'Extractor' }, { x: 6, y: 1, w: 3, h: 3 }, { x: 6, y: 1, w: 3, h: 3 }, { w: 2, h: 3 }),
  ], true);
  const quick = grid('quick-grid', [
    it('action', { name: 'Good Night', icon: 'moon' }, { x: 1, y: 1, w: 4, h: 2 }, { x: 1, y: 1, w: 4, h: 2 }, { w: 4, h: 2 }),
    it('action', { name: 'Movie Scene', icon: 'scene' }, { x: 1, y: 3, w: 4, h: 2 }, { x: 1, y: 3, w: 4, h: 2 }, { w: 4, h: 2 }),
  ], true);
  const bare = grid('bare-grid', [
    it('person', {}, { x: 1, y: 1, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 }, { w: 2, h: 2 }),
    it('person', { name: 'Guest', presence: 'zone', zone: 'Office' }, { x: 3, y: 1, w: 2, h: 2 }, { x: 3, y: 1, w: 2, h: 2 }, { w: 2, h: 2 }),
  ], true);
  mount('containers', grid('containers', [
    { id: 'c-home', layout: { desktop: { x: 1, y: 1, w: 8, h: 6 }, tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 8 } }, content: R.build('container', { title: 'Kitchen', subtitle: 'Primary · nested grid', icon: 'pot' }, home) },
    { id: 'c-quick', layout: { desktop: { x: 9, y: 1, w: 4, h: 6 }, tablet: { x: 1, y: 7, w: 4, h: 6 }, mobile: { w: 4, h: 6 } }, content: R.build('container', { title: 'Scenes', subtitle: 'Secondary', variant: 'secondary', icon: 'bolt' }, quick) },
    { id: 'c-bare', layout: { desktop: { x: 1, y: 7, w: 8, h: 3 }, tablet: { x: 5, y: 7, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }, content: R.build('container', { title: 'People', subtitle: 'Bare — spacing only', variant: 'bare' }, bare) },
  ]));
  overlay('[data-demo="controls"] > .mg');
})();
