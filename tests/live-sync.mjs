/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// LIVE SYNC + WALL TABLET (real server, two browser windows):
//   1  the server's revision answer: a few bytes ({ ok, revision, build }), 404 for an unknown dashboard
//   2  a wall tablet VIEWING the dashboard picks up a save made in another window by itself (no reload), and stays on its page
//   3  the same browser: a second tab is told at once (BroadcastChannel) — no waiting for the next check
//   4  a screen that is EDITING (or has unsaved work) is never replaced — the save waits for it
//   5  wall settings (Dashboard settings → Wall tablet), saved: a popup closes after N seconds without a touch, the screen goes back to
//      the start page after N minutes, the screensaver covers the screen; a touch wakes it and does NOT reach the widget under it
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const t = (id, text, y) => ({ id, type: 'text', parent: null, config: { variant: 'text', primary: text }, layout: { desktop: { x: 1, y, w: 6, h: 2 } } });
const dash = { version: 3, app: { id: 's', startPage: 'home', navigation: {} }, pages: [
  { id: 'home', name: 'Home', nav: true, items: [t('t1', 'First version', 1), { id: 'btn', type: 'button', parent: null, config: { text: 'Open', action: 'popup', popup: 'pop' }, layout: { desktop: { x: 7, y: 1, w: 3, h: 2 } } }] },
  { id: 'two', name: 'Two', nav: true, items: [t('t2', 'Page two', 1)] }],
  popups: [{ id: 'pop', name: 'Pop', items: [t('pt', 'In the popup', 1)] }] };

