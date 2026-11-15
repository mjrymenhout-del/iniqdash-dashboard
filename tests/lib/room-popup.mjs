/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// A REFERENCE ROOM POPUP built only from generic IniqDash configuration (development proof of Popup V2 + the Tabbed Container): the
// header picture, title, subtitle, Back / Menu / Close and the HERO INFORMATION (three entity values in the left / centre / right
// slots) are the popup's settings; the tabs are a Tabbed Container whose tabs hold ordinary Light / Climate / Media / Alarm / Sensor /
// Switch widgets. The information entities are DEMO entities of the test's fake Home Assistant (DEMO_ENTITIES) — no real entity, no
// credential. Nothing here is special-cased by the application: it is data, exactly what the editor writes.
export const POPUP_ID = 'salle-a-manger';
/** the fake Home Assistant's demo entities the hero information reads ([state, picks] — tests/lib/live.mjs ENTITIES) */
export const DEMO_ENTITIES = {
  'sensor.demo_dining_humidity': ['58', { name: 'Dining humidity', unit: '%', dc: 'humidity' }],
  'sensor.demo_dining_temperature': ['22.2', { name: 'Dining temperature', unit: '°C', dc: 'temperature' }],
  'sensor.demo_dining_lights_on': ['0/1', { name: 'Dining lights on' }],
};
/** the hero information lines (what the Popup Settings → Information collection writes) */
export const HERO_INFO = [
  { id: 'h1', entity: 'sensor.demo_dining_humidity', value: 'state', label: 'Humidity', icon: 'mdi:water-outline', color: 'info', slot: 'left', style: 'card' },
  { id: 'h2', entity: 'sensor.demo_dining_temperature', value: 'state', label: 'Room temperature', slot: 'center', style: 'emphasis' },
  { id: 'h3', entity: 'sensor.demo_dining_lights_on', value: 'state', label: 'Lights on', icon: 'mdi:lightbulb-outline', color: 'warning', valueColor: 'icon', slot: 'right', style: 'card' },
];
// tablet: the 12 desktop columns scaled to 8 (half stays half); mobile: full width (4)
const L = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: Math.round((x - 1) * 8 / 12) + 1, y, w: Math.max(1, Math.round(w * 8 / 12)), h }, mobile: { w: 4, h } });
const F = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: Math.round(x * 0.84), y, w: Math.round(w * 0.84), h } });
export function roomPopup() {
  const it = (id, type, config, layout, extra = {}) => ({ id, type, parent: null, config, layout, ...extra });
  const tab = (id, type, t, config, layout) => ({ id, type, parent: 'sam-tabs', tab: t, config, layout });
  return {
    id: POPUP_ID,
    name: 'Salle à manger',
    config: {
      title: 'Salle à manger', subtitle: 'Media • Lights • Climate', size: 'custom', custom: { desktop: { w: 860, h: 900 }, tablet: { w: 720, h: 900 } },
      image: 'assets/img/popups/demo-dining.svg', hero: 'medium', overlay: 'medium', titleSize: 'large', backButton: true, closeButton: true,
      menu: 'navigate', menuPage: 'home', heroInfo: HERO_INFO,
      backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal',
    },
    items: [
      // the tabs: a Tabbed Container (its tabs are labels — nothing about lights or heating is built in)
      it('sam-tabs', 'tabs', { title: 'Room tabs', tabs: [{ id: 'active', label: 'Active', badge: '3' }, { id: 'lights', label: 'Lights' }, { id: 'heating', label: 'Heating' }, { id: 'media', label: 'Media' }, { id: 'security', label: 'Security' }, { id: 'sensors', label: 'Sensors' }], align: 'center', style: 'bare' },
        L(1, 1, 12, 16), { frame: F(0, 0, 828, 560) }),
      tab('sam-a-light', 'light', 'active', { name: 'Salle à manger', state: 'on', brightness: 80, capabilities: { power: true, brightness: true }, variant: 'compact' }, L(1, 1, 7, 2)),
      tab('sam-a-stove', 'climate', 'active', { name: 'Pellet stove', variant: 'compact' }, L(8, 1, 5, 2)),
      tab('sam-a-tv', 'switch', 'active', { name: 'Living TV', state: 'on' }, L(1, 3, 6, 2)),
      tab('sam-l-light', 'light', 'lights', { name: 'Salle à manger', state: 'on', brightness: 80, capabilities: { power: true, brightness: true } }, L(1, 1, 6, 5)),
      tab('sam-h-stove', 'climate', 'heating', { name: 'Pellet stove' }, L(1, 1, 12, 10)),
      tab('sam-m-tv', 'media', 'media', { name: 'Living TV' }, L(1, 1, 12, 7)),
      tab('sam-s-alarm', 'alarm', 'security', { name: 'Home' }, L(1, 1, 12, 5)),
      tab('sam-s-occ', 'sensor', 'security', { name: 'Occupancy', icon: 'signal', value: 'Occupied', variant: 'status' }, L(1, 6, 6, 2)),
      tab('sam-s-door', 'lock', 'security', { name: 'Front door' }, L(7, 6, 6, 4)),
      tab('sam-n-temp', 'sensor', 'sensors', { name: 'Temperature', icon: 'temperature', value: 24.5, unit: '°C', precision: 1 }, L(1, 1, 4, 3)),
      tab('sam-n-hum', 'sensor', 'sensors', { name: 'Humidity', icon: 'humidity', value: 58, unit: '%', precision: 0 }, L(5, 1, 4, 3)),
    ],
  };
}
/** a room card on the page that opens the popup (its Tap interaction — the ordinary Room widget) */
export const roomCard = { id: 'sam-room', type: 'custom.room-scene', parent: null, config: { name: 'Salle à manger', interactions: { tap: { action: 'popup', popup: POPUP_ID } } }, layout: { desktop: { x: 1, y: 40, w: 5, h: 4 }, tablet: { x: 1, y: 40, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } };
