/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Builds assets/demo/iniqdash-demo.json — THE INIQDASH DEMO: a dashboard of a FICTIONAL home, made only of standard IniqDash widgets, popups,
// notification templates / rules and the radial menu, bound to the SIMULATED HOME (server/ha/SimHome.php demoHome(), SimHaClient).
// Its look follows the project's design brief (charcoal cards, amber / orange for what is active, photos behind rooms and lights).
//   node tools/build-iniqdash-demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* ---- GRID: desktop 48 columns · 10 px rows · 18 px gaps (a card of n rows is 28n − 18 px tall); tablet 16 columns; phone 4 columns.
   add(id, type, config, desktop [x, y, w, h], tablet [x, y, w, h], mobile [w, h]) — the phone flows in the order items are added. */
const GRID = { desktop: { cols: 48, row: 10, gap: 18, pad: 24 }, tablet: { cols: 16, row: 10, gap: 16, pad: 20 }, mobile: { cols: 4, row: 10, gap: 12, pad: 14 } };
const SHIP_GRID = { ...GRID, desktop: { ...GRID.desktop, cols: process.env.KEEP48 ? 48 : 24 } };
const pages = [];
let page = null;
function newPage(id, name, icon) { page = { id, name, icon, nav: true, header: false, items: [] }; pages.push(page); }
const L = (d, t, m) => ({ desktop: { x: d[0], y: d[1], w: d[2], h: d[3] }, tablet: { x: t[0], y: t[1], w: t[2], h: t[3] }, mobile: { w: m[0], h: m[1] } });
function add(id, type, config, d, t, m) { page.items.push({ id, type, parent: null, config, layout: L(d, t, m) }); }
const popups = [];
function newPopup(id, name, config) { const p = { id, name, config, items: [] }; popups.push(p); return p; }

/* ---- PHOTOS (assets/img/photos/, free licences — THIRD-PARTY-NOTICES.md) */
const PH = (k) => `assets/img/photos/${k}.jpg`;

/* ---- the demo home (fictional) */
const ROOMS = [
  { id: 'living', name: 'Living room', icon: 'mdi:sofa-outline', color: '#a74cff', sub: 'Media · Lights', climate: 'climate.demo_living', media: 'media_player.demo_living',
    lights: [['living_ceiling', 'Ceiling'], ['living_floor', 'Floor lamp'], ['living_strip', 'LED strip']], motion: 'binary_sensor.demo_living_motion', window: 'binary_sensor.demo_living_window',
    more: [['sensor.demo_living_illuminance', 'Light level', 'mdi:brightness-6', 0], ['sensor.demo_living_power', 'Power', 'mdi:flash-outline', 0], ['sensor.demo_living_energy', 'Energy', 'mdi:lightning-bolt', 1]] },
  { id: 'kitchen', name: 'Kitchen', icon: 'mdi:stove', color: '#ff8c2d', sub: 'Lights · Switches', media: 'media_player.demo_kitchen', lights: [['kitchen_main', 'Main lights'], ['kitchen_cabinet', 'Under-cabinet']],
    door: 'binary_sensor.demo_back_door', lock: 'lock.demo_back_door', leak: 'binary_sensor.demo_kitchen_leak', more: [['sensor.demo_kitchen_power', 'Power', 'mdi:flash-outline', 0]] },
  { id: 'dining', name: 'Dining room', icon: 'mdi:silverware-fork-knife', color: '#99f53a', sub: 'Lights · Media', media: 'media_player.demo_kitchen', lights: [['dining_pendant', 'Pendant']], more: [] },
  { id: 'bedroom', name: 'Bedroom', icon: 'mdi:weather-night', color: '#a74cff', sub: 'Lights · Climate', climate: 'climate.demo_bedroom', lights: [['bedroom_ceiling', 'Ceiling'], ['bedside_left', 'Bedside left'], ['bedside_right', 'Bedside right']],
    window: 'binary_sensor.demo_bedroom_window', more: [['sensor.demo_bedroom_illuminance', 'Light level', 'mdi:brightness-6', 0]] },
  { id: 'bathroom', name: 'Bathroom', icon: 'mdi:water-outline', color: '#3fb6ff', sub: 'Lights · Sensors', climate: 'climate.demo_bathroom', lights: [['bathroom_mirror', 'Mirror'], ['bathroom_ceiling', 'Ceiling']],
    leak: 'binary_sensor.demo_bathroom_leak', more: [['sensor.demo_washer_state', 'Washing machine', 'mdi:washing-machine', null]] },
  { id: 'office', name: 'Office', icon: 'mdi:monitor', color: '#ff5181', sub: 'Lights · Climate', climate: 'climate.demo_office', lights: [['office_desk', 'Desk lamp'], ['office_ceiling', 'Ceiling']],
    window: 'binary_sensor.demo_office_window', more: [['sensor.demo_office_power', 'Power', 'mdi:flash-outline', 0]] },
  { id: 'garden', name: 'Garden', icon: 'mdi:pine-tree', color: '#99f53a', sub: 'Lights · Cameras', lights: [['garden_path', 'Path lights'], ['garden_spots', 'Spotlights']], motion: 'binary_sensor.demo_garden_motion', more: [] },
];
const light = (k) => `light.demo_${k}`;
const temp = (r) => `sensor.demo_${r}_temperature`, hum = (r) => `sensor.demo_${r}_humidity`;
const PEOPLE = [['person.demo_mia', 'Mia'], ['person.demo_noah', 'Noah'], ['person.demo_lea', 'Léa'], ['person.demo_theo', 'Theo']];
const POP = (id) => ({ interactions: { tap: { action: 'popup', popup: id } } });
const scene = (e, n, icon, extra = {}) => ({ name: n, icon, run: 'ha', entity: e, ...extra });

