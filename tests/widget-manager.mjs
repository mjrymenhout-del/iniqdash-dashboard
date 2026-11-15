/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// MANAGE WIDGETS + the RETIRED example collections, real server and editor:
//   1  an installation from an older version ("Maison demo", "Studio Examples", "Test Me" collections, a widgets/custom/testme package):
//      on the first load the three collections are removed; their unused widgets are deleted; a widget a dashboard places is KEPT
//      (moved to IniqDash) and that dashboard still opens; the unused testme package folder is removed; the report is shown once
//   2  an unrelated collection ("Garden examples") is untouched
//   3  Manage widgets: new collection, rename, move widgets, delete several (a used one is kept), counts and "on N dashboards"
//   4  delete a collection: "only" (its widgets move to IniqDash) and "with its widgets"
//   5  the gallery shows the changes at once; everything is the same after a reload
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PKG = path.join(ROOT, 'widgets/custom/testme');
const def0 = JSON.parse(fs.readFileSync(new URL('./fixtures/maison-demo.widgets.json', import.meta.url), 'utf8')).widgets[0].definition;
let L, B;
try {
  // a leftover "Test Me" PACKAGE from an older version (a copy of the test fixture)
  fs.cpSync(path.join(ROOT, 'tests/fixtures/custom/testme'), PKG, { recursive: true });
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const api = async (body) => (await me.post('/api/studio_widgets.php', body)).json();
  const col = async (name) => (await api({ action: 'create_collection', name })).collection.id;
  const widget = async (name, collection) => { const d = structuredClone(def0); d.meta.name = name; d.meta.collection = collection; return (await api({ action: 'save', id: null, definition: d })).widget.id; };
  const cMaison = await col('Maison demo'), cExamples = await col('Studio Examples'), cTest = await col('test-me'), cGarden = await col('Garden examples');
  const wUsed = await widget('Room card (used)', cMaison), wGone1 = await widget('Who is home', cMaison), wGone2 = await widget('Sample tile', cExamples), wGone3 = await widget('Test tile', cTest);
  const wGarden = await widget('Garden tile', cGarden);
  // a dashboard that places the "used" widget (and nothing else)
  const dash = { version: 3, app: { id: 'u', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ id: 's1', type: 'studio', config: { definition: wUsed, entities: {} }, layout: { desktop: { x: 1, y: 1, w: 4, h: 4 }, tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } }] }] };
  const dashId = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Uses a Maison widget', dashboard: dash })).json()).entry.id;

  // the installation as an older version left it: the clean-up has not run yet (signing in above already loaded a page)
  fs.rmSync(path.join(L.priv, 'studio-widgets', 'retired-collections.json'), { force: true });
  fs.cpSync(path.join(ROOT, 'tests/fixtures/custom/testme'), PKG, { recursive: true });

  // ---- 1 · 2 · the first load cleans up
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  const lib = async () => (await (await me.send('GET', '/api/studio_widgets.php?usage=1')).json());
  let s = await lib();
  const names = s.collections.map((c) => c.name).sort();
  const ids = new Set(s.widgets.map((w) => w.id));
  const used = s.widgets.find((w) => w.id === wUsed);
  check('1 · first load: "Maison demo", "Studio Examples" and "test-me" are removed; their unused widgets deleted; the widget a dashboard uses is kept (moved to IniqDash)',
    names.join() === 'Garden examples' && !ids.has(wGone1) && !ids.has(wGone2) && !ids.has(wGone3) && used && used.definition.meta.collection === 'iniqdash' && s.retired && s.retired.collections.length === 3,
    JSON.stringify({ names, kept: used && used.definition.meta.collection, report: s.retired }));
  check('…the unused leftover "Test Me" package folder (widgets/custom/testme) is removed; an unrelated collection ("Garden examples") and its widget stay',
    !fs.existsSync(PKG) && ids.has(wGarden) && (s.retired.packages || []).some((x) => x.id === 'testme' && x.removed), JSON.stringify(s.retired.packages));
  const d2 = await (await me.send('GET', `/api/dashboards.php?id=${dashId}`)).json();
  check('…the dashboard that uses a kept widget is unchanged (it still names the same widget, which still exists)', d2.ok && d2.dashboard.pages[0].items[0].config.definition === wUsed && ids.has(wUsed));

  // ---- 3 · Manage widgets (from Add widget)
  const answers = [];
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? answers.shift() || '' : undefined));
  await E(() => window.editor.setEditing(true)); await wait(400);
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await p.waitForSelector('[data-k=manage-widgets]'); await p.click('[data-k=manage-widgets]');
  await p.waitForSelector('.iq-wm [data-k=wm-col]'); await wait(800);
  const rep = await E(() => document.querySelector('[data-k=wm-retired]')?.innerText || '');
  const first = await E(() => ({ cols: [...document.querySelectorAll('.iq-wm__col:not(.is-package) .iq-wm__colname b')].map((b) => b.textContent), used: document.querySelector(`.iq-wm__w[data-w] [data-k=wm-used]`)?.textContent }));
  check('3a · Manage widgets lists IniqDash and the user\'s collections with counts, marks a widget used on a dashboard, and reports the clean-up',
    first.cols.join() === 'IniqDash,Garden examples' && /on 1 dashboard/.test(first.used || '') && /Maison demo/.test(rep) && /kept in IniqDash/.test(rep), JSON.stringify({ first, rep }));
  answers.push('Favourites'); await p.click('[data-k=wm-new-col]'); await wait(1200);
  answers.push('My favourites'); await p.click('.iq-wm__col[data-col] [data-k=wm-rename]'); await wait(1200);
  s = await lib();
  const fav = s.collections.find((c) => c.name === 'My favourites');
  check('3b · a new collection can be created and renamed (stored on the server)', !!fav && !s.collections.some((c) => c.name === 'Favourites'), JSON.stringify(s.collections));
  // move the Garden widget and the kept widget into "My favourites"
  await p.click('.iq-wm__col[data-col="iniqdash"] [data-k=wm-col]'); await wait(300);
  await p.check(`[data-k=wm-tick][data-w="${wUsed}"]`); await wait(200);
  await p.selectOption('[data-k=wm-move-to]', fav.id); await p.click('[data-k=wm-move]'); await wait(1200);
  await p.click(`.iq-wm__col[data-col="${(s.collections.find((c) => c.name === 'Garden examples') || {}).id}"] [data-k=wm-col]`); await wait(300);
  await p.check('[data-k=wm-all]'); await p.selectOption('[data-k=wm-move-to]', fav.id); await p.click('[data-k=wm-move]'); await wait(1200);
  s = await lib();
  const inFav = s.widgets.filter((w) => w.definition.meta.collection === fav.id).map((w) => w.id).sort();
  check('3c · widgets move between collections (one, or all ticked)', inFav.join() === [wUsed, wGarden].sort().join(), JSON.stringify(inFav));
  // delete both ticked: the used one is kept
  await p.click(`.iq-wm__col[data-col="${fav.id}"] [data-k=wm-col]`); await wait(300);
  await p.check('[data-k=wm-all]'); await p.click('[data-k=wm-delete]'); await wait(1200);
  const st = await E(() => document.querySelector('[data-k=wm-status]').textContent);
  s = await lib();
  check('3d · deleting several widgets deletes the unused one and KEEPS the one a dashboard uses (and says where)', !s.widgets.some((w) => w.id === wGarden) && s.widgets.some((w) => w.id === wUsed) && /kept: used on Uses a Maison widget/.test(st), st);

  // ---- 4 · delete a collection: only, then with widgets
  await p.click(`.iq-wm__col[data-col="${fav.id}"] [data-k=wm-delete-col]`); await wait(200);
  await p.check('[data-k=wm-mode-keep]'); await p.click('[data-k=wm-confirm-delete]'); await wait(1200);
  s = await lib();
  const garden = s.collections.find((c) => c.name === 'Garden examples');
  check('4a · "Delete the collection only": the collection goes, its widgets move to IniqDash', !s.collections.some((c) => c.id === fav.id) && s.widgets.find((w) => w.id === wUsed).definition.meta.collection === 'iniqdash', JSON.stringify(s.collections));
  const extra = await widget('Spare', garden.id); await E(() => window.IniqStudioLibrary.refresh()); await wait(400);
  await p.click('[data-k=wm-close]'); await wait(300);
  await p.click('[data-k=manage-widgets]'); await p.waitForSelector('.iq-wm [data-k=wm-col]'); await wait(800);
  await p.click(`.iq-wm__col[data-col="${garden.id}"] [data-k=wm-delete-col]`); await wait(200);
  await p.check('[data-k=wm-mode-widgets]'); await p.click('[data-k=wm-confirm-delete]'); await wait(1200);
  s = await lib();
  check('4b · "Delete the collection and its widgets": both are gone', !s.collections.some((c) => c.id === garden.id) && !s.widgets.some((w) => w.id === extra), JSON.stringify({ c: s.collections, w: s.widgets.map((w) => w.id) }));

  // ---- 5 · the gallery and a reload
  await p.click('[data-k=wm-close]'); await wait(400);
  const gallery = await E(() => [...document.querySelectorAll('[data-filter=collection] option')].map((o) => o.textContent));
  await p.reload(); await p.waitForFunction(() => window.editor); await wait(600);
  const after = await E(() => ({ cols: window.IniqStudioLibrary.collections().map((c) => c.name), kept: window.IniqStudioLibrary.get(window.editor ? (window.IniqStudioLibrary.list()[0] || {}).id : '') }));
  s = await lib();
  check('5 · the gallery is refreshed at once (no removed collection offered) and a reload shows the same library; the clean-up does not run again',
    !gallery.some((g) => /Maison|Examples|test|Garden|favourites/i.test(g)) && after.cols.length === 0 && s.widgets.length === 1 && s.retired.at === (await lib()).retired.at, JSON.stringify({ gallery, after: after.cols }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('widget-manager test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
  fs.rmSync(PKG, { recursive: true, force: true });
}
console.log('finished');
