/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — THE TOOLBOX. Real Studio UI, real IniqDash server, FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
//   TOOLBOX   grouped (Visual · Text · Information · Controls · Layout), searchable; click adds, DRAG from the toolbox DROPS on the canvas
//   ELEMENTS  shape (7 predefined geometries) · line · spacer · badge · group panel · progress bar / ring · arc gauge · status · label + value ·
//             battery · number stepper · select · image overlay — each from the shared foundation, edited in the shared form
//   NO MAGIC  nothing dropped has a Home Assistant meaning: no property, no binding in the saved definition; a stepper / select press
//             reaches no Home Assistant
//   LAYERS    list (top first), select from the list, Shift + click multi-select, hide (faint in Studio, invisible on the dashboard),
//             lock (not picked on the canvas), align / distribute / stack, group (selects and moves together) / ungroup
//   THEME     a shape in the theme's accent follows a theme change at once (Studio canvas + dashboard); an explicit colour stays
//   SAVE      locked / hidden / group survive save + reload (server-validated); the dashboard copy at Micro, Compact, Normal and Large keeps
//             every element inside its card
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type="${t}"]`); await wait(200); return (await state()).sel; };
  const select = async (id) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await wait(150); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await wait(60); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await wait(200); };
  const posts = () => L.haCalls.filter((c) => c.method === 'POST' && /\/api\/services\//.test(c.url)).length;
  const p0 = posts();

  await E(() => window.IniqStudioLibrary.createCollection('Toolbox'));
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`).catch(() => page.click(`${S} [data-k=wst-new]`)); await wait(300);
  await page.click(`${S} [data-k=wst-snap-smart]`);           // smart snapping off: exact numbers below
  // ---------------------------------------------------------------- the toolbox
  const tb = await E((S) => [...document.querySelectorAll(`${S} .wst__pgroup`)].map((g) => [g.querySelector('.wst__pgh').textContent, [...g.querySelectorAll('[data-k=wst-add]')].map((b) => b.dataset.type)]), S);
  const all = tb.flatMap(([, t]) => t);
  const need = ['shape', 'line', 'image', 'icon', 'image-overlay', 'text', 'information', 'label-value', 'badge', 'status', 'progress-bar', 'progress-ring', 'arc-gauge', 'battery',
    'button', 'toggle', 'slider', 'dial', 'segmented', 'stepper', 'select', 'panel', 'spacer'];
  check('TOOLBOX: grouped Visual · Information · Controls · Layout (the foundation\'s categories) with every element (shape, line, image, icon, image overlay, text, information, label + value, badge, status, progress bar / ring, arc gauge, battery, button, toggle, slider, dial, segmented, stepper, select, group, spacer)',
    JSON.stringify(tb.map(([h]) => h)) === JSON.stringify(['Visual', 'Information', 'Controls', 'Layout']) && need.every((t) => all.includes(t)), JSON.stringify(tb));
  await page.fill(`${S} [data-k=wst-find]`, 'progress'); await wait(150);
  const found = await E((S) => [...document.querySelectorAll(`${S} [data-k=wst-add]`)].map((b) => b.dataset.type), S);
  check('SEARCH: "progress" finds Progress bar and Progress ring only', JSON.stringify(found) === JSON.stringify(['progress-bar', 'progress-ring']), JSON.stringify(found));
  await page.fill(`${S} [data-k=wst-find]`, ''); await wait(150);
  // DRAG from the toolbox → DROP on the canvas
  const lb = await page.$(`${S} [data-k=wst-layer]`), r = await lb.boundingBox();
  await page.dragAndDrop(`${S} [data-k=wst-add][data-type="badge"]`, `${S} [data-k=wst-layer]`, { targetPosition: { x: r.width * 0.75, y: r.height * 0.25 } }); await wait(300);
  const dropped = (await state()).def.components.find((c) => c.type === 'badge');
  check('DRAG AND DROP: a Status badge dragged from the toolbox lands where it was dropped (its centre ≈ ¾ across, ¼ down the 360 × 240 canvas)', !!dropped && Math.abs(dropped.x + dropped.w / 2 - 270) <= 6 && Math.abs(dropped.y + dropped.h / 2 - 60) <= 6, JSON.stringify(dropped));
  await select(dropped.id); await page.click(`${P} [data-k=wst-del]`); await wait(150);

  // ---------------------------------------------------------------- a composition of the new elements
  const ids = {};
  for (const [k, t, x, y, w, h] of [['panel', 'panel', 0, 0, 360, 240], ['dot', 'shape', 12, 12, 44, 44], ['lv', 'label-value', 66, 14, 176, 26], ['badge', 'badge', 256, 14, 92, 24], ['line', 'line', 12, 62, 336, 8],
    ['bar', 'progress-bar', 12, 76, 204, 24], ['batt', 'battery', 228, 74, 120, 28], ['ring', 'progress-ring', 12, 110, 84, 84], ['arc', 'arc-gauge', 104, 110, 84, 84], ['status', 'status', 198, 112, 150, 24],
    ['step', 'stepper', 196, 142, 152, 44], ['sel', 'select', 12, 200, 176, 36], ['tri', 'shape', 316, 200, 32, 32], ['gap', 'spacer', 266, 200, 40, 32]]) {
    ids[k] = await add(t); await place(x, y, w, h);
  }
  await select(ids.dot); await setSel('shape', 'circle');
  await select(ids.tri); await setSel('shape', 'triangle');
  await E(({ P }) => { const f = document.querySelector(`${P} .ef-field[data-key="fill"]`); const i = f.querySelector('[data-k=color-pick]'); i.value = '#ff00aa'; i.dispatchEvent(new Event('input', { bubbles: true })); }, { P }); await wait(200);
  await select(null); await wait(150);
  const drawn = await E((S) => { const b = document.querySelector(`${S} [data-k=wst-board]`), q = (s) => b.querySelector(s);
    return { shape: q('.iqel-shape[data-shape="circle"] .iqel-shape__s') && getComputedStyle(q('.iqel-shape[data-shape="circle"] .iqel-shape__s')).borderTopLeftRadius,
      tri: q('.iqel-shape[data-shape="triangle"] .iqel-shape__s') && getComputedStyle(q('.iqel-shape[data-shape="triangle"] .iqel-shape__s')).clipPath,
      line: !!q('.iqel-line__l'), bar: q('.iqel-bar')?.getAttribute('aria-valuenow'), batt: q('.iqel-batt')?.getAttribute('aria-label'), ring: !!q('.iqel-gauge .iqg svg'), ringText: q('.iqel-gauge__v b')?.textContent,
      status: q('.iqel-status__t')?.textContent, lv: q('.iqel-lv')?.textContent, step: q('.iqc-step__v')?.textContent, sel: [...(q('.iqc-sel__s')?.options || [])].map((o) => o.textContent), panel: !!q('.iqel-panel[data-style="card"]'), spacer: !!q('.iqel-spacer') }; }, S);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'studio-toolbox.png') });
  check('ELEMENTS DRAW from the shared foundation: circle (50 %), triangle (clip-path), line, progress bar 62, battery 72 %, progress ring + value text (the shared gauge), status "Active", label + value, stepper "21.0", select (3 options), group panel, spacer',
    drawn.shape === '50%' && /polygon/.test(drawn.tri || '') && drawn.line && drawn.bar === '62' && /72%/.test(drawn.batt) && drawn.ring && drawn.ringText === '62' && /Active/.test(drawn.status) && /Label/.test(drawn.lv)
      && /^21[.,]0$/.test(drawn.step) && drawn.sel.length === 3 && drawn.panel && drawn.spacer, JSON.stringify(drawn));
  // ---------------------------------------------------------------- properties in the shared form
  await select(ids.bar);
  const barForm = await E((P) => ({ groups: [...document.querySelectorAll(`${P} details[data-group]`)].map((d) => d.dataset.group), prop: !!document.querySelector(`${P} .ef-field[data-key="binding.property"]`),
    propVal: document.querySelector(`${P} .ef-field[data-key="binding.property"] select`)?.value }), P);
  check('PROPERTIES (the shared form): Identity · Data (Property: None) · Appearance · Value · Preview value · Range · Layout — the progress bar starts with NO property', ['identity', 'look', 'format', 'data', 'range', 'layout'].every((g) => barForm.groups.includes(g)) && barForm.prop && barForm.propVal === '', JSON.stringify(barForm));
  // ---------------------------------------------------------------- NO MAGIC: steppers / selects press nothing on Home Assistant
  await page.click(`${S} [data-k=wst-board] .iqc-step .iqc-btn:last-child`, { force: true }).catch(() => {});
  const st = await state();
  check('NO MAGIC: every dropped element has no property and no binding; there are no data properties; nothing was sent to Home Assistant', st.def.components.every((c) => !c.binding) && st.def.properties.length === 0 && posts() === p0, JSON.stringify(st.def.components.filter((c) => c.binding)));

  // ---------------------------------------------------------------- THEME: the accent shape follows; the explicit one stays
  const fillOf = () => E((S) => { const b = document.querySelector(`${S} [data-k=wst-board]`); return { dot: getComputedStyle(b.querySelector('.iqel-shape[data-shape="circle"] .iqel-shape__s')).backgroundColor, tri: getComputedStyle(b.querySelector('.iqel-shape[data-shape="triangle"] .iqel-shape__s')).backgroundColor }; }, S);
  const f0 = await fillOf();
  await E(() => window.editor.themeStudio().apply('azure-home')); await wait(150);
  const f1 = await fillOf();
  check('THEME: the shape in the theme\'s accent turns Azure blue at once in the Studio canvas (no resize, no reopen); the custom #ff00aa triangle stays', f0.dot === 'rgb(255, 122, 26)' && f1.dot === 'rgb(26, 98, 232)' && f0.tri === 'rgb(255, 0, 170)' && f1.tri === 'rgb(255, 0, 170)', JSON.stringify({ f0, f1 }));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'studio-toolbox-azure.png') });
  await E(() => window.editor.themeStudio().apply('iniqdash')); await wait(150);

  // ---------------------------------------------------------------- LAYERS
  const layerNames = await E((S) => [...document.querySelectorAll(`${S} .wst__lyr`)].map((l) => l.querySelector('.wst__lyr-name b').textContent), S);
  check('LAYERS: every element listed, top first (the last added on top)', layerNames.length === 14 && layerNames[0] === 'Spacer1' && layerNames[13] === 'Group1', JSON.stringify(layerNames));
  await page.click(`${S} .wst__lyr[data-cid="${ids.batt}"] [data-k=wst-lyr]`); await wait(150);
  check('…click a layer selects that element (its Properties open)', (await state()).sel === ids.batt && /Battery1/.test(await E((P) => document.querySelector(`${P} [data-k=wst-pname]`).textContent, P)));
  await page.click(`${S} .wst__lyr[data-cid="${ids.badge}"] [data-k=wst-layer-hide]`); await wait(150);
  const hid = await E(({ S, id }) => { const n = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`); return { attr: n.hasAttribute('data-hidden'), op: getComputedStyle(n).opacity }; }, { S, id: ids.badge });
  check('HIDE: the badge is hidden (drawn faintly in Studio so it can still be selected)', hid.attr && Number(hid.op) < 0.5, JSON.stringify(hid));
  await page.click(`${S} .wst__lyr[data-cid="${ids.panel}"] [data-k=wst-layer-lock]`); await wait(150);
  // a click on the panel area (no other element there) selects nothing — the locked panel is not picked on the canvas
  const lbb = await (await page.$(`${S} [data-k=wst-layer]`)).boundingBox();
  await select(null);
  if (process.env.DIAG) console.log(await E(({ x, y }) => { const n = document.elementFromPoint(x, y); return n && n.className; }, { x: lbb.x + lbb.width * (352 / 360), y: lbb.y + lbb.height * (106 / 240) }));
  await page.mouse.click(lbb.x + lbb.width * (352 / 360), lbb.y + lbb.height * (106 / 240)); await wait(150);
  check('LOCK: the locked Group panel is not picked on the canvas (a click there selects nothing)', (await state()).sel === null, String((await state()).sel));
  // multi-select (Shift + click in Layers), align left, distribute, group
  await page.click(`${S} .wst__lyr[data-cid="${ids.ring}"] [data-k=wst-lyr]`);
  await page.click(`${S} .wst__lyr[data-cid="${ids.arc}"] [data-k=wst-lyr]`, { modifiers: ['Shift'] });
  await page.click(`${S} .wst__lyr[data-cid="${ids.status}"] [data-k=wst-lyr]`, { modifiers: ['Shift'] }); await wait(150);
  const multi = await E((P) => ({ title: document.querySelector(`${P} [data-k=wst-pname]`).textContent, n: document.querySelectorAll(`${P} .wst__mlist li`).length }), P);
  check('MULTI-SELECT (Shift + click): "3 elements" with the arrange tools', multi.title === '3 elements' && multi.n === 3, JSON.stringify(multi));
  await page.click(`${S} [data-k=wst-align-top]`); await wait(150);
  let c3 = await Promise.all([ids.ring, ids.arc, ids.status].map(comp));
  check('ALIGN TOP: the three share the top edge of the selection (110)', c3.every((c) => c.y === 110), JSON.stringify(c3.map((c) => c.y)));
  await page.click(`${S} [data-k=wst-dist-h]`); await wait(150);
  c3 = await Promise.all([ids.ring, ids.arc, ids.status].map(comp));
  const g1 = c3[1].x - (c3[0].x + c3[0].w), g2 = c3[2].x - (c3[1].x + c3[1].w);
  check('DISTRIBUTE HORIZONTALLY: equal gaps between them', Math.abs(g1 - g2) <= 1, JSON.stringify({ g1, g2 }));
  await page.click(`${S} [data-k=wst-group]`); await wait(150);
  await select(null); await page.click(`${S} .wst__lyr[data-cid="${ids.arc}"] [data-k=wst-lyr]`); await wait(150);
  const grp = (await state()).def.components.filter((c) => c.group).map((c) => c.id).sort();
  const selN = await E((P) => document.querySelector(`${P} [data-k=wst-pname]`).textContent, P);
  check('GROUP: the three carry one group; selecting one selects the group', grp.length === 3 && selN === '3 elements', JSON.stringify({ grp, selN }));
  // the group moves together (arrow key)
  const before = (await Promise.all([ids.ring, ids.arc, ids.status].map(comp))).map((c) => c.x);
  await page.focus(`${S} [data-k=wst-layer]`); await page.keyboard.press('ArrowRight'); await wait(150);
  const after = (await Promise.all([ids.ring, ids.arc, ids.status].map(comp))).map((c) => c.x);
  check('…and moves together (arrow key: all three +1 px)', after.every((x, i) => x === before[i] + 1), JSON.stringify({ before, after }));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'studio-layers.png') });

  // ---------------------------------------------------------------- SAVE (server) + reload
  await select(null); await page.fill(`${F('name')} input`, 'Toolbox demo'); await wait(150);
  const col = await E(() => window.IniqStudioLibrary.collections().find((c) => c.name === 'Toolbox').id);
  await page.selectOption(`${P} [data-k=wst-collection]`, col); await wait(100);
  const r1 = await E((S) => document.querySelector(S).studio.save(), S);
  check('SAVE: the server accepts the definition (new element types, locked / hidden / group)', r1 && r1.ok, JSON.stringify(r1));
  await page.click(`${S} [data-k=wst-close]`); await wait(300);
  await page.reload(); await page.waitForFunction(() => window.editor && window.IniqStudioLibrary); await wait(1500);
  const saved = await E((id) => window.IniqStudioLibrary.get(id).definition, r1.id);
  const sv = (k) => saved.components.find((c) => c.id === ids[k]);
  check('RELOAD: the badge is still hidden, the panel still locked, the three still one group, every element type kept', sv('badge').hidden === true && sv('panel').locked === true && ['ring', 'arc', 'status'].every((k) => sv(k).group === sv('ring').group)
    && saved.components.length === 14 && !saved.components.some((c) => c.binding), JSON.stringify(saved.components.map((c) => [c.type, c.hidden, c.locked, c.group])));

  // ---------------------------------------------------------------- on the dashboard, at four sizes, in two themes
  for (const [label, w, h] of [['MICRO', 2, 2], ['COMPACT', 3, 3], ['NORMAL', 6, 4], ['LARGE', 10, 7]]) {
    await E(({ id, w, h }) => { const m = window.editor.getModel(); m.pages[0].items = m.pages[0].items.filter((i) => i.id !== 'tbx'); m.pages[0].items.push({ id: 'tbx', type: 'studio', parent: null, config: { definition: id, entities: {} },
      layout: { desktop: { x: 1, y: 60, w, h }, tablet: { x: 1, y: 60, w: Math.min(w, 8), h }, mobile: { w: Math.min(w, 4), h } } }); const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join()); }, { id: r1.id, w, h });
    await wait(900);
    const fit = await E(() => { const g = document.querySelector('.ed-canvas [data-grid-id="tbx"] .stw'), R = g.getBoundingClientRect();
      const out = [...g.querySelectorAll('.stw__c:not([data-hidden])')].filter((c) => { const r = c.getBoundingClientRect(); return r.left < R.left - 1 || r.top < R.top - 1 || r.right > R.right + 1 || r.bottom > R.bottom + 1; }).length;
      return { out, n: g.querySelectorAll('.stw__c').length, badgeVisible: getComputedStyle(g.querySelector('.stw__c[data-ctype="badge"]')).visibility }; });
    check(`DASHBOARD ${label} (${w} × ${h}): all 14 elements inside the card (scaled, never moved), the hidden badge invisible`, fit.out === 0 && fit.n === 14 && fit.badgeVisible === 'hidden', JSON.stringify(fit));
    if (SHOTS && label === 'NORMAL') { await (await page.$('.ed-canvas [data-grid-id="tbx"]')).scrollIntoViewIfNeeded(); await (await page.$('.ed-canvas [data-grid-id="tbx"]')).screenshot({ path: path.join(SHOTS, 'studio-toolbox-dashboard.png') }); }
  }
  const dashDot = () => E(() => getComputedStyle(document.querySelector('.ed-canvas [data-grid-id="tbx"] .iqel-shape[data-shape="circle"] .iqel-shape__s')).backgroundColor);
  const d0 = await dashDot();
  await E(() => window.editor.themeStudio().apply('mint-garden')); await wait(150);
  check('DASHBOARD THEME: the accent shape follows Mint Garden at once', d0 === 'rgb(255, 122, 26)' && (await dashDot()) === 'rgb(24, 134, 79)', JSON.stringify([d0, await dashDot()]));
  await E(() => window.editor.themeStudio().apply('iniqdash')); await wait(150);
  check('no Home Assistant service call at all', posts() === p0);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