/* ---- the notification centre's starting entries (each visitor's own, marked demo); the simulated home's events add to them */
const SEED = [
  { title: 'Evening scene started', message: 'Living room and kitchen dimmed to warm white.', icon: 'mdi:weather-sunset', tone: 'info', category: 'Lighting', ago: 43 },
  { title: 'Front door locked', message: 'Locked automatically 2 minutes after closing.', icon: 'mdi:lock-check-outline', tone: 'success', category: 'Security', ago: 62, read: true },
  { title: 'Living room reached 21.5 °C', message: 'The heating reached its target temperature.', icon: 'mdi:thermometer-check', tone: 'info', category: 'Climate', ago: 120, read: true },
];
/** every page: the radial menu (four actions) pinned to the bottom-right corner of the screen */
function radial(pid) {
  const off = { icon: 'star', type: 'demo', enabled: false, confirm: false, keepOpen: false };
  page.items.push({ id: `${pid}-radial`, type: 'radial', parent: null, config: { name: 'Menu', count: 4, float: true, corner: 'bottom-right', ring: 'standard', actions: [
    { label: 'Home', icon: 'home', type: 'navigate', page: 'home', enabled: true, confirm: false, keepOpen: false },
    { label: 'Lights', icon: 'bulb', type: 'navigate', page: 'lights', enabled: true, confirm: false, keepOpen: false },
    { label: 'Scenes', icon: 'star', type: 'popup', popup: 'p-scenes', enabled: true, confirm: false, keepOpen: false },
    { label: 'Notifications', icon: 'bell', type: 'popup', popup: 'p-notify', enabled: true, confirm: false, keepOpen: false }, off, off, off, off] },
    layout: L([1, 300, 2, 4], [1, 300, 2, 4], [4, 4]), frame: { desktop: { x: 24, y: 24, w: 84, h: 84 }, tablet: { x: 24, y: 24, w: 84, h: 84 } } });
}

/* ================================================================== 1 · HOME */
newPage('home', 'Home', 'home');
// column 1 (16 wide): who's home · the household calendar spotlight · the notification centre
add('h-who', 'presence', { variant: 'row', name: 'Who’s home', people: PEOPLE.map(([entity, label], i) => ({ id: `p${i + 1}`, entity, label })) }, [1, 1, 14, 6], [1, 1, 8, 6], [4, 6]);
add('h-spot', 'spotlight', { name: 'Household', entity: 'calendar.demo_household', max: 3, auto: 8, chip: 'Reminder', image: PH('spot-bin'),
  rules: [{ id: 'r1', match: 'waste, recycling, bin', category: 'Household waste', icon: 'mdi:trash-can-outline', image: PH('spot-bin') },
    { id: 'r2', match: 'birthday', category: 'Birthday', icon: 'mdi:cake-variant', image: PH('spot-cake') }],
  button: { label: 'Calendar', icon: 'mdi:calendar-month-outline', popup: 'p-calendar' } }, [1, 7, 14, 17], [1, 7, 8, 17], [4, 16]);
add('h-notify', 'inbox', { variant: 'list', name: 'Notifications', max: 2, seed: SEED, resetOn: 'button.demo_reset' }, [1, 24, 14, 7], [1, 24, 8, 10], [4, 9]);
// column 2 (10 wide): weather · forecast · sun · readings · media
add('h-weather', 'weather', { variant: 'current', location: 'Today', entity: 'weather.home' }, [15, 1, 10, 6], [9, 1, 8, 7], [4, 6]);
add('h-forecast', 'weather', { variant: 'daily', location: 'Forecast', entity: 'weather.home', forecastType: 'daily', forecastRows: 3 }, [15, 7, 10, 9], [9, 8, 8, 9], [4, 9]);
add('h-sun', 'sunmoon', { variant: 'arc', name: 'Sun', entity: 'sun.sun' }, [15, 16, 10, 4], [9, 17, 8, 5], [4, 4]);
add('h-read', 'readings', { name: 'Readings', columns: 2, items: [{ id: 'v1', entity: temp('living'), label: 'Indoor temp', color: 'danger', decimals: 1 },
  { id: 'v2', entity: temp('garden'), label: 'Outdoor temp', color: 'warning', decimals: 1 }, { id: 'v3', entity: hum('living'), label: 'Humidity', color: 'info', decimals: 0 },
  { id: 'v4', entity: 'sensor.demo_water_flow', label: 'Water flow', color: 'purple', decimals: 1 }] }, [15, 20, 10, 7], [9, 22, 8, 7], [4, 7]);
