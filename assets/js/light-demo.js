/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Light widget showroom. Demo data and local state only — no Home Assistant, no persistence. */
(function () {
  'use strict';
  const G = window.MaisonGrid, L = window.MaisonLight, C = window.MaisonContainer, ICON = window.DEMO_ICON;
  const PNG = 'widgets/default/light/assets/pendant-dome.png';     // one temporary fixture for every demo light
  const RATIO = 480 / 436;

  const light = (cfg) => L.create({ image: PNG, imageRatio: RATIO, ...cfg });
  /** A grid item holding a light: the light's own constraints become the item's minW/minH. */
  const item = (id, cfg, layout) => ({ id, layout, constraints: L.constraints(cfg), content: light(cfg) });

  const kitchen = { id: 'kitchen', name: 'Kitchen Pendant', state: 'on', brightness: 70, dimmable: true };
  const dining = { id: 'dining', name: 'Dining Pendant', state: 'off', brightness: 45, dimmable: true };
  const hall = { id: 'hall', name: 'Hallway Pendant', state: 'on', capabilities: { power: true, brightness: false } };
  const island = { id: 'island', name: 'Island Pendant', state: 'on', brightness: 40, dimmable: true };
  const porch = { id: 'porch', name: 'Porch Pendant', state: 'off', dimmable: false };
  const living = { id: 'living', name: 'Living Room Pendant', state: 'on', brightness: 85, dimmable: true };

  const mount = (key, node) => document.querySelector(`[data-demo="${key}"]`).appendChild(node);

  // progression: the same widget in the exact areas of mobile w2 and desktop w3 / w4 / w6
  const SIZES = [['mobile w2', 173, 196], ['desktop w3', 296, 208], ['desktop w4', 400, 208], ['desktop w6', 608, 208]];
  [['prog-on', 'on'], ['prog-off', 'off']].forEach(([key, state]) => SIZES.forEach(([label, w, h], i) => {
    const f = document.createElement('div');
    f.className = 'pframe';
    f.style.width = `min(100%, ${w}px)`;
    f.style.height = `${h}px`;
    f.dataset.label = `${label} · ${w}×${h} · ${state}`;
    f.appendChild(light({ id: `p-${state}-${i}`, name: 'Kitchen Pendant', state, brightness: 70, dimmable: true }));
    mount(key, f);
  }));

  // 1–3 states, standard width (w4)
  mount('states', G.create({ id: 'states', items: [
    item('1-on', kitchen, { desktop: { x: 1, y: 1, w: 4, h: 4 }, tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } }),
    item('2-off', dining, { desktop: { x: 5, y: 1, w: 4, h: 4 }, tablet: { x: 5, y: 1, w: 4, h: 4 }, mobile: { w: 2, h: 4 } }),
    item('3-non-dimmable', hall, { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 5, w: 4, h: 3 }, mobile: { w: 2, h: 4 } }),
  ] }));

  // 4–5 spans: compact (w3) and wide (w6)
  mount('spans', G.create({ id: 'spans', items: [
    item('4-compact', island, { desktop: { x: 1, y: 1, w: 3, h: 4 }, tablet: { x: 1, y: 1, w: 3, h: 4 }, mobile: { w: 2, h: 4 } }),
    item('4-compact-off', porch, { desktop: { x: 10, y: 1, w: 3, h: 4 }, tablet: { x: 4, y: 1, w: 3, h: 3 }, mobile: { w: 2, h: 4 } }),
    item('5-wide', living, { desktop: { x: 4, y: 1, w: 6, h: 4 }, tablet: { x: 1, y: 5, w: 6, h: 4 }, mobile: { w: 4, h: 4 } }),
  ] }));

  // 6–7 inside containers
  const cuisineGrid = G.create({ id: 'cuisine-grid', nested: true, items: [
    item('6a', { id: 'c1', name: 'Kitchen Pendant', state: 'on', brightness: 70, dimmable: true }, { tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 2, h: 4 } }),
    item('6b', { id: 'c2', name: 'Worktop', state: 'off', brightness: 60, dimmable: true }, { tablet: { x: 5, y: 1, w: 4, h: 4 }, mobile: { w: 2, h: 4 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: '6-primary', layout: { desktop: { x: 1, y: 1, w: 6, h: 6 }, tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 6 } },
      content: { icon: ICON.pot, title: 'Cuisine', subtitle: 'Primary container', status: { text: '1/2', tone: 'accent' }, tone: 'accent', layout: 'free', content: [cuisineGrid] } },
    { id: '7-secondary', layout: { desktop: { x: 7, y: 1, w: 6, h: 7 }, tablet: { x: 1, y: 7, w: 8, h: 7 }, mobile: { w: 4, h: 8 } },
      content: { icon: ICON.home, title: 'Salon', subtitle: 'Primary → secondary container', layout: 'stack',
        content: [{ title: 'Spots', status: 'Secondary', layout: 'row', content: [light({ id: 's1', name: 'Reading Pendant', state: 'on', brightness: 55, dimmable: true })] }] } },
  ] }));

  // ---- SHOW GRID overlay (same developer aid as the grid page) ----
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
