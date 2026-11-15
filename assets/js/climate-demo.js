/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Climate showroom. Demo data and local state only — no Home Assistant, no persistence. */
(function () {
  'use strict';
  const G = window.MaisonGrid, K = window.MaisonClimate, ICON = window.DEMO_ICON;
  const log = document.getElementById('log');
  const onChange = (next, prev, meta) => {
    log.textContent = `onChange (${meta.source}): mode ${prev.hvacMode} → ${next.hvacMode} · target ${prev.targetTemperature} → ${next.targetTemperature}`;
  };
  const range = { minTemperature: 5, maxTemperature: 30, temperatureStep: 0.5, unit: '°C', hvacModes: ['heat', 'off'] };
  const climate = (cfg) => K.create({ ...range, onChange, ...cfg });
  const item = (id, cfg, layout) => ({ id, layout, constraints: K.constraints(cfg), content: climate(cfg) });
  const mount = (key, node) => document.querySelector(`[data-demo="${key}"]`).appendChild(node);

  // 1–3: states at standard width
  mount('states', G.create({ id: 'states', items: [
    item('1-heating', { id: 'living', name: 'Living Room', currentTemperature: 20.8, targetTemperature: 22.0, hvacMode: 'heat' },
      { desktop: { x: 1, y: 1, w: 4, h: 7 }, tablet: { x: 1, y: 1, w: 4, h: 7 }, mobile: { w: 4, h: 7 } }),
    item('2-idle', { id: 'kitchen', name: 'Kitchen', currentTemperature: 22.1, targetTemperature: 22.0, hvacMode: 'heat' },
      { desktop: { x: 5, y: 1, w: 4, h: 7 }, tablet: { x: 5, y: 1, w: 4, h: 7 }, mobile: { w: 4, h: 7 } }),
    item('3-off', { id: 'bath', name: 'Bathroom', currentTemperature: 20.5, targetTemperature: 21.0, hvacMode: 'off' },
      { desktop: { x: 9, y: 1, w: 4, h: 7 }, tablet: { x: 1, y: 8, w: 4, h: 7 }, mobile: { w: 4, h: 7 } }),
  ] }));

  // 4–6: compact, wide, compact
  mount('spans', G.create({ id: 'spans', items: [
    item('4-compact', { id: 'study', name: 'Study', currentTemperature: 19.6, targetTemperature: 21.0, hvacMode: 'heat' },
      { desktop: { x: 1, y: 1, w: 3, h: 6 }, tablet: { x: 1, y: 1, w: 3, h: 6 }, mobile: { w: 4, h: 7 } }),
    item('5-wide', { id: 'master', name: 'Master Bedroom', currentTemperature: 18.4, targetTemperature: 20.5, hvacMode: 'heat' },
      { desktop: { x: 4, y: 1, w: 6, h: 6 }, tablet: { x: 1, y: 7, w: 8, h: 6 }, mobile: { w: 4, h: 7 } }),
    item('6-compact', { id: 'hall', name: 'Hallway', currentTemperature: 20.0, targetTemperature: 19.5, hvacMode: 'heat' },
      { desktop: { x: 10, y: 1, w: 3, h: 6 }, tablet: { x: 4, y: 1, w: 3, h: 6 }, mobile: { w: 4, h: 7 } }),
  ] }));

  // 7: inside containers
  const salonGrid = G.create({ id: 'salon-grid', nested: true, items: [
    item('7a', { id: 'salon', name: 'Living Room', currentTemperature: 20.8, targetTemperature: 22.0, hvacMode: 'heat' },
      { tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 6 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: '7-primary', layout: { desktop: { x: 1, y: 1, w: 8, h: 8 }, tablet: { x: 1, y: 1, w: 8, h: 8 }, mobile: { w: 4, h: 8 } },
      content: { icon: ICON.home, title: 'Salon', subtitle: 'Primary container · nested grid', layout: 'free', content: [salonGrid] } },
    { id: '7-secondary', layout: { desktop: { x: 9, y: 1, w: 4, h: 9 }, tablet: { x: 1, y: 9, w: 5, h: 9 }, mobile: { w: 4, h: 10 } },
      content: { icon: ICON.home, title: 'Bedroom', subtitle: 'Primary → secondary', layout: 'stack',
        content: [{ title: 'Heating', status: 'Secondary', layout: 'stack', content: [climate({ id: 'bed', name: 'Bedroom', currentTemperature: 19.0, targetTemperature: 19.0, hvacMode: 'heat' })] }] } },
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
    const main = document.querySelector('[data-demo="states"] > .mg');
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
