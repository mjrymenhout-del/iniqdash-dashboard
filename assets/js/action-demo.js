/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Action showroom. A demo responder reports outcomes through setState(), as HA will later. */
(function () {
  'use strict';
  const G = window.MaisonGrid, A = window.MaisonAction, { mount, logger, overlay } = window.Showroom;
  const log = logger(document.getElementById('log'));
  const action = (cfg, outcome = 'done', delay = 1400) => {
    let el;
    el = A.create({ ...cfg, onActivate: (req, meta) => {
      log(`onActivate (${meta.source}): ${req.name}`);
      setTimeout(() => el.action.setState({ status: outcome }), delay);       // the "device" answers
    } });
    return el;
  };
  const place = (id, el, layout, cfg) => ({ id, layout, constraints: A.constraints(cfg), content: el });
  const c2 = (i, h = 3) => ({ desktop: { x: 1 + i * 2, y: 1, w: 2, h }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * h, w: 2, h }, mobile: { w: 2, h } });

  const D = [
    [{ id: 'a-ready', icon: 'moon', name: 'Good Night' }],
    [{ id: 'a-sub', icon: 'vacuum', name: 'Start Vacuum', subtitle: 'Ground floor' }],
    [{ id: 'a-running', icon: 'script', name: 'Run Backup', status: 'running', runningTimeout: null }],
    [{ id: 'a-done', icon: 'scene', name: 'Movie Scene', status: 'done', resetAfter: null }],
    [{ id: 'a-failed', icon: 'restart', name: 'Restart Router', status: 'failed', resetAfter: null }, 'failed'],
    [{ id: 'a-unavailable', icon: 'bell', name: 'Ring Bell', available: false }],
  ];
  mount('states', G.create({ id: 'states', items: D.map(([cfg, out], i) => place(cfg.id, action(cfg, out), c2(i), cfg)) }));

  const gate = { id: 'a-gate', icon: 'gate', name: 'Open Gate', subtitle: 'Driveway', requiresConfirmation: true };
  const gate2 = { id: 'a-gate2', icon: 'gate', name: 'Open Garage', requiresConfirmation: true };
  mount('confirm', G.create({ id: 'confirm', items: [
    place('c-standard', action(gate), { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }, gate),
    place('c-compact', action(gate2), { desktop: { x: 5, y: 1, w: 2, h: 3 }, tablet: { x: 5, y: 1, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }, gate2),
  ] }));

  const s1 = { id: 's-short', icon: 'moon', name: 'Good Night' }, s2 = { id: 's-short2', icon: 'bell', name: 'Ring Bell' };
  const s3 = { id: 's-standard', icon: 'scene', name: 'Dinner Scene', subtitle: 'Dining room' };
  const s4 = { id: 's-wide', icon: 'vacuum', name: 'Start Vacuum', subtitle: 'Whole house · about 45 min' };
  mount('spans', G.create({ id: 'spans', items: [
    place('2-short', action(s1), { desktop: { x: 1, y: 1, w: 2, h: 2 }, tablet: { x: 1, y: 1, w: 2, h: 2 }, mobile: { w: 2, h: 2 } }, s1),
    place('2-short-b', action(s2, 'failed'), { desktop: { x: 3, y: 1, w: 2, h: 2 }, tablet: { x: 3, y: 1, w: 2, h: 2 }, mobile: { w: 2, h: 2 } }, s2),
    place('standard', action(s3), { desktop: { x: 5, y: 1, w: 4, h: 2 }, tablet: { x: 5, y: 1, w: 4, h: 2 }, mobile: { w: 4, h: 2 } }, s3),
    place('standard-b', action({ id: 's-standard2', icon: 'restart', name: 'Restart Router', subtitle: 'Network cupboard', status: 'failed', resetAfter: null }), { desktop: { x: 9, y: 1, w: 4, h: 2 }, tablet: { x: 1, y: 3, w: 4, h: 2 }, mobile: { w: 4, h: 2 } }, {}),
    place('3-wide', action(s4), { desktop: { x: 1, y: 3, w: 6, h: 2 }, tablet: { x: 1, y: 5, w: 8, h: 2 }, mobile: { w: 4, h: 2 } }, s4),
    place('3-wide-b', action({ id: 's-wide2', icon: 'gate', name: 'Open Gate', subtitle: 'Driveway', requiresConfirmation: true }), { desktop: { x: 7, y: 3, w: 6, h: 2 }, tablet: { x: 1, y: 7, w: 8, h: 2 }, mobile: { w: 4, h: 2 } }, {}),
  ] }));

  const actions = G.create({ id: 'actions-grid', nested: true, items: [
    place('n1', action({ id: 'n1', icon: 'moon', name: 'Good Night' }), { tablet: { x: 1, y: 1, w: 4, h: 2 }, mobile: { w: 2, h: 2 } }, {}),
    place('n2', action({ id: 'n2', icon: 'gate', name: 'Open Gate', requiresConfirmation: true }), { tablet: { x: 5, y: 1, w: 4, h: 2 }, mobile: { w: 2, h: 2 } }, {}),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'actions', layout: { desktop: { x: 1, y: 1, w: 6, h: 4 }, tablet: { x: 1, y: 1, w: 8, h: 4 }, mobile: { w: 4, h: 4 } },
      content: { icon: A.ICONS.scene, title: 'Actions', subtitle: 'Primary container · nested grid', layout: 'free', content: [actions] } },
  ] }));

  overlay('[data-demo="states"] > .mg');
})();
