/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// GENERATE A DASHBOARD from Home Assistant's areas (real editor, real server):
//   1  without Home Assistant: the generator says so and offers the simulated home; it lists the areas with their device counts
//   2  "Create" adds a NEW dashboard (the existing ones are untouched): Home (room tiles that open their page) + a page per chosen room,
//      made of standard widgets bound to that room's entities only; it is valid and opens in the viewer
//   3  areas left unticked get no page; nothing without an area is placed in a room ("Other" only when asked)
//   4  Pages → "Page for an area…" adds one room page to the CURRENT dashboard (one undo step)
//   5  the pure generator: a fake Home Assistant with areas + an entity without an area
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const mine = { version: 3, app: { id: 'mine', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'Mine', nav: true, items: [] }] };
  const myId = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'My own', dashboard: mine })).json()).entry.id;
  const myRev = (await (await me.send('GET', `/api/dashboards.php?id=${myId}`)).json()).revision;
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/editor.html?d=${myId}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(600);
  await E(() => window.editor.setEditing(true)); await wait(300);

  // ---- 1
  await p.click('[data-k=more]'); await p.click('[data-k=dashboards]'); await p.waitForSelector('[data-k=dash-generate]');
  await p.click('[data-k=dash-generate]');
  await p.waitForSelector('[data-k=gen-sim]', { timeout: 15000 });
  const noHa = await E(() => document.querySelector('[data-k=gen-body]').innerText);
  await p.click('[data-k=gen-sim]'); await p.waitForSelector('[data-k=gen-area]', { timeout: 15000 });
  const areas = await E(() => [...document.querySelectorAll('[data-k=gen-area]')].map((c) => ({ id: c.value, text: c.parentElement.textContent })));
  check('1 · without Home Assistant the generator says so and offers the simulated home; it lists the areas that have devices, with counts',
    /not connected/i.test(noHa) && areas.length >= 5 && areas.every((a) => /\d+ device/.test(a.text)), JSON.stringify(areas.slice(0, 4)));

  // ---- 2 · 3 : only the demo rooms "Living room", "Kitchen", "Bedroom"
  const keep = ['demo_living', 'demo_kitchen', 'demo_bedroom'];
  await E((keep) => document.querySelectorAll('[data-k=gen-area]').forEach((c) => { c.checked = keep.includes(c.value); }), keep);
  await p.fill('[data-k=gen-name]', 'Generated home');
  await p.selectOption('[data-k=gen-style]', 'simple'); await wait(300);            // this suite covers the Simple design (a page per room)
  await p.click('[data-k=gen-create]'); await wait(2500);
  await p.waitForURL((u) => /[?&]d=d[0-9a-f]{16}/.test(String(u)) && !String(u).includes(myId), { timeout: 20000 });
  await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(1500);
  const m = await E(() => window.editor.getModel());
  const list = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards;
  const pages = m.pages.map((x) => x.name);
  const home = m.pages[0];
  const tiles = home.items.filter((i) => i.type === 'roomtile');
  const living = m.pages.find((x) => x.name === 'Living room');
  const ents = JSON.stringify(living.items);
  check('2 · Create adds a NEW dashboard "Generated home" (the existing one is untouched): Home + one page per chosen room, standard widgets',
    list.some((d) => d.name === 'Generated home') && list.some((d) => d.id === myId) && pages[0] === 'Home' && pages.slice(1).sort().join() === 'Bedroom,Kitchen,Living room' && m.app.simulated === true,
    JSON.stringify({ pages, list: list.map((d) => d.name) }));
  check('…Home has a tile per room that opens its page; the Living room page has its light(s) and climate — only that room\'s entities',
    tiles.length === 3 && tiles.every((t) => m.pages.some((pg) => pg.id === t.config.interactions.tap.page)) && living.items.some((i) => i.type === 'light') && living.items.some((i) => i.type === 'climate')
    && /demo_living/.test(ents) && !/demo_kitchen_main|demo_bedroom/.test(ents), JSON.stringify(living.items.map((i) => [i.type, i.config.entity || i.config.name])).slice(0, 400));
  const after = (await (await me.send('GET', `/api/dashboards.php?id=${myId}`)).json()).revision;
  check('3 · unticked areas get no page (Office, Garden…); the user\'s own dashboard is unchanged', !pages.includes('Office') && !pages.includes('Garden') && after === myRev);
  // it renders: every page, no errors
  const rendered = [];
  for (const pg of m.pages) { await E((id) => window.editor.go(id), pg.id); await wait(800); rendered.push(await E(() => document.querySelectorAll('.ed-canvas .mg__item').length)); }
  check('…every generated page renders its widgets', rendered.every((n, i) => n === m.pages[i].items.length), JSON.stringify(rendered));

  // ---- 4 · add a page for an area to this (generated, simulated) dashboard
  await E(() => window.editor.setEditing(true)); await wait(300);
  const h0 = await E(() => window.editor.history());
  await E(() => document.querySelector('.ed-btn--pages').click()); await p.waitForSelector('[data-k=pages-add-area]');
  await p.click('[data-k=pages-add-area]'); await p.waitForSelector('[data-k=pages-area]:not([hidden])');
  await p.selectOption('[data-k=pages-area]', 'demo_office'); await wait(1500);
  const m2 = await E(() => window.editor.getModel());
  const office = m2.pages.find((x) => x.name === 'Office');
  check('4 · Pages → "Page for an area…" adds the Office page to this dashboard with its devices (undo-able)', !!office && office.items.length > 2 && JSON.stringify(await E(() => window.editor.history())) !== JSON.stringify(h0), JSON.stringify(office && office.items.map((i) => i.type)));
  await p.keyboard.press('Escape'); await wait(200); await p.keyboard.press('Control+z'); await wait(600);
  check('…and Undo removes it again', !(await E(() => window.editor.getModel())).pages.some((x) => x.name === 'Office'));

  // ---- 5 · the pure generator against a real-looking discovery: an entity without an area is never put in a room
  const g = await E(() => {
    const d = { entities: [{ id: 'light.a', domain: 'light', name: 'Hall light', areaId: 'hall' }, { id: 'light.loose', domain: 'light', name: 'Loose lamp', areaId: null },
      { id: 'sensor.t', domain: 'sensor', name: 'Hall temperature', dc: 'temperature', areaId: 'hall' }, { id: 'sensor.x', domain: 'sensor', name: 'Uptime', dc: null, areaId: 'hall' },
      { id: 'person.a', domain: 'person', name: 'A' }], areas: [{ id: 'hall', name: 'Hall' }, { id: 'attic', name: 'Attic' }] };
    const a = window.IniqGenerate.dashboard(d, window.MaisonRegistry, {});
    const b = window.IniqGenerate.dashboard(d, window.MaisonRegistry, { other: true });
    const v = window.MaisonModel.validate(structuredClone(b.dashboard), window.MaisonRegistry);
    return { a: a.dashboard.pages.map((x) => x.name), b: b.dashboard.pages.map((x) => x.name), hall: JSON.stringify(a.dashboard.pages[1].items), ok: v.ok, err: v.ok ? '' : v.errors.slice(0, 3).join('; ') };
  });
  check('5 · generator: empty areas are left out; an entity without an area appears only on "Other" (when asked); unsupported sensors are skipped; the result is valid',
    g.a.join() === 'Home,Hall' && g.b.join() === 'Home,Hall,Other' && !/light\.loose|sensor\.x/.test(g.hall) && /sensor\.t/.test(g.hall) && g.ok, JSON.stringify(g).slice(0, 500));
  if (process.env.SHOT) { await E((id) => { window.editor.setEditing(false); window.editor.go(id); }, living.id); await wait(1500); await p.screenshot({ path: `${process.env.SHOT}-room.png` });
    await E(() => window.editor.go('home')); await wait(1500); await p.screenshot({ path: `${process.env.SHOT}-home.png` }); }
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('generate-dashboard test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
