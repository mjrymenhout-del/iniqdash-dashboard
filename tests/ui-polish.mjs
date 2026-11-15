/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// UI POLISH (the generated dashboards and the shared fixes), real server, the SIMULATED home:
//   1  Lights page: no heading per room — only the page title; every light is its own card, its name says the room when needed
//   2  Home: real sections only (presence, weather, heating, lights on, energy now, alarm, open & alerts, notifications, scenes) and
//      "My devices" as ONE container holding device tiles; Climate: the other units in ONE "My devices" container
//   3  Tabbed container: an empty tab is hidden while viewing, kept while editing; the first non-empty tab is selected
//   4  Energy Flow: readings that do not add up (a reversed grid) → a plain note naming the grid, no routes, no "self-powered" badge
//   5  Energy Flow settings (layout, labels, values, arrows, line colour) are kept by the configuration and saved
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: 8, h }, mobile: { w: 4, h } });
let L, B;
try {
  L = await live({ configureHa: false });
  B = await liveBrowser(L, { viewport: { width: 1400, height: 950 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  // ---- 1 + 2: the generator, from the simulated home
  const g = await E(async () => {
    const d = await (await fetch('api/ha_entities.php?fresh=1', { headers: { Accept: 'application/json', 'X-IniqDash-Simulated': '1' } })).json();
    const tpl = await (await fetch('assets/demo/iniqdash-demo.json')).json();
    const R = window.MaisonRegistry, areas = window.IniqGenerate.summary(d).areas.filter((a) => a.count).map((a) => a.id);
    const r = window.IniqGenerateDemo.build(d, R, { areas, template: tpl });
    const pg = (id) => r.dashboard.pages.find((x) => x.id === id);
    const lights = pg('lights'), home = pg('home'), clim = pg('climate');
    const kidsOf = (page, id) => page.items.filter((i) => i.parent === id);
    const v = window.MaisonModel.validate(r.dashboard, R);
    return { ok: v.ok, lightTexts: lights.items.filter((i) => i.type === 'text').map((i) => i.config.primary), lightCards: lights.items.filter((i) => i.type === 'light').length,
      roomNamed: lights.items.filter((i) => i.type === 'light').map((i) => i.config.name).filter((n) => / · /.test(n)).length,
      homeTypes: [...new Set(home.items.filter((i) => !i.parent).map((i) => i.type))], homeDevs: home.items.find((i) => i.id === 'h-devs'), homeDevKids: kidsOf(home, 'h-devs').map((i) => i.type),
      climDevs: !!clim.items.find((i) => i.id === 'c-devs' && i.type === 'container'), climKids: kidsOf(clim, 'c-devs').map((i) => i.type), looseClimate: clim.items.filter((i) => !i.parent && i.type === 'climate').length };
  });
  check('1 · Lights: only the page title as text (no heading per room); every light its own card; shared names get their room ("Bedroom · Ceiling light")',
    g.ok && g.lightTexts.join() === 'Lights' && g.lightCards >= 20 && g.roomNamed > 0, JSON.stringify({ texts: g.lightTexts, cards: g.lightCards, roomNamed: g.roomNamed }));
  check('2 · Home has real sections (presence, weather, heating, lights on, readings, alarm, notifications) and "My devices" is ONE container of device tiles; Climate groups the other units in ONE container (one loose dial only)',
    ['presence', 'weather', 'climategroup', 'activity', 'readings', 'alarm', 'inbox', 'container'].every((t) => g.homeTypes.includes(t)) && g.homeDevs && g.homeDevs.type === 'container' && g.homeDevs.config.title === 'My devices'
      && g.homeDevKids.length >= 2 && g.homeDevKids.every((t) => t === 'devicetile') && g.climDevs && g.climKids.length >= 3 && g.looseClimate === 1, JSON.stringify(g));
  // ---- 3 · tabs: an empty tab hidden while viewing, kept while editing
  const tabsDash = { version: 3, app: { id: 't', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
    { id: 'tb', type: 'tabs', config: { title: 'T', tabs: [{ id: 'empty', label: 'Empty' }, { id: 'full', label: 'Full' }, { id: 'more', label: 'More' }] }, layout: lay(1, 1, 8, 10) },
    { id: 'x1', type: 'text', parent: 'tb', tab: 'full', config: { variant: 'text', primary: 'In full', secondary: '' }, layout: { desktop: { x: 1, y: 1, w: 4, h: 2 }, tablet: { x: 1, y: 1, w: 4, h: 2 }, mobile: { w: 4, h: 2 } } },
    { id: 'x2', type: 'text', parent: 'tb', tab: 'more', config: { variant: 'text', primary: 'In more', secondary: '' }, layout: { desktop: { x: 1, y: 1, w: 4, h: 2 }, tablet: { x: 1, y: 1, w: 4, h: 2 }, mobile: { w: 4, h: 2 } } }] }] };
  const me = L.client(); await me.login();
  const tid = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Tabs', dashboard: tabsDash })).json()).entry.id;
  await p.goto(`${L.base}/?d=${tid}`); await p.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await wait(1200);
  const view = await E(() => ({ tabs: [...document.querySelectorAll('[data-grid-id="tb"] [role=tab]')].map((t) => [t.textContent.trim(), t.getAttribute('aria-selected')]) }));
  await E(() => window.editor.setEditing(true)); await wait(1000);
  const edit = await E(() => [...document.querySelectorAll('[data-grid-id="tb"] [role=tab]')].map((t) => t.textContent.trim()));
  check('3 · tabs: while viewing the empty tab is hidden and the first non-empty one is selected; while editing all three are there',
    view.tabs.map((t) => t[0]).join() === 'Full,More' && view.tabs[0][1] === 'true' && edit.join() === 'Empty,Full,More', JSON.stringify({ view, edit }));
  await E(() => window.editor.setEditing(false));
  // ---- 4 + 5 · energy
  const N = { sun: { id: 'sun', type: 'solar', entity: 'sensor.demo_energy_solar' }, net: { id: 'net', type: 'grid', entity: 'sensor.demo_energy_grid', positive: 'away' }, bat: { id: 'bat', type: 'battery', entity: 'sensor.demo_energy_battery' } };
  const eDash = { version: 3, app: { id: 'e', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
    { id: 'rev', type: 'energy', config: { name: 'Flows', variant: 'system', entity: 'sensor.demo_energy_house', nodes: [N.sun, N.net, N.bat], layout: 'expanded', showLabels: false, arrows: false, lineColor: 'info' }, layout: lay(1, 1, 8, 12) }] }] };
  const eid = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Energy', dashboard: eDash })).json()).entry.id;
  await p.goto(`${L.base}/?d=${eid}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(4500);
  const en = await E(() => { const r = document.querySelector('[data-grid-id="rev"] .iq-energy--sys'); return { note: r.querySelector('.iq-esys__note').textContent, self: !r.querySelector('.iq-esys__self').hidden,
    routes: r.energy.routes().length, labels: r.dataset.labels, chev: [...r.querySelectorAll('.iq-esys__chev')].filter((c) => c.style.display !== 'none').length, stroke: r.querySelector('.iq-esys__ln').style.stroke }; });
  check('4 · a reversed grid reading: the note names the grid and its sign setting; no routes; no "self-powered" badge', /grid reading looks reversed/i.test(en.note) && !en.self && en.routes === 0, JSON.stringify(en));
  await p.goto(`${L.base}/editor.html?d=${eid}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(600);
  const n5 = await E(() => window.MaisonRegistry.fullConfig('energy', { variant: 'system', entity: 'sensor.x', layout: 'weird', showLabels: 'no', lineColor: 'javascript:1', arrows: false }));
  const saved = await E(() => { const md = window.editor.getModel(); md.pages[0].items[0].config.spacing = 140; window.editor.setModel(md); return window.editor.save(); });
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 });
  const back = await E(() => window.editor.getModel().pages[0].items[0].config);
  check('5 · Energy Flow settings: layout / labels / arrows / line colour saved and reloaded (spacing up to 160 %); bad values dropped; labels off and arrows off reach the drawing',
    saved && back.layout === 'expanded' && back.showLabels === false && back.arrows === false && back.lineColor === 'info' && back.spacing === 140 && n5.layout === undefined && n5.showLabels === undefined && n5.lineColor === undefined && n5.arrows === false
      && en.labels === 'false' && en.chev === 0 && /info/.test(en.stroke), JSON.stringify({ back, n5, en }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('ui-polish test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