add('h-media', 'media', { variant: 'minibar', name: 'Living room', entity: 'media_player.demo_living', ...POP('p-media') }, [15, 27, 10, 4], [9, 29, 8, 5], [4, 5]);
// column 3 (10 wide): the thermostat over its fire · my devices
add('h-climate', 'climate', { variant: 'dial', name: 'Living room', entity: 'climate.demo_living', hvacModes: ['heat', 'off'], image: PH('fire'), imageTreatment: 'dim', controls: [{ type: 'dial', design: 'knob', label: 'Temperature' }], ...POP('p-climate') }, [25, 1, 12, 17], [1, 34, 8, 19], [4, 18]);
add('h-dev-h', 'text', { variant: 'text', primary: 'My devices', secondary: '', align: 'left', size: 18, emphasis: 'strong', surface: false }, [25, 18, 12, 2], [9, 34, 8, 2], [4, 2]);
const device = (id, name, entity, icon, color, d, t) => add(id, 'devicetile', { name, entity, icon, color }, d, t, [2, 6]);
device('h-d0', 'Light', light('living_floor'), 'mdi:lightbulb-outline', 'yellow', [25, 20, 6, 6], [9, 36, 4, 7]);
device('h-d1', 'Climate', 'climate.demo_bedroom', 'mdi:thermometer', 'orange', [31, 20, 6, 6], [13, 36, 4, 7]);
device('h-d2', 'Fan', 'switch.demo_extractor', 'mdi:fan', 'blue', [25, 26, 6, 6], [9, 43, 4, 7]);
device('h-d3', 'Sound', 'media_player.demo_kitchen', 'mdi:volume-high', 'purple', [31, 26, 6, 6], [13, 43, 4, 7]);
// column 4 (12 wide): live activity · scenes
add('h-live', 'activity', { name: 'Live activity', max: 6, entries: [
  { entity: light('kitchen_cabinet'), icon: 'mdi:lightbulb-on', color: 'warning' }, { entity: 'person.demo_lea', icon: 'mdi:account', color: 'info' },
  { entity: 'climate.demo_living', icon: 'mdi:fire', color: 'warning' }, { entity: light('living_ceiling'), icon: 'mdi:lightbulb-on', color: 'warning' },
  { entity: 'media_player.demo_living', icon: 'mdi:music', color: 'accent' }, { entity: 'binary_sensor.demo_bedroom_window', icon: 'mdi:window-open-variant', color: 'danger' },
  { entity: 'sensor.demo_washer_state', icon: 'mdi:washing-machine', color: 'info' }] }, [37, 1, 12, 20], [1, 53, 8, 16], [4, 14]);
add('h-sc-h', 'text', { variant: 'text', primary: 'Scenes', secondary: '', align: 'left', size: 18, emphasis: 'strong', surface: false }, [37, 21, 12, 2], [9, 50, 8, 2], [4, 2]);
add('h-sc0', 'action', scene('scene.demo_evening', 'Evening', 'mdi:weather-sunset', { subtitle: 'Living room + kitchen on', look: 'scene', iconColor: 'orange' }), [37, 23, 6, 8], [9, 52, 4, 6], [2, 6]);
add('h-sc1', 'action', scene('scene.demo_movie', 'Movie', 'mdi:movie-open-outline', { subtitle: 'Dim lights, speaker on', look: 'scene', iconColor: 'pink' }), [43, 23, 6, 8], [13, 52, 4, 6], [2, 6]);
radial('h');

const title = (id, text, d, t) => add(id, 'text', { variant: 'heading', primary: text, secondary: '', align: 'left', size: 'm', emphasis: 'strong', surface: false }, d, t, [4, 3]);
const head = (id, text, sub, d, t) => add(id, 'text', { variant: 'text', primary: text, secondary: sub || '', align: 'left', size: 17, emphasis: 'strong', surface: false }, d, t, [4, 2]);
const SCENES = [['scene.demo_evening', 'Evening', 'mdi:weather-sunset', 'orange'], ['scene.demo_movie', 'Movie', 'mdi:movie-open-outline', 'pink'], ['scene.demo_welcome', 'Welcome', 'mdi:home-heart', 'green'],
  ['scene.demo_good_night', 'Good night', 'mdi:weather-night', 'blue']];

/* ================================================================== 2 · LIGHTS */
newPage('lights', 'Lights', 'bulb');
title('l-title', 'Lights', [1, 1, 24, 3], [1, 1, 16, 3]);
// the hero: how many lights are on, over a photo; the scenes as chips beneath it
add('l-hero', 'sensor', { variant: 'value', name: 'lights on', entity: 'sensor.demo_lights_on', icon: 'mdi:lightbulb-on-outline', precision: 0,
  widgetBg: 'image', bgImage: PH('room-living'), bgFit: 'cover', bgPos: 'center', bgOverlay: 55, bgOverlayMode: 'even', textTone: 'light' }, [1, 4, 32, 11], [1, 4, 16, 10], [4, 10]);
SCENES.forEach(([e, n, icon, col], i) => add(`l-sc${i}`, 'action', scene(e, n, icon, { look: 'pill', iconColor: col }), [1 + i * 6, 15, 6, 3], [1 + (i % 2) * 8, 14 + Math.floor(i / 2) * 3, 8, 2], [2, 4]));
add('l-allof', 'action', scene('scene.demo_all_off', 'All off', 'mdi:lightbulb-group-off-outline', { look: 'pill', iconColor: 'purple' }), [25, 15, 8, 3], [1, 20, 8, 2], [2, 4]);
// the rooms: four columns of light cards, each card a lamp over its glow, a switch
const R = (id) => ROOMS.find((r) => r.id === id);
const LCOLS = [[R('living'), R('garden')], [R('kitchen'), R('dining'), R('bathroom')], [R('bedroom')], [R('office'), { id: 'hall', name: 'Hallway', lights: [['hall', 'Hallway']] }]];
const ty = [24, 24];                                   // tablet: two columns of rooms, each with its own next free row
LCOLS.forEach((rooms, ci) => {
  let y = 19;
  const tc = ci % 2;
  rooms.forEach((r) => {
    head(`l-h-${r.id}`, r.name, `${r.lights.length} light${r.lights.length > 1 ? 's' : ''}`, [1 + ci * 8, y, 8, 2], [1 + tc * 8, ty[tc], 8, 2]);
    y += 2; ty[tc] += 2;
    r.lights.forEach(([k, n]) => { add(`l-${k}`, 'light', { variant: 'image', name: n, entity: light(k) }, [1 + ci * 8, y, 8, 6], [1 + tc * 8, ty[tc], 8, 6], [4, 9]); y += 6; ty[tc] += 6; });
  });
});
add('l-active', 'activity', { name: 'Active lights', max: 6, entries: ROOMS.flatMap((r) => r.lights.map(([k]) => ({ entity: light(k), icon: 'mdi:lightbulb-on', color: 'warning' }))) }, [33, 4, 16, 30], [1, Math.max(...ty) + 1, 16, 20], [4, 20]);
radial('l');

