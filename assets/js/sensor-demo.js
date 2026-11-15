/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Sensor showroom. Demo data only — status text and tone are part of the data, as they will be
   when Home Assistant (or configuration) supplies them. */
(function () {
  'use strict';
  const G = window.MaisonGrid, Sn = window.MaisonSensor, ICON = window.DEMO_ICON;
  const sensor = (cfg) => Sn.create(cfg);
  const item = (id, cfg, layout, wide) => ({ id, layout, constraints: Sn.constraints(cfg, wide ? { span: 'wide' } : {}), content: sensor(cfg) });
  const mount = (key, node) => document.querySelector(`[data-demo="${key}"]`).appendChild(node);

  const D = {
    temp: { id: 'temp', icon: 'temperature', name: 'Living Room', value: 20.8, unit: '°C', precision: 1, status: 'Comfortable', tone: 'normal' },
    hum: { id: 'hum', icon: 'humidity', name: 'Living Room Humidity', value: 58, unit: '%', status: 'Normal', tone: 'normal' },
    co2: { id: 'co2', icon: 'co2', name: 'Air Quality', value: 742, unit: 'ppm', status: 'Good', tone: 'positive' },
    bat: { id: 'bat', icon: 'battery', name: 'Front Door Sensor', value: 18, unit: '%', status: 'Low', tone: 'warning' },
    solar: { id: 'solar', icon: 'solar', name: 'Solar Power', value: 3.84, unit: 'kW', precision: 2, status: 'Producing', tone: 'positive' },
    lux: { id: 'lux', icon: 'illuminance', name: 'Garden', value: 1260, unit: 'lx' },
  };

  // 1–6 compact: six types, pairs on a phone
  mount('compact', G.create({ id: 'compact', items: ['temp', 'hum', 'co2', 'bat', 'solar', 'lux'].map((k, i) =>
    item(`${i + 1}-${k}`, D[k], { desktop: { x: 1 + i * 2, y: 1, w: 2, h: 3 }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * 3, w: 2, h: 3 }, mobile: { w: 2, h: 3 } })) }));

  // 7–9 standard
  mount('standard', G.create({ id: 'standard', items: [
    item('7-secondary', { ...D.solar, id: 'solar-std', trend: 'none', secondary: { label: 'Today', value: 14.2, unit: 'kWh', precision: 1 } },
      { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('8-trend-up', { ...D.temp, id: 'temp-std', trend: 'up', secondary: { label: 'Outside', value: 12.4, unit: '°C', precision: 1 } },
      { desktop: { x: 5, y: 1, w: 4, h: 3 }, tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('9-trend-down', { id: 'bath-hum', icon: 'humidity', name: 'Bathroom Humidity', value: 64, unit: '%', status: 'Normal', tone: 'normal', trend: 'down' },
      { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 4, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
  ] }));

  // 10–13: wide strips, unavailable / unknown, critical, compact with a secondary value
  mount('wide', G.create({ id: 'wide', items: [
    item('13-wide', { ...D.co2, id: 'co2-wide', trend: 'down', secondary: { label: 'PM2.5', value: 8, unit: 'µg/m³' } },
      { desktop: { x: 1, y: 1, w: 6, h: 2 }, tablet: { x: 1, y: 1, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('13-wide-b', { id: 'energy-wide', icon: 'energy', name: 'Energy Today', value: 14.2, unit: 'kWh', precision: 1, trend: 'stable', secondary: { label: 'Yesterday', value: 16.8, unit: 'kWh', precision: 1 } },
      { desktop: { x: 7, y: 1, w: 6, h: 2 }, tablet: { x: 1, y: 3, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('10-unavailable', { id: 'garage', icon: 'temperature', name: 'Garage', value: 'unavailable', unit: '°C', status: 'Comfortable', tone: 'normal', trend: 'up' },
      { desktop: { x: 1, y: 3, w: 2, h: 3 }, tablet: { x: 1, y: 5, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('10-unknown', { id: 'cellar', icon: 'humidity', name: 'Cellar Humidity', value: 'unknown', unit: '%' },
      { desktop: { x: 3, y: 3, w: 2, h: 3 }, tablet: { x: 3, y: 5, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('critical', { id: 'bed-co2', icon: 'co2', name: 'Bedroom CO₂', value: 1800, unit: 'ppm', status: 'Poor — ventilate', tone: 'critical', trend: 'up' },
      { desktop: { x: 5, y: 3, w: 3, h: 3 }, tablet: { x: 5, y: 5, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('11-compact-secondary', { id: 'outdoor', icon: 'temperature', name: 'Outdoor', value: 12.4, unit: '°C', precision: 1, status: 'Cool', tone: 'neutral', trend: 'down', secondary: { label: 'Feels', value: 10.9, unit: '°C', precision: 1 } },
      { desktop: { x: 8, y: 3, w: 2, h: 4 }, tablet: { x: 1, y: 8, w: 2, h: 4 }, mobile: { w: 2, h: 4 } }),
    item('water', { id: 'water', icon: 'water', name: 'Water Meter', value: 342, unit: 'L', status: 'Normal use', tone: 'normal', secondary: { label: 'This month', value: 6.1, unit: 'm³', precision: 1 } },
      { desktop: { x: 10, y: 3, w: 3, h: 3 }, tablet: { x: 3, y: 8, w: 2, h: 4 }, mobile: { w: 2, h: 4 } }),
  ] }));

  // Environment + Energy: Container + nested Grid + Sensors (no special component)
  const env = G.create({ id: 'env-grid', nested: true, items: [
    item('e-temp', { ...D.temp, id: 'e-temp', name: 'Temperature' }, { tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('e-hum', { ...D.hum, id: 'e-hum', name: 'Humidity' }, { tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('e-co2', { ...D.co2, id: 'e-co2', name: 'CO₂' }, { tablet: { x: 1, y: 4, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('e-lux', { ...D.lux, id: 'e-lux', name: 'Light', status: 'Bright', tone: 'neutral' }, { tablet: { x: 5, y: 4, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
  ] });
  const energy = G.create({ id: 'energy-grid', nested: true, items: [
    item('n-solar', { ...D.solar, id: 'n-solar', trend: 'up', secondary: { label: 'Today', value: 14.2, unit: 'kWh', precision: 1 } }, { tablet: { x: 1, y: 1, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('n-grid', { id: 'n-grid', icon: 'power', name: 'Grid', value: -1.12, unit: 'kW', precision: 2, status: 'Exporting', tone: 'positive', trend: 'stable' }, { tablet: { x: 1, y: 3, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('n-house', { id: 'n-house', icon: 'energy', name: 'House Load', value: 2.72, unit: 'kW', precision: 2, status: 'Normal', tone: 'normal', secondary: { label: 'Today', value: 11.6, unit: 'kWh', precision: 1 } }, { tablet: { x: 1, y: 5, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'environment', layout: { desktop: { x: 1, y: 1, w: 6, h: 8 }, tablet: { x: 1, y: 1, w: 8, h: 8 }, mobile: { w: 4, h: 8 } },
      content: { icon: Sn.ICONS.co2, title: 'Environment', subtitle: 'Living room', layout: 'free', content: [env] } },
    { id: 'energy', layout: { desktop: { x: 7, y: 1, w: 6, h: 8 }, tablet: { x: 1, y: 9, w: 8, h: 8 }, mobile: { w: 4, h: 11 } },
      content: { icon: Sn.ICONS.power, title: 'Energy', subtitle: 'Live', status: { text: 'Exporting', tone: 'success' }, layout: 'free', content: [energy] } },
  ] }));

  // ---- SHOW GRID overlay (developer aid, same as the other pages) ----
  const btn = document.getElementById('toggle-grid'), readout = document.getElementById('bp-read');
  function label(gridRoot) {
    const grid = gridRoot.querySelector(':scope > .mg__grid'), cs = getComputedStyle(grid);
    const cols = parseInt(cs.getPropertyValue('--mg-cols'), 10), gap = parseFloat(cs.columnGap) || 0;
    const g = grid.getBoundingClientRect(), colStep = (g.width + gap) / cols, rowStep = 40 + (parseFloat(cs.rowGap) || 0);
    gridRoot.dataset.bp = `${G.breakpointOf(gridRoot)} · ${cols} col · ${Math.round(g.width)}px`;
    grid.querySelectorAll(':scope > .mg__item').forEach((it) => {
      const r = it.getBoundingClientRect();
      let b = it.querySelector(':scope > .gx-badge');
      if (!b) { b = document.createElement('span'); b.className = 'gx-badge'; it.appendChild(b); }
      b.textContent = `${it.dataset.gridId}  x${Math.round((r.left - g.left) / colStep) + 1} y${Math.round((r.top - g.top) / rowStep) + 1} · w${Math.round((r.width + gap) / colStep)} h${Math.round((r.height + gap) / rowStep)}`;
    });
  }
  function refresh() {
    const main = document.querySelector('[data-demo="compact"] > .mg');
    readout.textContent = `${G.breakpointOf(main)} · ${getComputedStyle(main.firstElementChild).getPropertyValue('--mg-cols').trim()} columns`;
    if (document.body.classList.contains('show-grid')) document.querySelectorAll('.mg').forEach(label);
  }
  function setOverlay(on) {
    document.body.classList.toggle('show-grid', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Hide grid' : 'Show grid';
    refresh();
  }
  btn.addEventListener('click', () => setOverlay(!document.body.classList.contains('show-grid')));
  new ResizeObserver(refresh).observe(document.querySelector('main'));
  setOverlay(new URLSearchParams(location.search).get('grid') === '1');
})();
