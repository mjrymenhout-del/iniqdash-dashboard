/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Cover showroom. A tiny simulated device answers requests through setState() (as HA will later). */
(function () {
  'use strict';
  const G = window.MaisonGrid, V = window.MaisonCover, { mount, logger, overlay } = window.Showroom;
  const log = logger(document.getElementById('log'));
  const timers = new WeakMap();
  function device(el, next) {                     // simulated motor: 4% per 100ms toward the target
    clearInterval(timers.get(el));
    const st = el.cover.getState();
    if (next.request === 'stop') { el.cover.setState({ state: 'stopped' }); return; }
    const hasPos = st.position !== null;
    const target = next.request === 'open' ? 100 : next.request === 'close' ? 0 : next.position;
    if (!hasPos) { setTimeout(() => el.cover.setState({ state: target === 100 ? 'open' : 'closed' }), 1600); return; }
    let pos = st.position;
    if (next.request === 'position') el.cover.setState({ state: target > pos ? 'opening' : target < pos ? 'closing' : el.cover.getState().state });
    pos = next.request === 'position' ? pos : pos;
    const id = setInterval(() => {
      const cur = el.cover.getState().position;
      if (cur === target) { clearInterval(id); el.cover.setState({ state: target === 0 ? 'closed' : 'open' }); return; }
      el.cover.setState({ position: cur + Math.sign(target - cur) * Math.min(4, Math.abs(target - cur)) });
    }, 100);
    timers.set(el, id);
  }
  const cover = (cfg) => {
    let el;
    el = V.create({ ...cfg, onChange: (n, p, m) => { log(`onChange (${m.source}): ${n.request}${n.position !== null ? ' → ' + n.position + '%' : ''} · was ${p.state}${p.position !== null ? ' ' + p.position + '%' : ''}`); device(el, n); } });
    return el;
  };
  const item = (id, cfg, layout, span) => ({ id, layout, constraints: V.constraints(cfg, { span }), content: cover(cfg) });
  const ALL = { capabilities: { open: true, close: true, stop: true, position: true } };
  const c2 = (i, h = 3) => ({ desktop: { x: 1 + i * 2, y: 1, w: 2, h }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * h, w: 2, h }, mobile: { w: 2, h } });

  mount('states', G.create({ id: 'states', items: [
    item('1-open', { id: 'c-open', name: 'Kitchen Blind', state: 'open', position: 100, ...ALL }, c2(0)),
    item('2-closed', { id: 'c-closed', name: 'Bedroom Shutter', state: 'closed', position: 0, ...ALL }, c2(1)),
    item('3-partial', { id: 'c-partial', name: 'Study Blind', state: 'open', position: 45, ...ALL }, c2(2)),
    item('4-opening', { id: 'c-opening', name: 'Garage Door', state: 'opening', position: 30, ...ALL }, c2(3)),
    item('5-closing', { id: 'c-closing', name: 'Living Curtain', state: 'closing', position: 70, ...ALL }, c2(4)),
    item('6-unavailable', { id: 'c-unavailable', name: 'Attic Window', state: 'open', position: 60, available: false, ...ALL }, c2(5)),
  ] }));

  mount('caps', G.create({ id: 'caps', items: [
    item('7-nopos', { id: 'c-nopos', name: 'Driveway Gate', subtitle: 'No position', state: 'closed', capabilities: { open: true, close: true, stop: true }, labels: { open: 'Open', close: 'Close' } },
      { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('7-openclose', { id: 'c-oc', name: 'Skylight', subtitle: 'Open / close only', state: 'open', capabilities: { open: true, close: true, stop: false } },
      { desktop: { x: 5, y: 1, w: 2, h: 3 }, tablet: { x: 5, y: 1, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('7-poscompact', { id: 'c-pos', name: 'Patio Awning', subtitle: 'Position, no stop', state: 'open', position: 80, capabilities: { open: true, close: true, stop: false, position: true } },
      { desktop: { x: 7, y: 1, w: 2, h: 3 }, tablet: { x: 7, y: 1, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
  ] }));

  mount('spans', G.create({ id: 'spans', items: [
    item('8-compact', { id: 's-compact', name: 'Bathroom Blind', state: 'open', position: 65, ...ALL }, { desktop: { x: 1, y: 1, w: 2, h: 3 }, tablet: { x: 1, y: 1, w: 2, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('9-standard', { id: 's-standard', name: 'Living Room Shutter', subtitle: 'South façade', state: 'open', position: 40, ...ALL }, { desktop: { x: 3, y: 1, w: 4, h: 3 }, tablet: { x: 3, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('10-wide', { id: 's-wide', name: 'Garage Door', subtitle: 'Garage', state: 'closed', position: 0, ...ALL }, { desktop: { x: 7, y: 1, w: 6, h: 2 }, tablet: { x: 1, y: 4, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, 'wide'),
    item('10-wide-b', { id: 's-wide-b', name: 'Terrace Curtain', subtitle: 'Terrace', state: 'open', position: 75, ...ALL }, { desktop: { x: 7, y: 3, w: 6, h: 2 }, tablet: { x: 1, y: 6, w: 8, h: 2 }, mobile: { w: 4, h: 3 } }, 'wide'),
  ] }));

  const openings = G.create({ id: 'openings-grid', nested: true, items: [
    item('o1', { id: 'o1', name: 'Blind', subtitle: 'Office', state: 'open', position: 55, ...ALL }, { tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
    item('o2', { id: 'o2', name: 'Shutter', subtitle: 'Office', state: 'closed', position: 0, ...ALL }, { tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 2, h: 3 } }),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'openings', layout: { desktop: { x: 1, y: 1, w: 6, h: 5 }, tablet: { x: 1, y: 1, w: 8, h: 5 }, mobile: { w: 4, h: 5 } },
      content: { icon: window.DEMO_ICON.home, title: 'Openings', subtitle: 'Primary container · nested grid', status: '1/2 open', layout: 'free', content: [openings] } },
  ] }));

  overlay('[data-demo="states"] > .mg');
})();