/* ================================================================== 3 · CLIMATE */
newPage('climate', 'Climate', 'thermo');
title('c-title', 'Climate', [1, 1, 24, 3], [1, 1, 16, 3]);
add('c-main', 'climate', { variant: 'dial', name: 'Living room', entity: 'climate.demo_living', hvacModes: ['heat', 'off'], image: PH('fire'), imageTreatment: 'dim',
  controls: [{ type: 'dial', design: 'knob', label: 'Temperature' }] }, [1, 4, 16, 24], [1, 4, 16, 22], [4, 22]);
['bedroom', 'office'].forEach((k, i) => add(`c-${k}`, 'climate', { variant: 'compact', name: ROOMS.find((r) => r.id === k).name, entity: `climate.demo_${k}`, hvacModes: ['heat', 'off'] },
  [17, 4 + i * 12, 16, 11], [1, 26 + i * 11, 16, 10], [4, 10]));
add('c-read', 'readings', { name: 'Readings', columns: 2, items: [{ id: 'v1', entity: temp('living'), label: 'Indoor temp', color: 'danger', decimals: 1 },
  { id: 'v2', entity: temp('garden'), label: 'Outdoor temp', color: 'warning', decimals: 1 }, { id: 'v3', entity: hum('living'), label: 'Humidity', color: 'info', decimals: 0 },
  { id: 'v4', entity: hum('bathroom'), label: 'Bathroom humidity', color: 'purple', decimals: 0 }] }, [33, 4, 16, 6], [1, 48, 16, 6], [4, 8]);
add('c-list', 'entitylist', { name: 'Heating & ventilation', rows: [{ id: 'i1', entity: 'climate.demo_living', label: 'Living room' }, { id: 'i2', entity: 'switch.demo_extractor', label: 'Extractor fan' },
  { id: 'i3', entity: 'climate.demo_bedroom', label: 'Bedroom' }, { id: 'i4', entity: 'climate.demo_bathroom', label: 'Bathroom' }, { id: 'i5', entity: 'climate.demo_office', label: 'Office' }] }, [33, 10, 16, 13], [1, 54, 16, 12], [4, 12]);
radial('c');

/* ================================================================== 4 · ROOMS — a photo card per room; each opens its room popup */
newPage('rooms', 'Rooms', 'sofa');
title('r-title', 'Rooms', [1, 1, 24, 3], [1, 1, 16, 3]);
const RCOL = { living: 'purple', kitchen: 'orange', dining: 'green', bedroom: 'purple', bathroom: 'blue', office: 'pink', garden: 'green' };
add('r-house', 'roomtile', { name: 'Whole house', subtitle: 'Energy · Security', icon: 'mdi:home-outline', color: 'purple', image: PH('house-night'), temperature: temp('garden'), lights: 'sensor.demo_lights_on',
  interactions: { tap: { action: 'navigate', page: 'energy' } } }, [1, 4, 12, 11], [1, 4, 8, 10], [2, 9]);
ROOMS.forEach((r, i) => { const k = i + 1; add(`r-${r.id}`, 'roomtile', { name: r.name, subtitle: r.sub, icon: r.icon, color: RCOL[r.id],
  image: PH(`room-${r.id}`), temperature: temp(r.id), humidity: hum(r.id), lights: `sensor.demo_${r.id}_lights_on`, ...POP(`p-room-${r.id}`) },
  [1 + (k % 4) * 12, 4 + Math.floor(k / 4) * 12, 12, 11], [1 + (k % 2) * 8, 4 + Math.floor(k / 2) * 11, 8, 10], [2, 9]); });
radial('r');

/* ================================================================== 5 · ENERGY — grid · solar · water · gas · CO₂ around the house */
newPage('energy', 'Energy', 'bolt');
title('e-title', 'Energy', [1, 1, 24, 3], [1, 1, 16, 3]);
add('e-flow', 'energy', { variant: 'house', name: 'Live flows', subtitle: 'Grid · solar · water · gas · CO₂', entity: 'sensor.demo_house_power', houseImage: PH('house-night'), lineShape: 'elbow', flowStyle: 'arrows', glow: true,
  nodes: [{ id: 'solar', type: 'solar', entity: 'sensor.demo_solar_power' }, { id: 'grid', type: 'grid', entity: 'sensor.demo_grid_power', positive: 'toward' },
    { id: 'co2', type: 'co2', label: 'CO₂ today', entity: 'sensor.demo_co2_today' }, { id: 'gas', type: 'gas', entity: 'sensor.demo_gas_flow' }, { id: 'water', type: 'water', entity: 'sensor.demo_water_flow' }] },
  [1, 4, 48, 19], [1, 4, 16, 14], [4, 12]);
head('e-cc', 'Consumption & costs', 'Today · week · month', [1, 23, 24, 2], [1, 31, 16, 2]);
const ETAB = 'e-hist';
add(ETAB, 'tabs', { title: 'Consumption', tabs: [{ id: 'today', label: 'Today' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }], align: 'start', style: 'bare' }, [1, 25, 48, 19], [1, 33, 16, 24], [4, 30]);
const tab = (id, type, t, config, d, tb, m) => page.items.push({ id, type, parent: ETAB, tab: t, config, layout: L(d, tb, m) });
const BAR = (name, entity, label, unit, color, count, extra = {}) => ({ name, entity, seriesLabel: label, kind: 'bar', source: 'statistics', period: 'day', ...(count ? { count } : {}), stat: 'change', unit, color, legend: 'off', barRadius: 6, barWidth: 60, barOpacity: 60, ...extra });
tab('e-t-el', 'chart', 'today', { name: 'Electricity', entity: 'sensor.demo_house_power', seriesLabel: 'Home', kind: 'area', range: '24h', unit: 'W', color: 'danger', smooth: true, legend: 'on', showAxes: true,
  traces: [{ id: 't1', entity: 'sensor.demo_solar_power', label: 'Solar', color: 'solar' }] }, [1, 1, 18, 9], [1, 1, 16, 8], [4, 9]);
