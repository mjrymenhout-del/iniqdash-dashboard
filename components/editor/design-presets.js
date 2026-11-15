/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* IniqDesign — THE INIQDASH DESIGN RULES in one place, used by the dashboard GENERATOR (components/editor/generate-demo.js) and by the
   official DEMO builder (tools/build-iniqdash-demo.mjs). Both describe WHAT a room has (its lights, thermostats, readings…); this module
   decides HOW it looks: which standard widget, which variant, how big, where. Connecting a real Home Assistant therefore changes the
   data, never the design — and an improvement here reaches the demo and every generated dashboard alike.

   Everything made here is a normal dashboard model (standard widgets, a Tabbed Container in a popup): fully editable afterwards.

   ROOM POPUP (roomPopup): a compact header (a 180 px picture with the room's temperature in the middle and its humidity beside it),
   small tabs — Active · Lights · Heating · Media · Security · Sensors — only those that hold something, and compact content on the
   popup's fine rows (app.grid.popups = 'page': 10 px rows + 18 px gaps on a desktop, 22 px pitch on a phone), so a compact row is
   ≈ 66 px and a tile ≈ 94–122 px instead of the old 92 / 144 px steps. The popup is as tall as its fullest tab.
*/
(function (global) {
  'use strict';

  const clean = (v, n) => { const t = String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
  const fr = (x, y, w, h) => ({ x, y, w, h });
  /** rows → px on the fine grid (desktop pitch 28, gap 18) and back */
  const PITCH = { desktop: 28, tablet: 26, mobile: 22 }, GAP = { desktop: 18, tablet: 16, mobile: 12 };
  const px = (rows, bp = 'desktop') => rows * PITCH[bp] - GAP[bp];
  /** a popup's content sits on a FREE surface: a tabbed container there gets as many columns as its frame is wide (MaisonFree.colsFor:
      ≈ 96 px a column) — the room popup is designed on exactly those columns: 900 px popup → 868 px frame → 9 columns (three cards a
      row, no remainder); tablet 740 → 708 → 8 */
  const POP = { desktop: { w: 900, frame: 868, cols: 9 }, tablet: { w: 740, frame: 708, cols: 8 } };

  /** where a widget goes in a tab: desktop 12 columns · tablet 8 · phone 4; `per` cards per row on a desktop (tablet: half as many,
      at least 1 — phone: 2 small tiles or 1 wide card); every breakpoint stacks in the same order */
  function flowLayout(n, opt) {
    const { per, h, hm = h, phonePer = 1, y0 = 1 } = opt, C = POP.desktop.cols, CT = POP.tablet.cols;
    const out = [];
    const tPer = Math.max(1, Math.min(per, 2)), wD = Math.floor(C / per), wT = Math.floor(CT / tPer), wM = phonePer === 2 ? 2 : 4;
    for (let i = 0; i < n; i++) {
      out.push({ desktop: { x: 1 + (i % per) * wD, y: y0 + Math.floor(i / per) * h, w: i % per === per - 1 ? C - (per - 1) * wD : wD, h },
        tablet: { x: 1 + (i % tPer) * wT, y: y0 + Math.floor(i / tPer) * h, w: wT, h }, mobile: { w: wM, h: hm } });
    }
    return { items: out, rows: Math.ceil(n / per) * h, rowsT: Math.ceil(n / tPer) * h };
  }
  const FULL = (y, h, yT = y, hm = h + 2) => ({ desktop: { x: 1, y, w: POP.desktop.cols, h }, tablet: { x: 1, y: yT, w: POP.tablet.cols, h }, mobile: { w: 4, h: hm } });

  const SENSOR_ICON = { temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', illuminance: 'mdi:brightness-6', power: 'mdi:flash-outline', energy: 'mdi:lightning-bolt', battery: 'mdi:battery-20',
    pressure: 'mdi:gauge', carbon_dioxide: 'mdi:molecule-co2', co2: 'mdi:molecule-co2', pm25: 'mdi:blur', pm10: 'mdi:blur', volatile_organic_compounds: 'mdi:air-filter', moisture: 'mdi:water', aqi: 'mdi:air-filter' };
  const STATUS_ICON = { door: 'mdi:door', garage_door: 'mdi:garage', window: 'mdi:window-closed-variant', opening: 'mdi:door', motion: 'mdi:walk', occupancy: 'mdi:account', presence: 'mdi:account',
    moisture: 'mdi:water-alert-outline', smoke: 'mdi:smoke-detector', gas: 'mdi:gas-cylinder', carbon_monoxide: 'mdi:molecule-co', safety: 'mdi:alert', vibration: 'mdi:vibrate', lock: 'mdi:lock' };
  const TAB_LABEL = { active: 'Active', lights: 'Lights', heating: 'Heating', media: 'Media', security: 'Security', sensors: 'Sensors' };
  const ORDER = ['active', 'lights', 'heating', 'media', 'security', 'sensors'];
  const ACTIVE = ['light', 'switch', 'input_boolean', 'fan', 'media_player', 'climate', 'cover', 'vacuum', 'lawn_mower', 'humidifier', 'water_heater', 'valve'];

  /**
   * roomPopup(spec) → popup definition { id, name, config, items }
   *   spec: { id, name, icon, photo?, subtitle?, temp?, hum?, lightsOn?, entities: [{ id, domain, name, dc?, state? , tab }] }
   *     tab: 'lights' | 'heating' | 'media' | 'security' | 'sensors' | 'devices' (switches, covers… — shown under Active)
   *   Returns also .tabs (the tabs made) and .devices (how many controls it holds) for the caller's summary.
   */
  function roomPopup(spec) {
    const pid = spec.id, T = `${pid}-tabs`, rn = clean(spec.name, 60), lower = rn.toLowerCase();
    const of = (tab) => spec.entities.filter((e) => e.tab === tab);
    const items = [];
    let k = 0;
    const put = (type, tab, config, layout) => items.push({ id: `${pid}-${k++}`.slice(0, 64), type, parent: T, tab, config, layout });
    const heroInfo = [spec.hum && { id: 'h1', entity: spec.hum, value: 'state', label: 'Humidity', icon: 'mdi:water-outline', color: 'info', slot: 'left', style: 'card' },
      spec.temp && { id: 'h2', entity: spec.temp, value: 'state', label: 'Room temperature', slot: 'center', style: 'emphasis', valueSize: 'l' },
      spec.lightsOn && { id: 'h3', entity: spec.lightsOn, value: 'state', label: 'Lights on', icon: 'mdi:lightbulb-on-outline', color: 'warning', slot: 'right', style: 'card' }].filter(Boolean);
    const rows = {};                      // tab → desktop rows used
    const rowsT = {}, rowsM = {};         // tablet rows, phone rows (stacked)
    const note = (tab, d, t, m) => { rows[tab] = Math.max(rows[tab] || 0, d); rowsT[tab] = Math.max(rowsT[tab] || 0, t); rowsM[tab] = (rowsM[tab] || 0) + m; };

    // ACTIVE — a compact overview: what is ON now (one compact row each, at most four shown), then the room's other switchable
    // devices as a compact list. Only when the room has more than lights (a room of lights alone: the Lights tab says what is on).
    const all = spec.entities;
    const beyondLights = all.some((e) => ACTIVE.includes(e.domain) && e.domain !== 'light');
    const act = beyondLights ? all.filter((e) => ACTIVE.includes(e.domain)).slice(0, 12) : [];
    // desktop: the two side by side (as compact rows), tablet / phone: one under the other
    const devs = of('devices').slice(0, 10);
    const both = act.length && devs.length;
    let yT = 1;
    if (act.length) {
      const h = act.length > 2 ? 8 : 6;      // a heading + two (or three) compact rows; the list scrolls beyond
      put('activity', 'active', { name: 'Active now', show: 'active', emptyText: clean(`Nothing is on in the ${lower}`, 120), max: 4,
        entries: act.map((e) => ({ entity: e.id, icon: e.domain === 'light' ? 'mdi:lightbulb-on' : e.domain === 'media_player' ? 'mdi:music' : e.domain === 'climate' ? 'mdi:fire' : 'mdi:power', color: e.domain === 'media_player' ? 'accent' : 'warning' })) },
        { desktop: { x: 1, y: 1, w: both ? 4 : POP.desktop.cols, h }, tablet: { x: 1, y: 1, w: POP.tablet.cols, h }, mobile: { w: 4, h: h + 2 } });
      note('active', h, h, h + 2); yT += h;
    }
    if (devs.length) {
      const h = 2 + Math.ceil(devs.length * 1.9);
      put('entitylist', 'active', { name: 'Devices', rows: devs.map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) },
        { desktop: { x: both ? 5 : 1, y: 1, w: both ? POP.desktop.cols - 4 : POP.desktop.cols, h }, tablet: { x: 1, y: yT, w: POP.tablet.cols, h }, mobile: { w: 4, h: h + 2 } });
      note('active', h, yT - 1 + h, h + 2);
    }

    // LIGHTS — compact light cards (name, state, brightness when it dims, the switch): three a row on a desktop, two on a phone
    const ls = of('lights');
    if (ls.length) {
      const shown = ls.slice(0, 12), f = flowLayout(shown.length, { per: 3, h: 4, hm: 4 });   // phone: one a row (whole names)
      shown.forEach((e, i) => put('light', 'lights', { variant: 'compact', name: clean(e.name, 60), entity: e.id }, f.items[i]));
      note('lights', f.rows, f.rowsT, shown.length * 4);
      if (ls.length > 12) {
        const h = 2 + Math.ceil(Math.min(10, ls.length - 12) * 1.9);
        put('entitylist', 'lights', { name: 'More lights', rows: ls.slice(12, 32).map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) },
          FULL(f.rows + 1, h, f.rowsT + 1));
        note('lights', f.rows + h, f.rowsT + h, h + 2);
      }
    }

    // HEATING — each thermostat as a COMPACT climate card (current, target, ± and its mode — no giant dial in a room), two a row;
    // fans, humidifiers, water heaters in a compact list under them
    const heat = of('heating'), cl = heat.filter((e) => e.domain === 'climate' || e.domain === 'water_heater');
    if (cl.length) {
      const shown = cl.slice(0, 3), f = flowLayout(shown.length, { per: 3, h: 7, hm: 8 });
      shown.forEach((e, i) => put('climate', 'heating', { variant: 'compact', name: clean(e.name, 60), entity: e.id }, f.items[i]));
      note('heating', f.rows, f.rowsT, shown.length * 8);
    }
    const rest = heat.filter((e) => !cl.includes(e)).slice(0, 8);
    if (rest.length) {
      const y0 = (rows.heating || 0) + 1, yT = (rowsT.heating || 0) + 1, h = 2 + Math.ceil(rest.length * 1.9);
      put('entitylist', 'heating', { name: 'Ventilation & humidity', rows: rest.map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) },
        FULL(y0, h, yT));
      note('heating', y0 - 1 + h, yT - 1 + h, h + 2);
    }

    // MEDIA — compact players (artwork, title, transport); no large blank artwork while idle
    const md = of('media').slice(0, 3);
    if (md.length) {
      const f = flowLayout(md.length, { per: 1, h: 3, hm: 4 });
      md.forEach((e, i) => put('media', 'media', { variant: 'minibar', name: clean(e.name, 60), entity: e.id }, f.items[i]));
      note('media', f.rows, f.rowsT, md.length * 4);
    }

    // SECURITY — the room's own alarm panel (only where it is assigned), its locks, then contacts / motion / leaks as compact status tiles
    const sec = of('security');
    let sy = 1, syT = 1;
    const al = sec.find((e) => e.domain === 'alarm_control_panel');
    if (al) { put('alarm', 'security', { variant: 'compact', name: clean(al.name, 60), entity: al.id, modes: ['arm_home', 'arm_away'], confirmDisarm: true }, FULL(1, 6, 1, 8)); sy = syT = 7; note('security', 6, 6, 8); }
    const tiles = sec.filter((e) => e.domain === 'binary_sensor' || e.domain === 'lock').slice(0, 9);
    if (tiles.length) {
      const f = flowLayout(tiles.length, { per: 3, h: 4, hm: 5, phonePer: 2, y0: sy });
      tiles.forEach((e, i) => (e.domain === 'lock'
        ? put('lock', 'security', { name: clean(e.name, 60), entity: e.id, confirmUnlock: true }, f.items[i])
        : put('sensor', 'security', { variant: 'standard', name: clean(e.name, 60), entity: e.id, icon: STATUS_ICON[e.dc] || 'mdi:shield-outline' }, f.items[i])));
      note('security', sy - 1 + f.rows, syT - 1 + f.rowsT, Math.ceil(tiles.length / 2) * 5);
    }
    const cam = sec.find((e) => e.domain === 'camera');
    if (cam) {
      const y0 = (rows.security || 0) + 1, yT = (rowsT.security || 0) + 1;
      put('camera', 'security', { variant: 'picture', name: clean(cam.name, 60), entity: cam.id, fit: 'cover', refresh: 10, showName: true }, FULL(y0, 9, yT, 10));
      note('security', y0 + 8, yT + 8, 10);
    }

    // SENSORS — the room's meaningful readings as a compact grid of value tiles (temperature, humidity, light, air, power…)
    const sn = of('sensors').slice(0, 9);
    if (sn.length) {
      const f = flowLayout(sn.length, { per: 3, h: 4, hm: 5, phonePer: 2 });
      sn.forEach((e, i) => put('sensor', 'sensors', { variant: 'standard', name: clean(e.name, 60), entity: e.id,
        icon: (e.domain === 'binary_sensor' ? STATUS_ICON[e.dc] : SENSOR_ICON[e.dc]) || (e.domain === 'binary_sensor' ? 'mdi:checkbox-blank-circle-outline' : 'mdi:gauge') }, f.items[i]));
      note('sensors', f.rows, f.rowsT, Math.ceil(sn.length / 2) * 5);
    }

    const used = new Set(items.map((x) => x.tab));
    let tabs = ORDER.filter((t) => used.has(t)).map((t) => ({ id: t, label: TAB_LABEL[t] }));
    if (!tabs.length) {
      tabs = [{ id: 'active', label: 'Overview' }];
      put('text', 'active', { variant: 'text', primary: clean(`Nothing in the ${lower} yet`, 80), secondary: 'Add widgets to this room in Edit.', align: 'center', size: 18, emphasis: 'muted', surface: true },
        FULL(1, 4, 1, 5));
      note('active', 4, 4, 5);
    }
    // the popup as tall as its FULLEST tab: header (≈ 180 px picture, the tab bar) + that tab's rows; the body scrolls on short screens
    const maxD = Math.max(...tabs.map((t) => rows[t.id] || 0)), maxT = Math.max(...tabs.map((t) => rowsT[t.id] || 0)), maxM = Math.max(...tabs.map((t) => rowsM[t.id] || 0));
    const contentD = px(maxD) + 56, contentT = px(maxT, 'tablet') + 56;          // + the tab bar
    const head = heroInfo.length ? 270 : 170;                                  // title + header facts + tab bar (measured in the viewer)
    const hD = Math.min(1100, Math.max(340, head + contentD)), hT = Math.min(1100, Math.max(340, head + contentT));
    items.unshift({ id: T, type: 'tabs', parent: null, config: { title: `${rn} tabs`, tabs, align: 'center', style: 'bare', tabHeight: 34, textSize: 13, padX: 14, tabGap: 6, nav: { mode: 'both' } },
      layout: { desktop: { x: 1, y: 1, w: POP.desktop.cols, h: 13 }, tablet: { x: 1, y: 1, w: POP.tablet.cols, h: 13 }, mobile: { w: 4, h: Math.max(8, Math.min(40, 2 + Math.ceil(maxM * 22 / 52))) } },
      frame: { desktop: fr(0, 0, POP.desktop.frame, contentD), tablet: fr(0, 0, POP.tablet.frame, contentT) } });
    const config = { title: rn, subtitle: spec.subtitle || '', icon: spec.icon, heroShow: true, size: 'custom', custom: { desktop: { w: POP.desktop.w, h: hD }, tablet: { w: POP.tablet.w, h: hT } },
      closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal',
      ...(spec.photo ? { image: spec.photo } : {}), hero: 'small', overlay: 'medium', titleSize: 'large', backButton: true, ...(heroInfo.length ? { heroInfo } : {}) };
    return { id: pid, name: rn, config, items, tabs: tabs.map((t) => t.id), devices: devs.length + ls.length + heat.length + md.length + sec.length };
  }

  global.IniqDesign = Object.freeze({ roomPopup, flowLayout, px, POP, SENSOR_ICON, STATUS_ICON, ORDER });
})(typeof window !== 'undefined' ? window : globalThis);
