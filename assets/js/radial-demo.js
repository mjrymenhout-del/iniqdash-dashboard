/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Radial Action Menu showroom. The widget only reports requests; here a MaisonApp action
   dispatcher runs them (demo / navigate / toggle), as the dashboard application does. */
(function () {
  'use strict';
  const G = window.MaisonGrid, RM = window.MaisonRadial, APP = window.MaisonApp, { mount, logger, overlay } = window.Showroom;
  const icons = window.DEMO_ICON || {};
  const log = logger(document.getElementById('log'));
  const navlog = logger(document.getElementById('navlog'));
  const A = (label, icon, type, extra) => ({ label, icon, type, enabled: true, confirm: false, keepOpen: false, ...(extra || {}) });
  const EIGHT = [
    A('Lights', 'bulb', 'toggle'), A('Scene', 'star', 'demo'), A('Night', 'moon', 'demo', { confirm: true }), A('Lock', 'lock', 'demo', { confirm: true }),
    A('Music', 'music', 'toggle', { keepOpen: true }), A('Climate', 'thermo', 'demo'), A('Garage', 'garage', 'demo', { confirm: true }), A('Power', 'power', 'toggle'),
  ];
  const actions = APP.createActions({ notify: (t) => log(`app: ${t}`) });
  const radial = (cfg) => RM.create({
    icons, ...cfg,
    onAction: (req, meta) => { log(`onAction (${meta.source}): #${req.index + 1} ${req.action.label || req.action.icon} · ${req.action.type}${req.action.type === 'toggle' ? ` → ${req.active ? 'on' : 'off'}` : ''}`); actions.run(req.action, { ...meta, active: req.active }); },
  });
  const item = (id, cfg, d, t, m) => ({ id, layout: { desktop: d, tablet: t, mobile: m }, constraints: RM.constraints(), content: radial({ id, ...cfg }) });
  const P = (x, y, w, h) => ({ x, y, w, h });

  mount('counts', G.create({ id: 'counts', items: [
    item('four', { name: 'Four', count: 4, actions: EIGHT.slice(0, 4) }, P(1, 1, 2, 3), P(1, 1, 2, 3), { w: 2, h: 3 }),
    item('six', { name: 'Six', count: 6, actions: EIGHT.slice(0, 6) }, P(3, 1, 3, 4), P(3, 1, 3, 4), { w: 2, h: 3 }),
    item('eight', { name: 'Eight', count: 8, actions: EIGHT }, P(6, 1, 6, 4), P(1, 5, 8, 4), { w: 4, h: 3 }),
  ] }));

  const disabled = EIGHT.map((a, i) => (i % 3 === 2 ? { ...a, enabled: false } : a));
  mount('states', G.create({ id: 'states', items: [
    item('confirm', { name: 'Confirm', count: 4, actions: [A('Open gate', 'gate', 'demo', { confirm: true }), A('Lock', 'lock', 'demo', { confirm: true }), A('Alarm', 'shield', 'demo', { confirm: true }), A('Lights', 'bulb', 'toggle')] }, P(1, 1, 3, 4), P(1, 1, 4, 4), { w: 2, h: 3 }),
    item('disabled', { name: 'Some disabled', count: 8, actions: disabled }, P(4, 1, 3, 4), P(5, 1, 4, 4), { w: 2, h: 3 }),
    item('keep', { name: 'Keeps open', count: 6, actions: EIGHT.slice(0, 6).map((a) => ({ ...a, keepOpen: true })) }, P(7, 1, 3, 4), P(1, 5, 4, 4), { w: 2, h: 3 }),
    item('off', { name: 'Unavailable', count: 6, actions: EIGHT.slice(0, 6), available: false }, P(10, 1, 3, 4), P(5, 5, 4, 4), { w: 2, h: 3 }),
  ] }));

  const nested = G.create({ id: 'nest-grid', nested: true, inherit: true, items: [
    { id: 'n-sensor', layout: { desktop: P(1, 1, 2, 3), tablet: P(1, 1, 2, 3), mobile: { w: 2, h: 3 } }, constraints: window.MaisonSensor.constraints({}), content: window.MaisonSensor.create({ name: 'Hall', value: 20.4, unit: '°C' }) },
    item('n-radial', { name: 'Hall', count: 6, actions: EIGHT.slice(2, 8) }, P(3, 1, 2, 3), P(3, 1, 2, 3), { w: 2, h: 3 }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'hall', layout: { desktop: P(1, 1, 4, 5), tablet: P(1, 1, 4, 5), mobile: { w: 4, h: 5 } }, content: { title: 'Hall', subtitle: 'Narrow container', variant: 'secondary', content: [nested] } },
    { id: 'n-light', layout: { desktop: P(5, 1, 3, 5), tablet: P(5, 1, 4, 5), mobile: { w: 4, h: 4 } }, constraints: window.MaisonLight.constraints({}), content: window.MaisonLight.create({ name: 'Neighbour' }) },
  ] }));

  /* a small application: three pages, a dock, and a radial whose segments navigate — one navigator */
  const pages = [{ id: 'p-home', name: 'Home', icon: 'home' }, { id: 'p-energy', name: 'Energy', icon: 'bolt' }, { id: 'p-media', name: 'Media', icon: 'play' }];
  const view = document.createElement('div');
  const nav = APP.createNavigator({ pages, start: 'p-home', onChange: (id, prev, source) => { show(id); navlog(`navigator: ${prev} → ${id} (via ${source})`); } });
  const app = APP.createActions({ navigator: nav, notify: (t) => log(`app: ${t}`) });
  const dock = APP.createDock({ label: 'Demo pages', items: pages.map((p) => ({ id: p.id, label: p.name, icon: icons[p.icon] })), active: 'p-home', onNavigate: (id) => nav.go(id, 'dock') });
  const shell = APP.createShell({ dock, content: view, navigation: { desktop: 'left', tablet: 'top', mobile: 'bottom' } });
  function show(id) {
    const p = pages.find((x) => x.id === id);
    dock.dock.setState({ active: id });
    const box = document.createElement('div'); box.className = 'rd-page'; box.dataset.page = id;
    const h = document.createElement('h3'); h.textContent = p.name;
    const g = G.create({ id: `g-${id}`, items: [{ id: `go-${id}`, layout: { desktop: P(1, 1, 3, 4), tablet: P(1, 1, 3, 4), mobile: { w: 2, h: 3 } }, constraints: RM.constraints(), content: RM.create({
      id: `go-${id}`, name: 'Go to', count: 4, icons,
      actions: [...pages.map((q) => A(q.name, q.icon, 'navigate', { page: q.id, enabled: q.id !== id })), A('Demo', 'star', 'demo')],
      onAction: (req, meta) => app.run(req.action, { ...meta, active: req.active }),
    }) }] });
    box.append(h, g);
    view.querySelectorAll('.rm').forEach((r) => r.radial && r.radial.destroy());
    view.replaceChildren(box);
  }
  show('p-home');
  mount('navigation', shell);
  window.radialDemo = { nav };
  overlay('[data-demo="counts"] > .mg');
})();