tab('e-t-gas', 'sensor', 'today', { variant: 'value', name: 'Gas today', entity: 'sensor.demo_gas_today', icon: 'mdi:fire', precision: 2 }, [19, 1, 10, 9], [1, 9, 8, 7], [2, 7]);
tab('e-t-water', 'sensor', 'today', { variant: 'value', name: 'Water today', entity: 'sensor.demo_water_today', icon: 'mdi:water', precision: 2 }, [29, 1, 10, 9], [9, 9, 8, 7], [2, 7]);
tab('e-t-sum', 'entitylist', 'today', { name: 'Today', rows: [{ id: 'i1', entity: 'sensor.demo_self_sufficiency_today', label: 'Self-sufficiency' }, { id: 'i2', entity: 'sensor.demo_self_consumption_today', label: 'Solar used at home' },
  { id: 'i3', entity: 'sensor.demo_energy_cost_today', label: 'Electricity cost' }, { id: 'i4', entity: 'sensor.demo_gas_cost_today', label: 'Gas cost' }] }, [39, 1, 10, 9], [1, 16, 16, 8], [4, 9]);
tab('e-w-el', 'chart', 'week', { ...BAR('Electricity · 7 days', 'sensor.demo_house_energy_today', 'Consumed', 'kWh', 'danger', 7, { colorTo: '#7a1f3a' }) }, [1, 1, 16, 9], [1, 1, 16, 8], [4, 9]);
tab('e-w-gas', 'chart', 'week', BAR('Gas · 7 days', 'sensor.demo_gas_today', 'Gas', 'm³', 'warning', 7, { colorTo: '#7a3a10' }), [17, 1, 16, 9], [1, 9, 16, 8], [4, 9]);
tab('e-w-water', 'chart', 'week', BAR('Water · 7 days', 'sensor.demo_water_today', 'Water', 'm³', 'info', 7, { colorTo: '#10405e' }), [33, 1, 16, 9], [1, 17, 16, 7], [4, 9]);
tab('e-m-el', 'chart', 'month', BAR('Electricity · 30 days', 'sensor.demo_house_energy_today', 'Consumed', 'kWh', 'danger', 0, { colorTo: '#7a1f3a', barRadius: 3 }), [1, 1, 30, 9], [1, 1, 16, 8], [4, 9]);
tab('e-m-co2', 'chart', 'month', BAR('CO₂ · 30 days (estimate)', 'sensor.demo_co2_today', 'CO₂', 'kg', 'success', 0, { colorTo: '#145a32', barRadius: 3 }), [31, 1, 18, 9], [1, 9, 16, 8], [4, 9]);
add('e-note', 'text', { variant: 'text', primary: 'About CO₂', secondary: 'CO₂ estimate: grid 0.18 kg/kWh · gas 2.0 kg/m³ · solar 0. No savings are claimed.', align: 'left', size: 13, emphasis: 'muted', surface: false }, [1, 44, 48, 2], [1, 57, 16, 2], [4, 3]);
radial('e');

/* ================================================================== 6 · SECURITY */
newPage('security', 'Security', 'shield');
title('s-title', 'Security', [1, 1, 24, 3], [1, 1, 16, 3]);
add('s-alarm', 'alarm', { variant: 'compact', name: 'Home', entity: 'alarm_control_panel.demo_alarm', modes: ['arm_home', 'arm_away'], confirmDisarm: false,
  widgetBg: 'gradient', bgFrom: '#173a29', bgTo: '#1c1d24', bgAngle: 135, borderWidth: 1, borderColor: '#2f7d55', borderStyle: 'solid' }, [1, 4, 18, 8], [1, 4, 16, 8], [4, 9]);
add('s-sum', 'entitylist', { name: 'Sensors', rows: [{ id: 'i1', entity: 'sensor.demo_open_contacts', label: 'Open doors & windows' }, { id: 'i2', entity: 'binary_sensor.demo_hall_motion', label: 'Hallway motion' },
  { id: 'i3', entity: 'binary_sensor.demo_garden_motion', label: 'Garden motion' }, { id: 'i4', entity: 'binary_sensor.demo_bathroom_leak', label: 'Bathroom leak' }] }, [19, 4, 12, 8], [1, 12, 16, 8], [4, 9]);