let L, B, B2;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const created = await (await me.post('/api/dashboards.php', { action: 'create', name: 'Sync', dashboard: dash })).json();
  if (!created.ok) throw new Error(JSON.stringify(created));
  const id = created.entry.id;
  // ---- 1
  const r1 = await (await me.send('GET', `/api/dashboards.php?rev=${id}`)).json();
  const r404 = await me.send('GET', '/api/dashboards.php?rev=d0000000000000000');
  check('1 · the revision answer is tiny ({ ok, revision, build }); an unknown dashboard is 404', r1.ok && r1.revision === created.entry.revision && /^[0-9a-f]{16}$/.test(r1.build) && Object.keys(r1).length === 3 && r404.status === 404, JSON.stringify(r1));

  B = await liveBrowser(L, { viewport: { width: 1280, height: 800 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}&sync=5`); await p.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await wait(800);
  await E(() => window.editor.go('two')); await wait(400);
  // ---- 2 · another window (a separate client) saves
  const cur = await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json();
  const m2 = structuredClone(cur.dashboard); m2.pages[1].items[0].config.primary = 'Changed elsewhere';
  const sv = await (await me.post('/api/dashboards.php', { action: 'save', id, revision: cur.revision, dashboard: m2 })).json();
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('.ed-canvas [data-grid-id="t2"]')?.textContent.includes('Changed elsewhere'), null, { timeout: 15000 }).catch(() => {});
  const got = await E(() => ({ text: document.querySelector('.ed-canvas [data-grid-id="t2"]')?.textContent || '', page: window.editor.navigation().current, url: location.href }));
  check('2 · the viewing screen picked up the save by itself within one check (no reload) and stayed on its page', sv.ok && got.text.includes('Changed elsewhere') && got.page === 'two' && Date.now() - t0 < 12000, JSON.stringify({ sv: sv.ok, got, ms: Date.now() - t0 }));

  // ---- 3 · a second tab of the SAME browser saves through its editor: the first tab is told at once
  const p2 = await B.ctx.newPage();
  await p2.goto(`${L.base}/editor.html?d=${id}&sync=600`); await p2.waitForFunction(() => window.editor, null, { timeout: 20000 }); await p2.waitForTimeout(600);
  await p.evaluate(() => { window.__t = 0; });
  await p.goto(`${L.base}/?d=${id}&sync=600`); await p.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await wait(800);
  await p2.evaluate(() => { window.editor.setEditing(true); const md = window.editor.getModel(); md.pages[0].items[0].config.primary = 'From the other tab'; window.editor.setModel(md); });
  const s3 = await p2.evaluate(() => window.editor.save());
  await p.waitForFunction(() => document.querySelector('.ed-canvas [data-grid-id="t1"]')?.textContent.includes('From the other tab'), null, { timeout: 5000 }).catch(() => {});
  const t3 = await E(() => document.querySelector('.ed-canvas [data-grid-id="t1"]')?.textContent || '');
  check('3 · another tab of the same browser saves: this tab is told at once (no 10-minute wait)', s3 && t3.includes('From the other tab'), t3);

  // ---- 4 · a screen that is editing is never replaced
  await p.goto(`${L.base}/editor.html?d=${id}&sync=5`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(600);
  await E(() => { window.editor.setEditing(true); const md = window.editor.getModel(); md.pages[0].items[0].config.primary = 'My unsaved work'; window.editor.setModel(md); });
  const cur4 = await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json();
  const m4 = structuredClone(cur4.dashboard); m4.pages[0].items[0].config.primary = 'Saved meanwhile';
  await me.post('/api/dashboards.php', { action: 'save', id, revision: cur4.revision, dashboard: m4 });
  await E(() => window.editor.syncNow()); await wait(800);
  const kept = await E(() => window.editor.getModel().pages[0].items[0].config.primary);
  check('4 · a screen that is editing keeps its unsaved work (the newer save is not forced on it)', kept === 'My unsaved work', kept);
  await p2.close();

  // ---- 5 · wall settings through Dashboard settings, saved
  await E(() => window.editor.setModel(window.editor.getModel()));
  const cur5 = await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json();
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(600);
  await E(() => window.editor.setEditing(true)); await wait(300);
  await E(() => document.querySelector('[aria-label="Dashboard settings"]').click()); await p.waitForSelector('[data-k=settings-tab-wall]');
  await p.click('[data-k=settings-tab-wall]');
  await p.fill('[data-k=wall-saver]', '2'); await p.fill('[data-k=wall-returnHome]', '1'); await p.fill('[data-k=wall-popupClose]', '20');
  await p.click('[data-k=apply-settings]'); await wait(300);
  const saved5 = await E(() => window.editor.save());
  const wallCfg = (await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json()).dashboard.app.wall;
  check('5a · Wall tablet settings saved with the dashboard', saved5 && wallCfg && wallCfg.saver === 2 && wallCfg.returnHome === 1 && wallCfg.popupClose === 20 && cur5.ok, JSON.stringify(wallCfg));
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await wait(800);
  await p.click('.ed-canvas [data-grid-id="btn"]'); await wait(600);
  const open = await E(() => !!(document.querySelector('[data-grid-id="pt"]') && document.querySelector('[data-grid-id="pt"]').offsetParent));
  await E(() => window.editor.wall().idleFor(21)); await wait(1500);
  const popGone = await E(() => !document.querySelector('[data-grid-id="pt"]') || !document.querySelector('[data-grid-id="pt"]').offsetParent);
  await E(() => window.editor.go('two')); await wait(300);
  await E(() => window.editor.wall().idleFor(61)); await wait(1500);
  const home = await E(() => window.editor.navigation().current);
  await E(() => window.editor.wall().idleFor(121)); await wait(1500);
  const sleeping = await E(() => ({ api: window.editor.wall().sleeping(), layer: !!document.querySelector('[data-k=screensaver]'), time: document.querySelector('.iq-saver__t')?.textContent || '' }));
  // wake by tapping where the button is: the screensaver goes, the popup does NOT open
  const bb = await E(() => { const b = document.querySelector('.ed-canvas [data-grid-id="btn"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.mouse.click(bb[0], bb[1]); await wait(800);
  const after = await E(() => ({ sleeping: window.editor.wall().sleeping(), popup: !!(document.querySelector('[data-grid-id="pt"]') && document.querySelector('[data-grid-id="pt"]').offsetParent) }));
  check('5b · a popup closes after 20 s without a touch; after 1 minute the screen goes back to the start page; after 2 the screensaver shows a clock',
    open && popGone && home === 'home' && sleeping.api && sleeping.layer && /\d/.test(sleeping.time), JSON.stringify({ open, popGone, home, sleeping }));
  check('5c · a touch wakes the screen and does not reach the widget under it (no popup opened)', !after.sleeping && !after.popup, JSON.stringify(after));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('live-sync test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (B2) await B2.close();
  if (L) await L.close();
}
console.log('finished');
