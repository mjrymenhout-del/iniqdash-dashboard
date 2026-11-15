/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// FLOW CONNECTOR — the universal flow connector (components/flow: IniqFlow), independent of any widget. Real app page (the editor), real
// browser; no Home Assistant involved (the connector never reads one — a host gives it a number).
//   geometry: straight / elbow / curve / arc, anchors on circles and rectangles, intermediate points, a moved node re-routes
//   appearance: colour (token / hex), thickness, dashed / dotted, arrowheads, end markers, gradient, glow
//   animation: dots / dashes / pulse (CSS dash offset), arrows (CSS motion path — they really travel), none; speed sets the duration
//   data: the sign follows the CONFIGURED direction (never a name), 0 → still, deadband, unavailable → dashed / dim / hide
//   performance: CSS only (no requestAnimationFrame loop), off screen → paused, reduced motion → nothing moves (a static chevron shows the
//   way), destroy() → gone and unobserved; 300 connectors build quickly; the Studio "Flow connector" element uses the same component.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1300, height: 900 } }); const page = B.page;
  await page.waitForTimeout(600);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await E(() => {
    window.__raf = 0; const r = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { window.__raf++; return r(f); };
    const host = document.createElement('div'); host.id = 'fx'; host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px;z-index:99999;background:#111';
    host.innerHTML = '<svg id="fxs" viewBox="0 0 600 400" width="600" height="400" style="overflow:visible"></svg>'; document.body.append(host);
  });

  // ---------------------------------------------------------------- geometry
  const geo = await E(() => {
    const F = window.IniqFlow, svg = document.getElementById('fxs');
    const A = { x: 40, y: 160, w: 80, h: 80, shape: 'circle' }, Bn = { x: 440, y: 40, w: 120, h: 60, shape: 'rect' };
    const out = {};
    const st = F.mount(svg, F.connector({ from: A, to: Bn, geometry: 'straight' }));
    const g = st.geometry();
    const c = [80, 200], dist = Math.hypot(g.start[0] - c[0], g.start[1] - c[1]);
    out.circleEdge = Math.abs(dist - 40) < 0.6;                                  // on the circle's edge…
    const toB = [500 - 80, 70 - 200], cosA = ((g.start[0] - 80) * toB[0] + (g.start[1] - 200) * toB[1]) / (40 * Math.hypot(...toB));
    out.facing = cosA > 0.999;                                                   // …facing the other node
    out.rectSide = Math.abs(g.end[0] - 440) < 0.6 && Math.abs(g.end[1] - 70) < 0.6;   // the middle of the rect's LEFT side
    out.straightD = /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+$/.test(g.d);
    st.update({ from: { ...A, y: 300 } });
    out.moved = st.geometry().d !== g.d && st.geometry().start[1] > g.start[1];
    const el = F.mount(svg, F.connector({ from: [50, 50], to: [300, 250], geometry: 'elbow', radius: 0 }));
    const nums = el.geometry().d.match(/-?[\d.]+/g).map(Number); const P = []; for (let i = 0; i < nums.length; i += 2) P.push([nums[i], nums[i + 1]]);
    out.elbowOrtho = P.length >= 3 && P.slice(1).every((p, i) => Math.abs(p[0] - P[i][0]) < 0.11 || Math.abs(p[1] - P[i][1]) < 0.11);
    const er = F.mount(svg, F.connector({ from: [50, 50], to: [300, 250], geometry: 'elbow', radius: 12 }));
    out.elbowRound = /Q/.test(er.geometry().d);
    const cv = F.mount(svg, F.connector({ from: [50, 300], to: [300, 380], geometry: 'curve' }));
    out.curve = /C/.test(cv.geometry().d) && cv.geometry().length > Math.hypot(250, 80);
    const ar1 = F.route({ from: [100, 100], to: [300, 100], geometry: 'arc', bulge: 0.5 }), ar2 = F.route({ from: [100, 100], to: [300, 100], geometry: 'arc', bulge: -0.5 });
    out.arc = ar1.mid[1] > 130 && ar2.mid[1] < 70;                                // a bow, on the side the bulge says
    const via = F.route({ from: [0, 0], to: [200, 0], geometry: 'straight', points: [[100, 80]] });
    out.points = /L100 80/.test(via.d);
    [st, el, er, cv].forEach((x) => x.destroy());
    return out;
  });
  check('GEOMETRY: a circle node is met on its edge facing the other end; a rectangle on the middle of the facing side; a straight line is one segment',
    geo.circleEdge && geo.facing && geo.rectSide && geo.straightD, JSON.stringify(geo));
  check('…a moved node re-routes the connection (update({ from: node }))', geo.moved);
  check('…ELBOW: only horizontal / vertical legs (radius 0), rounded corners with a radius; CURVE: a smooth cubic; ARC: a bow on the chosen side; intermediate points are passed through',
    geo.elbowOrtho && geo.elbowRound && geo.curve && geo.arc && geo.points, JSON.stringify(geo));

  // ---------------------------------------------------------------- appearance
  const look = await E(() => {
    const F = window.IniqFlow, svg = document.getElementById('fxs');
    const c = F.mount(svg, F.connector({ from: [20, 20], to: [200, 20], color: 'success', width: 5, line: 'dashed', arrow: 'end', arrowStyle: 'triangle', markers: { start: 'dot' }, glow: 0.6, opacity: 0.8 }));
    const t = c.el.querySelector('.iqf__track'), cs = getComputedStyle(t);
    const out = { stroke: t.style.stroke, width: cs.strokeWidth, dash: cs.strokeDasharray, end: t.getAttribute('marker-end'), start: t.getAttribute('marker-start'), glow: cs.filter, op: cs.opacity };
    c.update({ line: 'dotted', color: '#ff8800', gradient: ['#ff0000', 'info'] });
    out.dotted = getComputedStyle(t).strokeDasharray; out.grad = t.style.stroke; out.stops = [...c.el.querySelectorAll('stop')].map((s) => s.style.stopColor);
    c.destroy();
    return out;
  });
  check('APPEARANCE: a theme token colour, thickness, dashed / dotted, an arrowhead and a start marker (SVG markers), a glow, opacity, a gradient along the connection',
    look.stroke === 'var(--success)' && look.width === '5px' && /20px/.test(look.dash) && /url\(#iqf\d+-arrow\)/.test(look.end) && /mstart/.test(look.start) && /drop-shadow/.test(look.glow)
      && look.op === '0.8' && /^0(px)?,/.test(look.dotted) && /grad/.test(look.grad) && look.stops.length === 2 && look.stops[1] === 'var(--info)', JSON.stringify(look));

  // ---------------------------------------------------------------- animation
  const anim = await E(async () => {
    const F = window.IniqFlow, svg = document.getElementById('fxs'), out = {};
    for (const type of ['dots', 'dashes', 'pulse', 'none']) {
      const c = F.mount(svg, F.connector({ from: [20, 100], to: [420, 100], geometry: 'straight', animation: { type, speed: 100, spacing: 20, size: 4 } }));
      const f = getComputedStyle(c.el.querySelector('.iqf__flow'));
      out[type] = { name: f.animationName, dur: f.animationDuration, display: f.display };
      c.destroy();
    }
    const a = F.mount(svg, F.connector({ from: [20, 200], to: [520, 200], geometry: 'straight', animation: { type: 'arrows', speed: 250, spacing: 100, size: 5 } }));
    const arr = [...a.el.querySelectorAll('.iqf__arrow')];
    const x0 = arr[0].getBoundingClientRect().x; await new Promise((r) => setTimeout(r, 400)); const x1 = arr[0].getBoundingClientRect().x;
    out.arrows = { count: arr.length, path: !!arr[0].style.offsetPath, moved: x1 - x0, name: getComputedStyle(arr[0]).animationName };
    a.flow(F.read(-5, { positive: 'forward' }));
    const r0 = arr[0].getBoundingClientRect().x; await new Promise((r) => setTimeout(r, 400)); const r1 = arr[0].getBoundingClientRect().x;
    out.arrowsReverse = r1 - r0;
    a.flow({ ...F.read(5, { positive: 'forward' }), speed: 500 });
    out.fast = getComputedStyle(a.el.querySelector('.iqf__arrow')).animationDuration;
    a.destroy();
    return out;
  });
  check('ANIMATION: dots and dashes move their dash pattern (CSS), the neon pulse travels the connection, "none" has no moving layer; the speed sets the duration (20 px period at 100 px/s = 0.2 s)',
    anim.dots.name === 'iqf-dash' && anim.dots.dur === '0.2s' && anim.dashes.name === 'iqf-dash' && anim.pulse.name === 'iqf-pulse' && anim.none.display === 'none', JSON.stringify(anim));
  check('…ARROWS really travel along the connection (CSS motion path) — forwards, then BACKWARDS once the reading reverses; a faster reading shortens the cycle',
    anim.arrows.count === 5 && anim.arrows.path && anim.arrows.name === 'iqf-move' && anim.arrows.moved > 40 && anim.arrowsReverse < -40 && anim.fast === '1s', JSON.stringify(anim));

  // ---------------------------------------------------------------- data
  const data = await E(() => {
    const F = window.IniqFlow, svg = document.getElementById('fxs');
    const R = (v, s) => { const r = F.read(v, s); return `${r.state}/${r.direction}`; };
    const out = {
      pos: R(1200, { positive: 'forward' }), posRev: R(1200, { positive: 'reverse' }), neg: R(-300, { positive: 'forward' }), negRev: R(-300, { positive: 'reverse' }),
      zero: R(0, {}), dead: R(4, { deadband: 5 }), nul: R(null, {}), unav: R({ unavailable: true }, {}), text: R('abc', {}), bool: R(true, {}),
      speed: F.read(500, { speed: { range: [0, 1000], to: [20, 120] } }).speed,
    };
    const c = F.mount(svg, F.connector({ from: [20, 300], to: [300, 300], animation: { type: 'dots' } }));
    const fl = () => getComputedStyle(c.el.querySelector('.iqf__flow'));
    c.flow(F.read(-300, { positive: 'forward' })); out.revDir = fl().animationDirection;
    c.flow(F.read(0, { zero: 'still' })); out.idle = { flow: fl().display, track: getComputedStyle(c.el).display };
    c.flow(F.read(0, { zero: 'hide' })); out.idleHide = getComputedStyle(c.el).display;
    c.flow(F.read(null, { unavailable: 'dashed' })); out.unavA = { flow: fl().display, dash: getComputedStyle(c.el.querySelector('.iqf__track')).strokeDasharray };
    c.destroy();
    return out;
  });
  check('DATA: a positive value flows the CONFIGURED way (forward / reverse), a negative the other way; 0 and a value inside the deadband → idle; null / text / true / unavailable → unavailable (never a pretend flow)',
    data.pos === 'flow/forward' && data.posRev === 'flow/reverse' && data.neg === 'flow/reverse' && data.negRev === 'flow/forward' && data.zero === 'idle/none' && data.dead === 'idle/none'
      && data.nul === 'unavailable/none' && data.unav === 'unavailable/none' && data.text === 'unavailable/none' && data.bool === 'unavailable/none' && data.speed === 70, JSON.stringify(data));
  check('…applied: reverse runs the animation backwards; idle → nothing moves (the line stays, or hides when asked); unavailable → a dashed line and nothing moves',
    data.revDir === 'reverse' && data.idle.flow === 'none' && data.idle.track !== 'none' && data.idleHide === 'none' && data.unavA.flow === "none" && /4px, 5px|4, 5/.test(data.unavA.dash), JSON.stringify(data));

  // ---------------------------------------------------------------- performance & lifecycle
  const perf = await E(async () => {
    const F = window.IniqFlow, svg = document.getElementById('fxs');
    const raf0 = window.__raf, t0 = performance.now(), list = [];
    for (let i = 0; i < 300; i++) list.push(F.mount(svg, F.connector({ from: [10 + (i % 30) * 19, 10 + Math.floor(i / 30) * 38], to: [20 + (i % 30) * 19, 40 + Math.floor(i / 30) * 38], animation: { type: i % 2 ? 'dots' : 'arrows', spacing: 10 } })));
    const build = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 500));
    const observed = F._observed();
    // off screen: the host svg moves out of view → paused
    document.getElementById('fx').style.top = '-2000px';
    await new Promise((r) => setTimeout(r, 300));
    const off = svg.hasAttribute('data-iqf-off'), paused = getComputedStyle(list[1].el.querySelector('.iqf__flow')).animationPlayState;
    document.getElementById('fx').style.top = '0px';
    await new Promise((r) => setTimeout(r, 300));
    const back = !svg.hasAttribute('data-iqf-off');
    list.forEach((c) => c.destroy());
    return { build: Math.round(build), raf: window.__raf - raf0, observed, off, paused, back, left: svg.querySelectorAll('.iqf').length, observedAfter: F._observed() };
  });
  check('PERFORMANCE: 300 animated connectors build in well under a second and run with NO script per frame (no requestAnimationFrame) — one shared observer for their svg',
    perf.build < 1000 && perf.raf === 0 && perf.observed === 1, JSON.stringify(perf));
  check('OFF SCREEN: the host svg out of view → every animation paused; back in view → running', perf.off && perf.paused === 'paused' && perf.back, JSON.stringify(perf));
  check('DESTROY: every connector removed and nothing observed any more', perf.left === 0 && perf.observedAfter === 0, JSON.stringify(perf));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rm = await E(() => {
    const F = window.IniqFlow, svg = document.getElementById('fxs');
    const c = F.mount(svg, F.connector({ from: [20, 100], to: [300, 100], animation: { type: 'dots' } })); c.flow(F.read(-1, {}));
    const out = { anim: getComputedStyle(c.el.querySelector('.iqf__flow')).animationName, mark: getComputedStyle(c.el.querySelector('.iqf__mark')).display, rot: c.el.querySelector('.iqf__mark').getAttribute('transform') };
    c.destroy(); return out;
  });
  check('REDUCED MOTION: nothing moves; a static chevron in the middle shows the direction (rotated 180° for a reverse flow)', rm.anim === 'none' && rm.mark !== 'none' && /rotate\(180\)/.test(rm.rot), JSON.stringify(rm));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---------------------------------------------------------------- the Studio element (the same component)
  const st = await E(() => {
    const d = window.IniqComponents.get('flow-connector'); if (!d) return null;
    const el = d.compose.render({ from: 'left', to: 'right', geometry: 'elbow', animation: 'arrows' }, { value: -40 }, { box: { w: 240, h: 90 } });
    document.getElementById('fx').append(el);
    const g = el.querySelector('.iqf'), out = { comp: !!g, dir: g.dataset.dir, anim: g.dataset.anim, editor: !!window.IniqComponents.editor('flow-connector'), palette: window.IniqComponents.composable().some((x) => x.id === 'flow-connector') };
    d.compose.update(el, { from: 'left', to: 'right', positive: 'reverse' }, { value: -40 }, { box: { w: 240, h: 90 } }); out.flipped = g.dataset.dir; out.same = el.querySelector('.iqf') === g;
    d.compose.update(el, {}, { value: 0 }, { box: { w: 240, h: 90 } }); out.zero = g.dataset.state;
    el.remove(); return out;
  });
  check('STUDIO ELEMENT "Flow connector": the same IniqFlow component in a box (in the composable palette, with its Properties); a negative preview value flows back, the designer\'s "positive flows To → From" turns it round, 0 stops it — redrawn in place',
    st && st.comp && st.dir === 'reverse' && st.anim === 'arrows' && st.editor && st.palette && st.flipped === 'forward' && st.same && st.zero === 'idle', JSON.stringify(st));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