const tile = (id, name, entity, icon, color, d, t) => add(id, 'sensor', { variant: 'status', name, entity, icon, widgetBg: 'gradient', bgFrom: color[0], bgTo: '#1c1d24', bgAngle: 160, borderWidth: 1, borderColor: color[1], borderStyle: 'solid' }, d, t, [2, 6]);
tile('s-doors', 'Doors', 'binary_sensor.demo_front_door', 'mdi:door', ['#132438', '#2a5f93'], [31, 4, 6, 8], [1, 20, 6, 7]);
tile('s-motion', 'Motion', 'binary_sensor.demo_living_motion', 'mdi:walk', ['#3a2412', '#9a5a1e'], [37, 4, 6, 8], [7, 20, 5, 7]);
tile('s-water', 'Water', 'binary_sensor.demo_kitchen_leak', 'mdi:water-outline', ['#16301f', '#2f7d55'], [43, 4, 6, 8], [12, 20, 5, 7]);
head('s-cam-h', 'Live cameras', 'Demo cameras — photo stills, not live video', [1, 12, 32, 2], [1, 27, 16, 2]);
add('s-cam0', 'camera', { variant: 'picture', name: 'Garden', image: PH('cam-garden'), state: 'idle', fit: 'cover', refresh: 10, showName: true }, [1, 14, 16, 11], [1, 29, 8, 9], [4, 8]);
add('s-cam1', 'camera', { variant: 'picture', name: 'Living room', image: PH('cam-living'), state: 'idle', fit: 'cover', refresh: 10, showName: true }, [17, 14, 16, 11], [9, 29, 8, 9], [4, 8]);
add('s-log', 'activitylog', { name: 'Activity', max: 6, link: { label: 'Notifications', popup: 'p-notify' }, entries: ['front_door', 'back_door', 'living_motion', 'hall_motion', 'garden_motion', 'bedroom_window', 'kitchen_leak']
  .map((k, i) => ({ id: `e${i + 1}`, entity: `binary_sensor.demo_${k}` })).concat([{ id: 'e9', entity: 'lock.demo_front_door' }, { id: 'e10', entity: 'alarm_control_panel.demo_alarm' }]) }, [33, 12, 16, 18], [1, 38, 16, 18], [4, 18]);
head('s-demo-h', 'Demo events', 'Simulated only', [1, 25, 32, 2], [1, 56, 16, 2]);
[['button.demo_simulate_motion', 'Simulate motion', 'mdi:motion-sensor', 'orange'], ['button.demo_simulate_door', 'Open back door', 'mdi:door-open', 'pink'], ['button.demo_clear_events', 'Clear events', 'mdi:broom', 'green'],
  ['button.demo_reset', 'Reset demo', 'mdi:restore', 'blue']].forEach(([e, n, icon, col], i) => add(`s-ev${i}`, 'action', { name: n, icon, run: 'ha', entity: e, look: 'pill', iconColor: col, ...(i === 3 ? { requiresConfirmation: true } : {}) },
  [1 + (i % 2) * 16, 27 + Math.floor(i / 2) * 3, 16, 2], [1 + (i % 2) * 8, 58 + Math.floor(i / 2) * 3, 8, 2], [2, 4]));
