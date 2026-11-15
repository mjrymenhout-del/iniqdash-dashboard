/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ORGANISE THE GALLERY (Add widget → Organise), real editor, real server:
//   1  a new category; a widget moved into it is listed there (first); one marked "Not wanted" leaves the gallery
//   2  the arrangement is an application setting on the server: it survives a reload
//   3  "Show not wanted" lists the hidden ones under "Not wanted"; Export downloads the list (JSON) with every widget's category
//   4  rename and delete a category (its widgets go back to their own); Reset puts everything back
//   5  the server refuses a malformed arrangement (markup in a name, an unknown category, a bad key)
import fs from 'node:fs';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live({ configureHa: false });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  const answers = [];
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? answers.shift() || '' : undefined));
  const openAdd = async () => { await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await p.waitForSelector('.ecfg-tile[data-type=light]'); };
  const organise = async () => { await p.click('[data-k=org-toggle]'); await p.waitForSelector('[data-k=org-bar]:not([hidden])'); };
  const saved = () => p.waitForFunction(() => /Saved/.test(document.querySelector('[data-k=org-status]')?.textContent || ''), null, { timeout: 8000 });
  await E(() => window.editor.setEditing(true)); await wait(400);

  // ---- 1
  await openAdd(); await organise();
  answers.push('My favourites'); await p.click('[data-k=org-new]'); await saved();
  const cat = await E(() => document.querySelector('.ecfg-tgroup--mine')?.dataset.category);
  await p.selectOption('[data-k=org-move][data-for=light]', cat); await saved();
  await p.selectOption('[data-k=org-move][data-for=gauge]', '_hidden'); await saved();
  const g1 = await E(() => ({ first: document.querySelector('.ecfg-tgroup')?.dataset.category, mine: [...document.querySelectorAll('.ecfg-tgroup--mine [data-type]')].map((t) => t.dataset.type),
    gauge: !!document.querySelector('.ecfg-tile[data-type=gauge]'), lightElsewhere: document.querySelectorAll('.ecfg-tile[data-type=light]').length }));
  check('1 · a new category is listed first and holds the widget moved into it (only there); a widget marked "Not wanted" leaves the gallery',
    /^u-/.test(cat) && g1.first === cat && g1.mine.join() === 'light' && g1.lightElsewhere === 1 && !g1.gauge, JSON.stringify(g1));

  // ---- 2 · the server keeps it
  const c = L.client(); await c.login();
  const srv = (await (await c.send('GET', '/api/dashboards.php')).json()).settings.gallery;
  await p.reload(); await p.waitForFunction(() => window.editor); await E(() => window.editor.setEditing(true)); await wait(400);
  await openAdd();
  const g2 = await E(() => ({ head: document.querySelector('.ecfg-tgroup--mine h4')?.textContent, mine: [...document.querySelectorAll('.ecfg-tgroup--mine .ecfg-tile')].map((t) => t.dataset.type), gauge: !!document.querySelector('.ecfg-tile[data-type=gauge]') }));
  check('2 · the arrangement is stored on the server (application settings) and is the same after a reload',
    srv && srv.categories[0].name === 'My favourites' && srv.assign.light === cat && srv.hidden.includes('gauge') && g2.head === 'My favourites' && g2.mine.join() === 'light' && !g2.gauge, JSON.stringify({ srv, g2 }));

  // ---- 3 · show not wanted · export
  await organise(); await p.click('[data-k=org-hidden]'); await wait(300);
  const hid = await E(() => [...document.querySelectorAll('.ecfg-tgroup--hidden [data-type]')].map((t) => t.dataset.type));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-k=org-export]')]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const w = (k) => data.widgets.find((x) => x.key === k) || {};
  check('3 · "Show not wanted" lists the hidden widgets under "Not wanted"; Export downloads every widget with its category (and the arrangement)',
    hid.join() === 'gauge' && data.kind === 'iniqdash-widget-arrangement' && w('light').category === 'My favourites' && w('gauge').category === 'Not wanted' && data.widgets.length > 20 && data.arrangement.categories.length === 1,
    JSON.stringify({ hid, n: data.widgets.length, light: w('light'), gauge: w('gauge') }));

  // ---- 4 · rename · delete · reset
  answers.push('Favourites'); await p.click(`[data-k=org-rename][data-cat="${cat}"]`); await saved();
  const renamed = await E(() => document.querySelector('.ecfg-tgroup--mine h4')?.textContent);
  await p.click(`[data-k=org-delete][data-cat="${cat}"]`); await saved();
  const afterDel = await E(() => ({ mine: document.querySelectorAll('.ecfg-tgroup--mine').length, lightCat: document.querySelector('.ecfg-tile[data-type=light]')?.closest('.ecfg-tgroup')?.dataset.category }));
  await p.click('[data-k=org-reset]'); await saved();
  const srv2 = (await (await c.send('GET', '/api/dashboards.php')).json()).settings.gallery;
  check('4 · a category can be renamed and deleted (its widgets go back to their own category); Reset clears the arrangement',
    /^Favourites/.test(renamed) && afterDel.mine === 0 && afterDel.lightCat === 'controls' && srv2 && !srv2.categories.length && !srv2.hidden.length, JSON.stringify({ renamed, afterDel, srv2 }));

  // ---- 5 · server validation
  const bad = async (g) => (await (await c.post('/api/dashboards.php', { action: 'settings', gallery: g })).json()).ok;
  const r5 = [await bad({ categories: [{ id: 'u-a1', name: '<b>x</b>' }] }), await bad({ categories: [], assign: { light: 'u-nope' } }), await bad({ categories: [], hidden: ['../x'] }),
    await bad({ categories: [{ id: 'u-a1', name: 'Fine' }], assign: { light: 'u-a1' }, hidden: ['gauge'] })];
  check('5 · the server refuses a malformed arrangement (markup in a name, an unknown category, a bad key) and accepts a good one', r5.join() === 'false,false,false,true', JSON.stringify(r5));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('gallery-organise test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
