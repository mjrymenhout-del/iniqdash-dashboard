/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// TO-DO, UPDATES and HUMIDIFIER (real server, the SIMULATED home — no real Home Assistant is contacted):
//   1  To-do: two lists as tabs, open items listed, the completed one folded away; a missing list says so
//   2  To-do: ticking an item completes it in Home Assistant (the list's count drops; the item moves to "done"); adding an item adds it
//   3  Updates: two waiting, one up to date (folded); the FIRST Install tap only asks again (nothing installed), with "Backup first"
//      only where the update supports a backup; the second tap installs
//   4  Humidifier: current / target humidity; + raises the target in Home Assistant; a mode chip; the power switch
//   5  the server refuses what is not allowed (install an up-to-date entity, humidity outside the device's range, tick an unknown item)
//   6  the configurations: saved, reloaded; wrong entities dropped
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const L6 = (x, h, ty) => ({ desktop: { x, y: 1, w: 4, h }, tablet: { x: 1, y: ty, w: 6, h }, mobile: { w: 4, h } });
const dash = { version: 3, app: { id: 'g', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'td', type: 'todo', config: { name: 'Lists', lists: ['todo.demo_shopping', 'todo.demo_chores', 'todo.no_such_list'] }, layout: L6(1, 12, 1) },
  { id: 'up', type: 'updates', config: { name: 'Updates', units: ['update.demo_core', 'update.demo_router', 'update.demo_hallway_sensor'] }, layout: L6(5, 10, 14) },
  { id: 'hu', type: 'humidifier', config: { unit: 'humidifier.demo_bedroom' }, layout: L6(9, 10, 25) }] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Lists', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1400, height: 900 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-grid-id="td"] .iq-todo__item').length >= 3, null, { timeout: 15000 }).catch(() => {});
  await wait(500);
  const st = (ids) => E(async (ids) => { await new Promise((r) => setTimeout(r, 2500)); return Object.fromEntries(ids.map((i) => { const e = window.IniqHA.get(i); return [i, e ? { s: e.state, a: e.attrs } : null]; })); }, ids);
  const todo = () => E(() => { const r = document.querySelector('[data-grid-id="td"] .iq-todo'); return { tabs: [...r.querySelectorAll('.iq-todo__tab')].map((t) => [t.textContent, t.getAttribute('aria-selected')]),
    open: [...r.querySelectorAll('.iq-todo__list .iq-todo__text')].map((x) => x.textContent), fold: r.querySelector('.iq-todo__fold').hidden ? '' : r.querySelector('.iq-todo__fold').textContent,
    count: r.querySelector('.iq-todo__count').textContent, msg: r.querySelector('.iq-todo__msg').hidden ? '' : r.querySelector('.iq-todo__msg').textContent, add: !r.querySelector('.iq-todo__add').hidden }; });
  const t1 = await todo();
  await E(() => document.querySelectorAll('[data-grid-id="td"] .iq-todo__tab')[2].click());
  const t1c = await todo();
  await E(() => document.querySelectorAll('[data-grid-id="td"] .iq-todo__tab')[0].click());
  check('1 · To-do: three tabs; the shopping list\'s open items (Milk, Bread, Apples), "Show 1 done", Add offered; the missing list says so',
    t1.tabs.length === 3 && t1.open.join() === 'Milk,Bread,Apples' && /Show 1 done/.test(t1.fold) && t1.add && t1.count === '3 to do' && /not found|unavailable/i.test(t1c.msg) && !t1c.add, JSON.stringify({ t1, t1c }));
  await E(() => [...document.querySelectorAll('[data-grid-id="td"] .iq-todo__item')].find((li) => li.textContent.includes('Milk')).querySelector('.iq-todo__tick').click());
  const s2 = await st(['todo.demo_shopping']);
  await p.waitForFunction(() => !/Milk/.test([...document.querySelectorAll('[data-grid-id="td"] .iq-todo__list .iq-todo__text')].map((x) => x.textContent).join()), null, { timeout: 8000 }).catch(() => {});
  await p.fill('[data-grid-id="td"] .iq-todo__add input', 'Eggs');
  await p.click('[data-grid-id="td"] .iq-todo__add button');
  const s2b = await st(['todo.demo_shopping']);
  await p.waitForFunction(() => /Eggs/.test(document.querySelector('[data-grid-id="td"] .iq-todo__list').textContent), null, { timeout: 8000 }).catch(() => {});
  await wait(1500);
  const t2 = await todo();
  check('2 · ticking Milk completes it in Home Assistant (3 → 2 open) and folds it into "done"; adding Eggs adds it (2 → 3 open)',
    s2['todo.demo_shopping'].s === '2' && s2b['todo.demo_shopping'].s === '3' && !t2.open.includes('Milk') && t2.open.includes('Eggs') && /Show 2 done/.test(t2.fold), JSON.stringify({ s2: s2['todo.demo_shopping'].s, s2b: s2b['todo.demo_shopping'].s, t2 }));
  // ---- updates
  const upd = () => E(() => { const r = document.querySelector('[data-grid-id="up"] .iq-upd'); return { sum: r.querySelector('.iq-upd__sum').textContent, rows: [...r.querySelectorAll('.iq-upd__list .iq-upd__item')].map((li) => [li.dataset.entity, li.dataset.state, li.querySelector('.iq-upd__info span').textContent,
    [...li.querySelectorAll('button')].map((b) => b.textContent).join('/'), !!li.querySelector('.iq-upd__bk')]), fold: r.querySelector('.iq-upd__fold').hidden ? '' : r.querySelector('.iq-upd__fold').textContent }; });
  const u1 = await upd();
  await E(() => document.querySelector('[data-grid-id="up"] .iq-upd__item[data-entity="update.demo_core"] .iq-upd__btn').click());
  const u1b = await upd();
  const s3a = await st(['update.demo_core']);
  await E(() => document.querySelector('[data-grid-id="up"] .iq-upd__item[data-entity="update.demo_router"] .iq-upd__btn').click());
  const u1c = await upd();
  await E(() => [...document.querySelectorAll('[data-grid-id="up"] .iq-upd__item[data-entity="update.demo_router"] .iq-upd__btn')].find((b) => b.textContent === 'Install now').click());
  const s3b = await st(['update.demo_core', 'update.demo_router']);
  check('3 · Updates: 2 waiting (versions shown), 1 up to date folded; the first Install tap only asks again (core: "Backup first" offered, still waiting in HA); the router\'s second tap installs it (no backup offered)',
    u1.sum === '2 available' && u1.rows.length === 2 && /2026\.10\.4 → 2026\.11\.1/.test(u1.rows[0][2]) && /Show 1 up to date/.test(u1.fold) && u1b.rows[0][3] === 'Cancel/Install now' && u1b.rows[0][4] === true
    && s3a['update.demo_core'].s === 'on' && u1c.rows.find((r) => r[0] === 'update.demo_router')[4] === false && u1c.rows.find((r) => r[0] === 'update.demo_core')[3] === 'Install'
    && s3b['update.demo_router'].s === 'off' && s3b['update.demo_router'].a.installed_version === '7.3.1' && s3b['update.demo_core'].s === 'on', JSON.stringify({ u1, u1b, u1c, s3a, s3b: Object.fromEntries(Object.entries(s3b).map(([k, v]) => [k, v.s])) }));
  // ---- humidifier
  const hum = () => E(() => { const r = document.querySelector('[data-grid-id="hu"] .iq-hum'); return { name: r.querySelector('.iq-hum__name').textContent, st: r.querySelector('.iq-hum__st').textContent, val: r.querySelector('.iq-hum__val b').textContent,
    tgt: r.querySelector('.iq-hum__tgt').textContent, modes: [...r.querySelectorAll('.iq-hum__chip')].map((b) => b.textContent), on: r.dataset.on }; });
  const h1 = await hum();
  await p.click('[data-grid-id="hu"] .iq-hum__s[data-d="1"]');
  await E(() => [...document.querySelectorAll('[data-grid-id="hu"] .iq-hum__chip')].find((b) => b.textContent === 'eco').click());
  const s4 = await st(['humidifier.demo_bedroom']);
  await p.click('[data-grid-id="hu"] .iq-hum__pw');
  const s4b = await st(['humidifier.demo_bedroom']);
  const h2 = await hum();
  check('4 · Humidifier: 41% now, target 45%, its four modes; + → target 46% in HA, the eco chip → mode eco, the switch → off',
    h1.name === 'Bedroom humidifier' && h1.val === '41%' && h1.tgt === 'Target 45%' && h1.modes.join() === 'normal,eco,sleep,boost' && h1.on === 'true'
    && s4['humidifier.demo_bedroom'].a.target_humidity === 46 && s4['humidifier.demo_bedroom'].a.mode === 'eco' && s4b['humidifier.demo_bedroom'].s === 'off' && h2.on === 'false', JSON.stringify({ h1, h2, a: s4['humidifier.demo_bedroom'].a, s: s4b['humidifier.demo_bedroom'].s }));
  const refused = await E(async () => Promise.all([window.IniqHA.call('update.demo_hallway_sensor', 'install', ''), window.IniqHA.call('humidifier.demo_bedroom', 'set_humidity', 95),
    window.IniqHA.call('todo.demo_shopping', 'complete_item', 'no-such-uid'), window.IniqHA.call('todo.demo_shopping', 'add_item', '<b>x</b>')]).then((l) => l.map((r) => [r.ok, r.error])));
  check('5 · the server refuses: installing an up-to-date entity, a humidity outside 30–70 %, ticking an unknown item, an item with markup', refused.every((r) => r[0] === false), JSON.stringify(refused));
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(500);
  const n6 = await E(() => ({ td: window.MaisonRegistry.fullConfig('todo', { lists: ['todo.a', 'light.b', 'todo.a'], showDone: 'x' }), up: window.MaisonRegistry.fullConfig('updates', { units: ['update.a', 'sensor.b'], upToDate: 'hide' }),
    hu: window.MaisonRegistry.fullConfig('humidifier', { unit: 'light.x', step: 50 }) }));
  const saved = await E(() => { const md = window.editor.getModel(); md.pages[0].items[0].config.showDone = 'show'; md.pages[0].items[2].config.step = 5; window.editor.setModel(md); return window.editor.save(); });
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 });
  const back = await E(() => window.editor.getModel().pages[0].items.map((x) => x.config));
  check('6 · saved and reloaded (show done, step 5); wrong entities, a duplicate and bad options are dropped', saved && back[0].showDone === 'show' && back[2].step === 5 && back[1].units.length === 3
    && JSON.stringify(n6.td.lists) === '["todo.a"]' && n6.td.showDone === undefined && JSON.stringify(n6.up.units) === '["update.a"]' && n6.up.upToDate === 'hide' && n6.hu.unit === undefined && n6.hu.step === undefined, JSON.stringify({ back, n6 }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('todo-updates-humidifier test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