radial('s');
/* ================================================================== POPUPS (filled in below the pages) */
const fr = (x, y, w, h) => ({ x, y, w, h });
function popItem(pp, id, type, config, desk, mob) { pp.items.push({ id, type, parent: null, config, frame: { desktop: desk, tablet: { ...desk, w: Math.min(desk.w, 708 - desk.x) } }, layout: { mobile: { w: mob[0], h: mob[1] } } }); }
const popCfg = (title, subtitle, icon, w, h) => ({ title, subtitle, icon, heroShow: false, size: 'custom', custom: { desktop: { w, h }, tablet: { w: Math.min(w, 740), h } }, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal' });
{
  const pp = newPopup('p-scenes', 'Scenes', popCfg('Scenes', 'One press, the whole house', 'mdi:palette-outline', 760, 320));
  [['scene.demo_evening', 'Evening', 'mdi:weather-sunset'], ['scene.demo_movie', 'Movie', 'mdi:movie-open-outline'], ['scene.demo_good_night', 'Good night', 'mdi:weather-night'],
    ['scene.demo_all_off', 'All lights off', 'mdi:lightbulb-group-off-outline'], ['scene.demo_away', 'Away', 'mdi:home-export-outline'], ['scene.demo_welcome', 'Welcome home', 'mdi:home-heart']]
    .forEach(([e, n, icon], i) => popItem(pp, `ps-${i}`, 'action', scene(e, n, icon), fr(24 + (i % 3) * 228, 20 + Math.floor(i / 3) * 128, 212, 112), [2, 6]));
}
{
  const pp = newPopup('p-notify', 'Notifications', popCfg('Notifications', 'Simulated events of the demo home', 'mdi:bell-outline', 560, 600));
  popItem(pp, 'pn-list', 'inbox', { variant: 'list', name: 'Notifications', max: 8, seed: SEED, resetOn: 'button.demo_reset' }, fr(24, 12, 512, 500), [4, 18]);
}
{
  const pp = newPopup('p-calendar', 'Calendar', popCfg('Household calendar', 'Waste collection, birthdays and reminders', 'mdi:calendar-month-outline', 560, 480));
  popItem(pp, 'pc-cal', 'calendar', { name: 'Household', entity: 'calendar.demo_household' }, fr(24, 12, 512, 380), [4, 14]);
}
{
  const pp = newPopup('p-media', 'Media', popCfg('Media', 'Living room and kitchen speakers', 'mdi:music', 760, 420));
  popItem(pp, 'pm-0', 'media', { variant: 'artwork', name: 'Living room', entity: 'media_player.demo_living' }, fr(24, 20, 400, 320), [4, 12]);
  popItem(pp, 'pm-1', 'media', { variant: 'compact', name: 'Kitchen', entity: 'media_player.demo_kitchen' }, fr(440, 20, 296, 160), [4, 6]);
}
{
  const pp = newPopup('p-climate', 'Climate', popCfg('Climate', 'Every room · set the temperature', 'mdi:thermostat', 800, 600));
  popItem(pp, 'pc-main', 'climate', { variant: 'dial', name: 'Living room', entity: 'climate.demo_living', hvacModes: ['heat', 'off'] }, fr(24, 20, 340, 480), [4, 18]);
  ['bedroom', 'bathroom', 'office'].forEach((k, i) => popItem(pp, `pc-${k}`, 'climate', { variant: 'compact', name: ROOMS.find((r) => r.id === k).name, entity: `climate.demo_${k}`, hvacModes: ['heat', 'off'] }, fr(384, 20 + i * 160, 352, 148), [4, 6]));
}

/* EACH ROOM: its photo as the header (name, what it has, Back and Close), its humidity · temperature · lights over the photo, then six tabs of
   ordinary widgets — Active · Lights · Heating · Media · Security · Sensors (a tab with nothing to show says so). The tabs sit on the popup's
   own grid: a container 848 px wide has 9 columns (MaisonFree.colsFor), a tablet's 708 px 8, a phone 4. */
const TL = (x, y, w, h, mh = h) => { const a = Math.round((x - 1) * 8 / 9), z = Math.round((x - 1 + w) * 8 / 9);
  return { desktop: { x, y, w, h }, tablet: { x: a + 1, y, w: Math.max(1, z - a), h }, mobile: { w: 4, h: mh } }; };
const empty = (t, sub) => ({ variant: 'text', primary: t, secondary: sub, align: 'center', size: 18, emphasis: 'muted', surface: true });
const ATTN = { front_door: ['mdi:door-open', 'danger'], back_door: ['mdi:door-open', 'danger'], living_window: ['mdi:window-open-variant', 'warning'], bedroom_window: ['mdi:window-open-variant', 'warning'],
  office_window: ['mdi:window-open-variant', 'warning'], garden_motion: ['mdi:walk', 'warning'], living_motion: ['mdi:walk', 'warning'], bathroom_leak: ['mdi:water-alert-outline', 'danger'], kitchen_leak: ['mdi:water-alert-outline', 'danger'] };
// ROOM POPUPS: the SHARED design rules (components/editor/design-presets.js — IniqDesign.roomPopup), the same ones the dashboard
// generator uses for a real home: compact header, only the tabs a room fills, compact cards on the popup's fine rows. The demo only
// says what each room has. (The house alarm lives on the Security page — it is not repeated in every room.)
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'components/editor/design-presets.js'), 'utf8'));
const DC = { door: 'door', window: 'window', motion: 'motion', leak: 'moisture' };
ROOMS.forEach((r) => {
  const ents = [
    ...r.lights.map(([k, n]) => ({ id: light(k), domain: 'light', name: n, tab: 'lights' })),
    ...(r.climate ? [{ id: r.climate, domain: 'climate', name: r.name, tab: 'heating' }] : []),
    ...(r.media ? [{ id: r.media, domain: 'media_player', name: r.name, tab: 'media' }] : []),
    ...(r.lock ? [{ id: r.lock, domain: 'lock', name: 'Back door lock', tab: 'security' }] : []),
    ...[r.door, r.window, r.motion, r.leak].filter(Boolean).map((e) => { const key = Object.keys(DC).find((k) => e.includes(k)) || 'door';
      return { id: e, domain: 'binary_sensor', dc: DC[key], name: e.split('.')[1].replace(/^demo_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), tab: 'security' }; }),
    { id: temp(r.id), domain: 'sensor', dc: 'temperature', name: 'Temperature', tab: 'sensors' }, { id: hum(r.id), domain: 'sensor', dc: 'humidity', name: 'Humidity', tab: 'sensors' },
    ...r.more.map(([e, n]) => ({ id: e, domain: 'sensor', dc: /illum/.test(e) ? 'illuminance' : /power/.test(e) ? 'power' : /energy/.test(e) ? 'energy' : null, name: n, tab: 'sensors' })),
  ];
  const pp = globalThis.IniqDesign.roomPopup({ id: `p-room-${r.id}`, name: r.name, icon: r.icon, photo: PH(`room-${r.id}`), subtitle: r.sub, temp: temp(r.id), hum: hum(r.id),
    lightsOn: `sensor.demo_${r.id}_lights_on`, entities: ents });
  popups.push({ id: pp.id, name: pp.name, config: pp.config, items: pp.items });
});

/* ================================================================== NOTIFICATIONS */
const tpl = (id, name, title, message, icon, tone, category, extra = {}) => ({ id, name, config: { title, message, icon, tone, category, position: 'top-right', duration: 6, closeButton: true, style: 'card', ...extra } });
const EVENTS = [['washer_done', 'Washing machine finished', 'The 40° cycle is done — time to hang the laundry.', 'mdi:washing-machine', 'success', 'Appliances'],
  ['dishwasher_done', 'Dishwasher finished', 'The eco cycle is done.', 'mdi:dishwasher', 'success', 'Appliances'],
  ['solar_peak', 'Solar is running strong', 'A good moment for the dishwasher.', 'mdi:solar-power-variant', 'success', 'Energy'],
  ['evening_lights', 'Evening lighting', 'The hallway lights follow the evening schedule.', 'mdi:weather-sunset', 'info', 'Lighting'],
  ['garden_motion', 'Motion in the garden', 'The garden camera saw movement near the shed.', 'mdi:motion-sensor', 'warning', 'Security'],
  ['parcel', 'A parcel was delivered', 'Left at the front door.', 'mdi:package-variant-closed', 'info', 'Home'],
  ['high_use', 'High energy use', 'The oven and the kettle draw 3.4 kW together.', 'mdi:flash-alert-outline', 'warning', 'Energy'],
  ['window_reminder', 'Office window is open', 'It is 11 °C outside — close it when you leave.', 'mdi:window-open-variant', 'warning', 'Climate'],
  ['birthday', "It's Léa's birthday", 'Dinner at 19:00 — the cake is in the fridge.', 'mdi:cake-variant', 'success', 'Family']];
