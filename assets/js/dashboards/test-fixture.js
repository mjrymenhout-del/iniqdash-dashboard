/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* The former development / test dashboard (Home · Rooms · Studio · Scenes): a four-page application with a
   Navigation Dock, Radial Action Menus, a Floating Container, popups and notification templates + rules.
   No longer the main dashboard (that is dashboards/maison.js); kept as the fixture the editor test suites
   run against, and so the earlier configuration stays recoverable. Load it with editor.html?dashboard=test. */
(function () {
  'use strict';
  const L = (d, t, m) => ({ ...(d ? { desktop: d } : {}), ...(t ? { tablet: t } : {}), ...(m ? { mobile: m } : {}) });
  const p = (x, y, w, h) => ({ x, y, w, h });
  const s = (w, h) => ({ w, h });

  const HOME_ITEMS = [
      { id: 'home', type: 'container', config: { title: 'Living room', subtitle: 'Ground floor', variant: 'primary', icon: 'home' },
        layout: L(p(1, 1, 8, 9), p(1, 1, 8, 9), s(4, 16)) },
      { id: 'living-pendant', type: 'light', parent: 'home', config: { name: 'Pendant' }, layout: L(null, p(1, 1, 3, 4), s(2, 4)) },
      { id: 'living-temp', type: 'sensor', parent: 'home', config: { name: 'Temperature' }, layout: L(null, p(7, 1, 2, 3), s(2, 4)) },
      { id: 'living-climate', type: 'climate', parent: 'home', config: { name: 'Living Room' }, layout: L(null, p(4, 1, 3, 7), s(4, 7)) },
      { id: 'living-humidity', type: 'sensor', parent: 'home', config: { name: 'Humidity', icon: 'humidity', value: 58, unit: '%', precision: 0, status: 'Normal' }, layout: L(null, p(7, 4, 2, 4), s(2, 3)) },
      { id: 'kitchen-extractor', type: 'switch', parent: 'home', config: { name: 'Extractor', subtitle: 'Kitchen' }, layout: L(null, p(1, 5, 3, 3), s(2, 3)) },

      { id: 'weather', type: 'weather', config: {}, layout: L(p(9, 1, 4, 3), p(1, 10, 4, 3), s(4, 3)) },
      { id: 'calendar', type: 'calendar', config: { name: 'Family' }, layout: L(p(9, 4, 4, 6), p(1, 13, 4, 8), s(4, 5)) },

      { id: 'energy', type: 'container', config: { title: 'Energy', subtitle: 'Today', variant: 'secondary', icon: 'bolt' },
        layout: L(p(1, 10, 4, 11), p(5, 10, 4, 11), s(4, 12)) },
      { id: 'solar', type: 'sensor', parent: 'energy', config: { name: 'Solar Power', icon: 'solar', value: 3.84, unit: 'kW', precision: 2, status: 'Producing', tone: 'positive', trend: 'up', secondary: { label: 'Today', value: 14.2, unit: 'kWh' } }, layout: L(null, null, s(4, 4)) },
      { id: 'washer', type: 'appliance', parent: 'energy', config: {}, layout: L(null, null, s(4, 3)) },
      { id: 'grid-import', type: 'sensor', parent: 'energy', config: { name: 'Grid Import', icon: 'power', value: 0.42, unit: 'kW', precision: 2, status: 'Importing' }, layout: L(null, null, s(2, 3)) },
      { id: 'home-battery', type: 'sensor', parent: 'energy', config: { name: 'Home Battery', icon: 'battery', value: 76, unit: '%', precision: 0, status: 'Charging', tone: 'positive' }, layout: L(null, null, s(2, 3)) },

      { id: 'security', type: 'container', config: { title: 'Security & presence', subtitle: 'Everyone home', variant: 'secondary', icon: 'shield' },
        layout: L(p(5, 10, 4, 11), p(1, 21, 4, 11), s(4, 12)) },
      { id: 'marcel', type: 'person', parent: 'security', config: { name: 'Marcel', presence: 'home', lastSeen: 'Arrived 08:12' }, layout: L(null, null, s(2, 3)) },
      { id: 'sam', type: 'person', parent: 'security', config: { name: 'Sam', presence: 'zone', zone: 'Office', lastSeen: '18 min ago' }, layout: L(null, null, s(2, 3)) },
      { id: 'good-night', type: 'action', parent: 'security', config: { name: 'Good Night', icon: 'moon' }, layout: L(null, null, s(2, 3)) },
      { id: 'gate', type: 'action', parent: 'security', config: { name: 'Open Gate', subtitle: 'Driveway', icon: 'gate', requiresConfirmation: true }, layout: L(null, null, s(2, 3)) },
      { id: 'garage', type: 'cover', parent: 'security', config: { name: 'Garage Door', subtitle: 'Driveway', state: 'closed', position: 0, capabilities: { open: true, close: true, stop: true, position: false } }, layout: L(null, null, s(4, 4)) },

      { id: 'media', type: 'container', config: { title: 'Media', subtitle: 'Living room', variant: 'secondary', icon: 'play' },
        layout: L(p(9, 10, 4, 11), p(5, 21, 4, 11), s(4, 12)) },
      { id: 'living-speaker', type: 'media', parent: 'media', config: {}, layout: L(null, null, s(4, 6)) },
      { id: 'ambilight', type: 'switch', parent: 'media', config: { name: 'TV Backlight', subtitle: 'Living room', icon: 'plug', state: 'off' }, layout: L(null, null, s(2, 4)) },
      { id: 'movie-night', type: 'action', parent: 'media', config: { name: 'Movie Night', icon: 'scene' }, layout: L(null, null, s(2, 4)) },
  ];

  const go = (label, icon, page) => ({ label, icon, type: 'navigate', page, enabled: true, confirm: false, keepOpen: false });
  const act = (label, icon, type, extra) => ({ label, icon, type, enabled: true, confirm: false, keepOpen: false, ...(extra || {}) });

  /* version 2: an application with several pages (array order = Navigation Dock order) */
  const DEMO = {
    version: 3,
    app: { id: 'maison-home', startPage: 'home', navigation: { desktop: 'left', tablet: 'bottom', mobile: 'bottom' } },
    pages: [
      { id: 'home', name: 'Home', icon: 'home', nav: true, items: HOME_ITEMS },
      { id: 'rooms', name: 'Rooms', icon: 'sofa', subtitle: 'Upstairs', nav: true, items: [
        { id: 'bedroom', type: 'container', config: { title: 'Bedroom', subtitle: 'Upstairs', variant: 'primary', icon: 'moon' },
          layout: L(p(1, 1, 4, 13), p(1, 1, 4, 13), s(4, 15)) },
        { id: 'bedroom-climate', type: 'climate', parent: 'bedroom', config: { name: 'Bedroom', currentTemperature: 19.5, targetTemperature: 19 }, layout: L(p(1, 1, 4, 7), p(1, 1, 4, 7), s(4, 7)) },
        { id: 'bedroom-menu', type: 'radial', parent: 'bedroom', config: { name: 'Bedroom', count: 4, actions: [
          act('Lamp', 'bulb', 'toggle'), act('Night', 'moon', 'demo', { confirm: true }), go('Home', 'home', 'home'), act('Music', 'music', 'toggle'),
        ] }, layout: L(p(1, 8, 2, 3), p(1, 8, 2, 3), s(2, 3)) },
        { id: 'bedroom-temp', type: 'sensor', parent: 'bedroom', config: { name: 'Bedroom', value: 19.5 }, layout: L(p(3, 8, 2, 3), p(3, 8, 2, 3), s(2, 3)) },
        { id: 'bedroom-fan', type: 'fan', config: { name: 'Ceiling Fan' }, layout: L(p(5, 1, 4, 5), p(5, 1, 4, 5), s(4, 5)) },
        { id: 'bedroom-blind', type: 'cover', config: { name: 'Blinds', subtitle: 'Bedroom' }, layout: L(p(9, 1, 4, 5), p(5, 6, 4, 5), s(4, 5)) },
        { id: 'bedroom-lamp', type: 'light', config: { name: 'Reading Lamp' }, layout: L(p(5, 6, 3, 4), p(5, 11, 4, 4), s(2, 4)) },
      ] },
      { id: 'studio', name: 'Studio', icon: 'chart', subtitle: 'Free composition', nav: true, items: [
        { id: 'studio-free', type: 'floating', config: { title: 'Studio', subtitle: 'Floating container · placed to the pixel', variant: 'primary', icon: 'sofa', mobile: 'structured' },
          layout: L(p(1, 1, 8, 10), p(1, 1, 8, 10), s(4, 14)) },
        { id: 'studio-temp', type: 'sensor', parent: 'studio-free', config: { name: 'Studio', value: 21.4 }, layout: L(null, null, s(2, 3)),
          frame: { desktop: { x: 0, y: 0, w: 205, h: 150 }, tablet: { x: 0, y: 0, w: 190, h: 150 } } },
        { id: 'studio-hum', type: 'sensor', parent: 'studio-free', config: { name: 'Humidity', icon: 'humidity', value: 52, unit: '%', precision: 0, status: 'Normal' }, layout: L(null, null, s(2, 3)),
          frame: { desktop: { x: 218, y: 0, w: 205, h: 150 }, tablet: { x: 203, y: 0, w: 190, h: 150 } } },
        { id: 'studio-lamp', type: 'light', parent: 'studio-free', config: { name: 'Desk Lamp' }, layout: L(null, null, s(4, 4)),
          frame: { desktop: { x: 0, y: 163, w: 423, h: 210 }, tablet: { x: 0, y: 163, w: 393, h: 200 } } },
        { id: 'studio-tools', type: 'container', parent: 'studio-free', config: { title: 'Tools', subtitle: '', variant: 'secondary', icon: 'gear' }, layout: L(null, null, s(4, 7)),
          frame: { desktop: { x: 436, y: 0, w: 220, h: 373 }, tablet: { x: 406, y: 0, w: 240, h: 363 } } },
        { id: 'studio-plug', type: 'switch', parent: 'studio-tools', config: { name: 'Soldering', subtitle: 'Bench', icon: 'plug', state: 'off' }, layout: L(p(1, 1, 3, 3), p(1, 1, 2, 3), s(2, 3)) },
        { id: 'studio-scene', type: 'action', parent: 'studio-tools', config: { name: 'Focus mode', icon: 'scene' }, layout: L(p(1, 4, 3, 2), p(1, 4, 2, 2), s(2, 3)) },
        { id: 'studio-weather', type: 'weather', config: {}, layout: L(p(9, 1, 4, 3), p(1, 11, 4, 3), s(4, 3)) },
        { id: 'studio-float', type: 'radial', config: { name: 'Quick', count: 5, float: true, actions: [
          act('Lights', 'bulb', 'popup', { popup: 'lights-popup' }), go('Home', 'home', 'home'), act('Music', 'music', 'toggle'), act('Night', 'moon', 'demo', { confirm: true }), act('Scene', 'star', 'demo'),
        ] }, layout: L(p(11, 6, 2, 3), p(7, 13, 2, 3), s(2, 3)), frame: { desktop: { x: 1068, y: 470, w: 88, h: 88 }, tablet: { x: 620, y: 12, w: 80, h: 80 } } },
        { id: 'studio-lights-btn', type: 'action', config: { name: 'Lights panel', icon: 'scene', run: 'popup', popup: 'lights-popup' }, layout: L(p(9, 4, 4, 2), p(5, 11, 4, 2), s(4, 2)) },
        { id: 'studio-menu', type: 'radial', config: { name: 'Studio', count: 4, actions: [
          act('Lights', 'bulb', 'popup', { popup: 'lights-popup' }), act('Agenda', 'chart', 'popup', { popup: 'agenda-popup' }), act('Visitor', 'camera', 'popup', { popup: 'visitor-popup' }), go('Home', 'home', 'home'),
        ] }, layout: L(p(9, 6, 2, 3), p(5, 13, 2, 3), s(2, 3)) },
      ] },
      { id: 'scenes', name: 'Scenes', icon: 'star', subtitle: 'Shortcuts', nav: true, items: [
        { id: 'quick-actions', type: 'radial', config: { name: 'Quick actions', count: 8, actions: [
          go('Home', 'home', 'home'), go('Rooms', 'sofa', 'rooms'), act('Lights', 'bulb', 'toggle'), act('Good night', 'moon', 'demo', { confirm: true }),
          act('Music', 'music', 'toggle', { keepOpen: true }), act('Climate', 'thermo', 'demo'), act('Garage', 'garage', 'demo', { confirm: true }), act('Camera', 'camera', 'demo', { enabled: false }),
        ] }, layout: L(p(1, 1, 6, 4), p(1, 1, 8, 4), s(4, 3)) },
        { id: 'scene-menu', type: 'radial', config: { name: 'Scenes', count: 6, actions: [
          act('Morning', 'sun', 'demo'), act('Movie', 'play', 'demo'), act('Dinner', 'pot', 'demo'), act('Away', 'lock', 'demo', { confirm: true }), act('Night', 'moon', 'demo'), go('Home', 'home', 'home'),
        ] }, layout: L(p(7, 1, 3, 4), p(1, 5, 4, 4), s(2, 3)) },
        { id: 'go-menu', type: 'radial', config: { name: 'Go to', count: 4, actions: [
          go('Home', 'home', 'home'), go('Rooms', 'sofa', 'rooms'), go('Scenes', 'star', 'scenes'), act('Power', 'power', 'toggle'),
        ] }, layout: L(p(10, 1, 2, 3), p(5, 5, 2, 3), s(2, 3)) },
        { id: 'scenes-light', type: 'light', config: { name: 'Hallway' }, layout: L(p(1, 5, 3, 4), p(1, 9, 4, 4), s(4, 4)) },
      ] },
    ],
    popups: [
      { id: 'lights-popup', name: 'Living room lights', config: { title: 'Living room lights', icon: 'bulb', size: 'custom', custom: { desktop: { w: 600, h: 330 }, tablet: { w: 520, h: 330 } }, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal' },
        items: [
          { id: 'pop-pendant', type: 'light', config: { name: 'Pendant' }, layout: L(null, null, s(2, 4)), frame: { desktop: { x: 0, y: 0, w: 271, h: 230 }, tablet: { x: 0, y: 0, w: 236, h: 230 } } },
          { id: 'pop-reading', type: 'light', config: { name: 'Reading', state: 'off' }, layout: L(null, null, s(2, 4)), frame: { desktop: { x: 284, y: 0, w: 284, h: 230 }, tablet: { x: 249, y: 0, w: 239, h: 230 } } },
        ] },
      { id: 'agenda-popup', name: 'Agenda', config: { title: 'Agenda', icon: 'chart', size: 'full', closeButton: true, backdrop: true, outsideClose: false, escClose: true, enter: 'slide-up', exit: 'slide-down', speed: 'normal' },
        items: [
          { id: 'pop-calendar', type: 'calendar', config: { name: 'Family' }, layout: L(null, null, s(4, 6)), frame: { desktop: { x: 0, y: 0, w: 560, h: 380 }, tablet: { x: 0, y: 0, w: 420, h: 380 } } },
          { id: 'pop-weather', type: 'weather', config: {}, layout: L(null, null, s(4, 3)), frame: { desktop: { x: 573, y: 0, w: 380, h: 170 }, tablet: { x: 0, y: 393, w: 420, h: 170 } } },
        ] },
      { id: 'visitor-popup', name: 'Visitor', config: { title: '', icon: '', size: 'fit', closeButton: true, backdrop: false, outsideClose: true, escClose: true, enter: 'slide-left', exit: 'slide-right', speed: 'fast' },
        items: [
          { id: 'pop-visitor', type: 'person', config: { name: 'Courier', presence: 'home', lastSeen: 'At the door' }, layout: L(null, null, s(4, 2)), frame: { desktop: { x: 0, y: 0, w: 260, h: 96 } } },
          { id: 'pop-gate', type: 'action', config: { name: 'Open Gate', icon: 'gate', requiresConfirmation: true }, layout: L(null, null, s(4, 2)), frame: { desktop: { x: 0, y: 109, w: 260, h: 96 } } },
        ] },
    ],
    notifications: {
      templates: [
        { id: 'front-door', name: 'Front Door Open', config: { title: 'Front door open', message: 'The front door has been open for 2 minutes.', icon: 'door', position: 'top-right', persistent: false, duration: 6, closeButton: true, tone: 'warning', style: 'card', enter: 'slide-left', exit: 'fade', speed: 'normal' } },
        { id: 'doorbell', name: 'Doorbell', config: { title: 'Someone is at the door', message: 'Doorbell · Driveway camera', icon: 'bell', image: 'widgets/default/person/assets/avatar-demo.jpg', position: 'center', persistent: true, closeButton: true, tone: 'info', style: 'card', enter: 'scale', exit: 'fade', speed: 'normal' } },
        { id: 'washing', name: 'Washing done', config: { title: 'Washing machine finished', message: 'Cotton 40° · 1 h 12 min', icon: 'check', image: 'widgets/default/appliance/assets/washing-machine.png', position: 'bottom-right', persistent: false, duration: 8, closeButton: true, tone: 'success', style: 'card', enter: 'slide-up', exit: 'fade', speed: 'normal' } },
        { id: 'leak', name: 'Water leak', config: { title: 'Water leak detected', message: 'Utility room sensor', icon: 'drop', position: 'top-left', persistent: true, closeButton: true, tone: 'danger', style: 'solid', enter: 'slide-right', exit: 'fade', speed: 'fast' } },
        { id: 'battery', name: 'Low battery', config: { title: 'Hall sensor battery 12%', message: '', icon: 'alert', position: 'bottom-left', persistent: false, duration: 5, closeButton: true, tone: 'neutral', style: 'compact', enter: 'fade', exit: 'fade', speed: 'slow' } },
      ],
      rules: [
        { id: 'rule-front-door', name: 'Front door', event: 'demo.front_door_open', template: 'front-door', enabled: true },
        { id: 'rule-doorbell', name: 'Doorbell', event: 'demo.doorbell', template: 'doorbell', enabled: true },
        { id: 'rule-washing', name: 'Washing', event: 'demo.washing_done', template: 'washing', enabled: true },
        { id: 'rule-leak', name: 'Leak', event: 'demo.water_leak', template: 'leak', enabled: true },
        { id: 'rule-battery', name: 'Battery', event: 'demo.low_battery', template: 'battery', enabled: true },
      ],
    },
  };

  (window.IniqDashboards = window.IniqDashboards || {}).test = DEMO;
})();
