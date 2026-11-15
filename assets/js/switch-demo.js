/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Switch showroom. Demo data and local state only — no Home Assistant, no persistence. */
(function () {
  'use strict';
  const G = window.MaisonGrid, X = window.MaisonSwitch, ICON = window.DEMO_ICON;
  const log = document.getElementById('log');
  const onChange = (next, prev, meta) => { log.textContent = `onChange (${meta.source}): ${prev.state} → ${next.state}`; };
  const PLUG = { image: 'widgets/default/switch/assets/smart-plug-on.png', imageOff: 'widgets/default/switch/assets/smart-plug-off.png', imageRatio: 300 / 304 };
  const sw = (cfg) => X.create({ onChange, ...cfg });
  const item = (id, cfg, layout, wide) => ({ id, layout, constraints: X.constraints(cfg, wide ? { span: 'wide' } : {}), content: sw(cfg) });
  const mount = (key, node) => document.querySelector(`[data-demo="${key}"]`).appendChild(node);

  const D = {
    extractor: { id: 'extractor', icon: 'extractor', name: 'Kitchen Extractor', subtitle: 'Kitchen', state: 'on', secondaryStatus: 'Running' },
    pump: { id: 'garden-pump', icon: 'pump', name: 'Garden Pump', subtitle: 'Garden', state: 'off' },
    unavailable: { id: 'unavailable', icon: 'plug', name: 'Unavailable Device', subtitle: 'Attic', state: 'on', available: false },
    socket: { id: 'garage-socket', icon: 'socket', name: 'Garage Socket', subtitle: 'Garage', state: 'on' },
    boiler: { id: 'boiler', icon: 'boiler', name: 'Boiler Relay', state: 'on', secondaryStatus: 'Manual' },
    plug: { id: 'smart-plug', icon: 'plug', name: 'Coffee Machine', subtitle: 'Kitchen', state: 'on', secondaryStatus: 'Connected', ...PLUG },
  };
  const compact = (i) => ({ desktop: { x: 1 + i * 2, y: 1, w: 2, h: 3 }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * 3, w: 2, h: 3 }, mobile: { w: 2, h: 3 } });
  mount('compact', G.create({ id: 'compact', items: ['extractor', 'pump', 'unavailable', 'socket', 'boiler', 'plug'].map((k, i) => item(`c-${k}`, D[k], compact(i))) }));

  mount('standard', G.create({ id: 'standard', items: [
    item('s-extractor', { ...D.extractor, id: 'extractor-std' }, { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('s-pool', { id: 'pool', icon: 'pump', name: 'Pool Pump', subtitle: 'Pool house', state: 'off', secondaryStatus: 'Automatic' }, { desktop: { x: 5, y: 1, w: 4, h: 3 }, tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('s-plug', { ...D.plug, id: 'plug-std' }, { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 4, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
  ] }));

  mount('wide', G.create({ id: 'wide', items: [
    item('w-outdoor', { id: 'outdoor', icon: 'power', name: 'Outdoor Power', subtitle: 'Terrace', state: 'on', secondaryStatus: 'Connected' }, { desktop: { x: 1, y: 1, w: 6, h: 2 }, tablet: { x: 1, y: 1, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('w-plug', { ...D.plug, id: 'plug-wide', name: 'Dishwasher Plug', state: 'off', secondaryStatus: '' }, { desktop: { x: 7, y: 1, w: 6, h: 2 }, tablet: { x: 1, y: 3, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('w-valve', { id: 'valve', icon: 'valve', name: 'Irrigation Valve', subtitle: 'Front lawn', state: 'off', available: false }, { desktop: { x: 1, y: 3, w: 6, h: 2 }, tablet: { x: 1, y: 5, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('w-circ', { id: 'circ', icon: 'pump', name: 'Circulation Pump', subtitle: 'Boiler room', state: 'off', secondaryStatus: 'Standby' }, { desktop: { x: 7, y: 3, w: 6, h: 2 }, tablet: { x: 1, y: 7, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
  ] }));

  // Utility: Container + nested Grid + Switches (no special component)
  const utility = G.create({ id: 'utility-grid', nested: true, items: [
    item('u-extractor', { ...D.extractor, id: 'u-extractor', name: 'Extractor', secondaryStatus: '' }, { tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('u-boiler', { ...D.boiler, id: 'u-boiler', name: 'Boiler' }, { tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('u-pump', { ...D.pump, id: 'u-pump', name: 'Pump' }, { tablet: { x: 1, y: 4, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('u-socket', { ...D.socket, id: 'u-socket', name: 'Socket', state: 'off' }, { tablet: { x: 5, y: 4, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
  ] });
  const terrace = G.create({ id: 'terrace-grid', nested: true, items: [
    item('t-lights', { id: 't-power', icon: 'power', name: 'Outdoor Sockets', subtitle: 'Terrace', state: 'on' }, { tablet: { x: 1, y: 1, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
    item('t-pool', { id: 't-pool', icon: 'pump', name: 'Pool Pump', subtitle: 'Pool', state: 'off', secondaryStatus: 'Automatic' }, { tablet: { x: 1, y: 3, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, true),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'utility', layout: { desktop: { x: 1, y: 1, w: 6, h: 8 }, tablet: { x: 1, y: 1, w: 8, h: 8 }, mobile: { w: 4, h: 8 } },
      content: { icon: X.ICONS.power, title: 'Utility', subtitle: 'Primary container · nested grid', status: '2/4', layout: 'free', content: [utility] } },
    { id: 'terrace', layout: { desktop: { x: 7, y: 1, w: 6, h: 9 }, tablet: { x: 1, y: 9, w: 8, h: 8 }, mobile: { w: 4, h: 10 } },
      content: { icon: ICON.home, title: 'Terrace', subtitle: 'Primary → secondary', layout: 'stack',
        content: [{ title: 'Outdoor', status: 'Secondary', layout: 'free', content: [terrace] }] } },
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