const notifications = {
  templates: [
    tpl('t-motion', 'Motion in the garden', 'Motion in the garden', 'Demo event · the garden motion sensor saw movement.', 'mdi:motion-sensor', 'warning', 'Security'),
    tpl('t-door', 'Back door opened', 'Back door opened', 'Demo event · the back door contact reports open.', 'mdi:door-open', 'warning', 'Security'),
    tpl('t-alarm', 'Alarm triggered', 'Alarm triggered', 'Demo event · a door opened while the alarm was armed. Disarm to acknowledge.', 'mdi:alarm-light-outline', 'danger', 'Security', { persistent: true, position: 'top-center' }),
    tpl('t-armed', 'Alarm armed', 'Alarm armed', 'The simulated alarm is armed.', 'mdi:shield-lock-outline', 'info', 'Security'),
    tpl('t-disarmed', 'Alarm disarmed', 'Alarm disarmed', 'The simulated alarm is off.', 'mdi:shield-off-outline', 'success', 'Security'),
    ...EVENTS.map(([k, title, msg, icon, tone, cat]) => tpl(`t-ev-${k}`, `Demo event · ${title}`, title, `Simulated · ${msg}`, icon, tone, cat)),
  ],
  rules: [
    { id: 'r-motion', name: 'Garden motion', event: 'ha.binary_sensor.demo_garden_motion.on', template: 't-motion', enabled: true },
    { id: 'r-door', name: 'Back door', event: 'ha.binary_sensor.demo_back_door.on', template: 't-door', enabled: true },
    { id: 'r-alarm', name: 'Alarm triggered', event: 'ha.alarm_control_panel.demo_alarm.triggered', template: 't-alarm', enabled: true },
    { id: 'r-away', name: 'Armed away', event: 'ha.alarm_control_panel.demo_alarm.armed_away', template: 't-armed', enabled: true },
    { id: 'r-home', name: 'Armed home', event: 'ha.alarm_control_panel.demo_alarm.armed_home', template: 't-armed', enabled: true },
    { id: 'r-disarm', name: 'Disarmed', event: 'ha.alarm_control_panel.demo_alarm.disarmed', template: 't-disarmed', enabled: true },
    ...EVENTS.map(([k, title]) => ({ id: `r-ev-${k}`, name: `Demo event · ${title}`, event: `ha.sensor.demo_event.${k}`, template: `t-ev-${k}`, enabled: true })),
  ],
};

/* ================================================================== the dashboard */
const dashboard = {
  version: 3,
  app: {
    id: 'iniqdash-demo', startPage: 'home', simulated: true, grid: GRID,
    navigation: { desktop: 'left', tablet: 'bottom', mobile: 'bottom' },
    theme: { id: 'iniqdash-charcoal', name: 'INIQDASH Charcoal', dark: true,
      tokens: { 'page-bg': '#20232c', 'page-bg-darker': '#171a21', 'page-bg-lighter': '#262933', 'nav-bg': '#1c1f27', 'nav-inactive': '#8a8f9c', 'nav-active': '#57c8ff',
        'nav-active-bg': 'rgba(87, 200, 255, 0.10)', 'nav-indicator': '#57c8ff', 'surface-primary': '#1c1d24', 'surface-primary-top': '#202128', 'surface-secondary': '#1a1b22',
        'surface-tertiary': '#272a34', 'surface-interactive': '#2e313b', 'control-well': '#15161c', 'card-border': 'rgba(255, 255, 255, 0.04)', 'border-primary': 'rgba(255, 255, 255, 0.06)',
        'edge-highlight': 'rgba(255, 255, 255, 0.03)', 'text-heading': '#ffffff', 'text-primary': '#f2f3f5', 'text-secondary': '#a3a6b0', 'text-muted': '#7d808b', accent: '#57c8ff', 'accent-hot': '#3fb6ff',
        'accent-soft': 'rgba(87, 200, 255, 0.14)', 'accent-line': 'rgba(87, 200, 255, 0.45)', 'accent-on': '#04121c', 'slider-fill': '#ffa550', 'control-off-bg': '#2a2c34',
        solar: '#ffcb42', success: '#3ddc84', warning: '#fc8427', danger: '#ff5d6c', info: '#3fb6ff', 'light-warm': '#ffcb42', 'light-hot': '#ffa550' },
      look: { radius: 24, shadow: 'soft', shadowStrength: 50, glass: false, borderWidth: 0, titleWeight: 700, font: 'poppins', navStyle: 'icons', pageFrame: 'panel', pagePad: 18, pageRadius: 28, titleSize: 30, headGap: 20 } },
  },
  pages,
  popups,
  notifications,
};

// the demo's containers are authored in the containers' classic 40px rows; the model's own migration converts them to the page grid's
// rows (app.grid.nested = 'page' — the same conversion an older saved dashboard gets when it is opened)
{ const ctx = { window: {} }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'components/editor/model.js'), 'utf8'), ctx);
  ctx.src = JSON.stringify(dashboard);                       // parsed INSIDE the context (the model only accepts its own plain objects)
  // the pages are laid out on a 48-column desktop grid (fine positioning while designing); the shipped dashboard uses 24 columns
  // (a column wider than its gutter — easier to align in the editor): the same conversion the grid settings apply ("keep sizes")
  ctx.shipGrid = JSON.stringify(SHIP_GRID);
  vm.runInContext('out = (() => { const d = JSON.parse(src); window.MaisonModel.normalizeNested(d); const to = { ...JSON.parse(shipGrid), nested: "page" }; window.MaisonModel.rescale(d, d.app.grid, to); d.app.grid = { ...to, popups: "page" }; return JSON.stringify(d); })()', ctx);
  Object.assign(dashboard, JSON.parse(ctx.out)); }
fs.mkdirSync(path.join(ROOT, 'assets/demo'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'assets/demo/iniqdash-demo.json'), JSON.stringify(dashboard, null, 1) + '\n');
console.log(`iniqdash-demo: ${pages.length} pages, ${pages.reduce((n, p) => n + p.items.length, 0)} items, ${popups.length} popups`);
