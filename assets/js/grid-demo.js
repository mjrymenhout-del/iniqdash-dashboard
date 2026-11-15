/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Grid showroom: a full-width dashboard made of placeholders, plus the SHOW GRID developer overlay.
   Demonstration only — the overlay is not part of the grid or container components. */
(function () {
  'use strict';
  const G = window.MaisonGrid;
  const ICON = window.DEMO_ICON;

  const ph = (label, note, cls = '') => {
    const d = document.createElement('div');
    d.className = `ph ${cls}`.trim();
    d.innerHTML = `<span><strong></strong><small></small></span>`;
    d.querySelector('strong').textContent = label;
    d.querySelector('small').textContent = note || '';
    return d;
  };

  // ---- nested grids (they size themselves from the container they sit in) ----
  const homeGrid = G.create({ id: 'home-grid', nested: true, items: [
    { id: 'quick', layout: { tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }, content: ph('Quick controls', 'placeholder') },
    { id: 'environment', layout: { tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }, content: ph('Environment', 'placeholder') },
    { id: 'recent', layout: { tablet: { x: 1, y: 4, w: 8, h: 2 }, mobile: { w: 4, h: 2 } }, content: ph('Activity', 'placeholder') },
  ] });
  const securityGrid = G.create({ id: 'security-grid', nested: true, items: [
    { id: 'alarm', layout: { tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }, content: ph('Alarm', 'placeholder') },
    { id: 'door', layout: { tablet: { x: 1, y: 4, w: 2, h: 2 }, mobile: { w: 2, h: 2 } }, content: ph('Door', 'placeholder') },
    { id: 'window', layout: { tablet: { x: 3, y: 4, w: 2, h: 2 }, mobile: { w: 2, h: 2 } }, content: ph('Window', 'placeholder') },
    { id: 'camera', layout: { tablet: { x: 5, y: 1, w: 4, h: 5 }, mobile: { w: 4, h: 4 } }, content: ph('Camera', 'placeholder') },
  ] });

  // ---- the dashboard (DOM order = mobile reading order) ----
  const items = [
    { id: 'weather',
      layout: { desktop: { x: 1, y: 1, w: 4, h: 4 }, tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } },
      content: ph('Weather', 'widget placed directly on the grid', 'ph--tile') },
    { id: 'climate',
      layout: { desktop: { x: 5, y: 1, w: 4, h: 6 }, tablet: { x: 5, y: 1, w: 4, h: 7 }, mobile: { w: 2, h: 5 } },
      constraints: { minW: { mobile: 4 } },            // asks for 2 on mobile, constraint forces full width
      content: { icon: ICON.thermo, title: 'Climate', subtitle: 'Container', status: '21°', content: [ph('Climate', 'placeholder', 'fill')] } },
    { id: 'lights',
      layout: { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 5, w: 4, h: 3 }, mobile: { w: 2, h: 4 } },
      constraints: { minW: { mobile: 2 } },
      content: { icon: ICON.bulb, title: 'Lights', status: { text: '2/5', tone: 'accent' }, tone: 'accent', content: [ph('Lights', 'placeholder', 'fill')] } },
    { id: 'media',
      layout: { desktop: { x: 9, y: 4, w: 4, h: 3 }, tablet: { x: 1, y: 8, w: 4, h: 4 }, mobile: { w: 2, h: 4 } },
      constraints: { minW: { mobile: 2 } },
      content: { icon: ICON.play, title: 'Media', content: [ph('Media', 'placeholder', 'fill')] } },
    { id: 'activity',
      layout: { desktop: { x: 5, y: 7, w: 8, h: 2 }, tablet: { x: 5, y: 8, w: 4, h: 4 }, mobile: { w: 4, h: 4 } },
      content: { layout: 'row', content: [ph('Activity', 'no header'), ph('Event', 'placeholder'), ph('Event', 'placeholder')] } },
    { id: 'home',
      layout: { desktop: { x: 5, y: 9, w: 8, h: 8 }, tablet: { x: 1, y: 12, w: 8, h: 7 }, mobile: { w: 4, h: 7 } },
      content: { icon: ICON.home, title: 'Home', subtitle: 'Container with its own grid', layout: 'free',
        actions: [{ id: 'more', label: 'More', icon: ICON.more }], content: [homeGrid] } },
    { id: 'security',
      layout: { desktop: { x: 1, y: 5, w: 4, h: 12 }, tablet: { x: 1, y: 19, w: 8, h: 7 }, mobile: { w: 4, h: 11 } },
      content: { icon: ICON.shield, title: 'Security', subtitle: 'Nested grid', status: { text: 'Armed', tone: 'success' }, layout: 'free', content: [securityGrid] } },
  ];
  const dash = G.create({ id: 'dashboard', items });
  document.getElementById('dashboard').appendChild(dash);

  // ---- SHOW GRID overlay (showroom only) ----
  const btn = document.getElementById('toggle-grid');
  const readout = document.getElementById('bp-read');
  const setOverlay = (on) => {
    document.body.classList.toggle('show-grid', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Hide grid' : 'Show grid';
    refresh();
  };
  btn.addEventListener('click', () => setOverlay(!document.body.classList.contains('show-grid')));

  /** Measure where each item actually landed and label it in grid units. */
  function label(gridRoot) {
    const grid = gridRoot.querySelector(':scope > .mg__grid');
    const cs = getComputedStyle(grid);
    const cols = parseInt(cs.getPropertyValue('--mg-cols'), 10);
    const gap = parseFloat(cs.columnGap) || 0;
    const row = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-row')) || 40;
    const g = grid.getBoundingClientRect();
    const colStep = (g.width + gap) / cols;
    const rowStep = row + (parseFloat(cs.rowGap) || 0);
    gridRoot.dataset.bp = `${G.breakpointOf(gridRoot)} · ${cols} col · ${Math.round(g.width)}px`;
    grid.querySelectorAll(':scope > .mg__item').forEach((it) => {
      const r = it.getBoundingClientRect();
      const x = Math.round((r.left - g.left) / colStep) + 1;
      const y = Math.round((r.top - g.top) / rowStep) + 1;
      const w = Math.round((r.width + gap) / colStep);
      const h = Math.round((r.height + gap) / rowStep);
      let b = it.querySelector(':scope > .gx-badge');
      if (!b) { b = document.createElement('span'); b.className = 'gx-badge'; it.appendChild(b); }
      b.textContent = `${it.dataset.gridId}  x${x} y${y} · w${w} h${h}`;
    });
  }
  function refresh() {
    const main = document.querySelector('#dashboard > .mg');
    const cols = parseInt(getComputedStyle(main.querySelector('.mg__grid')).getPropertyValue('--mg-cols'), 10);
    readout.textContent = `${G.breakpointOf(main)} · ${cols} columns · row ${getComputedStyle(document.documentElement).getPropertyValue('--grid-row').trim()}`;
    if (document.body.classList.contains('show-grid')) document.querySelectorAll('.mg').forEach(label);
  }
  new ResizeObserver(refresh).observe(document.getElementById('dashboard'));
  if (new URLSearchParams(location.search).get('grid') === '1') setOverlay(true); else refresh();

  // dev check: explicit placements must not collide
  ['desktop', 'tablet', 'mobile'].forEach((bp) => {
    const c = G.collisions(items, bp);
    if (c.length) console.warn('grid collision', bp, c);
  });
})();
