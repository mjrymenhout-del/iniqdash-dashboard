/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Memory / cleanup: repeat the operations that create and destroy UI (config dialogs, page switching, add / delete widgets, Test Mode,
// popups, Entity Details, camera enlarge, dashboard replace) and check that nothing accumulates: timers, intervals, document/window
// listeners, DOM retained after removal (WeakRef + forced GC), overlay elements and DOM size. Growth is measured after a warm-up.
import { start, check } from './lib/harness.mjs';
const ROWS = [['camera.front', 'idle', { name: 'Front door' }], ['sensor.temp', '21.5', { name: 'Temperature', unit: '°C', dc: 'temperature' }]];
const T = await start([], { server: false, browserArgs: ['--js-flags=--expose-gc'] });
let page = await T.page({ width: 1500, height: 950 });
await page.waitForTimeout(1500);
let E = (fn, ...a) => page.evaluate(fn, ...a);
const settle = (ms = 250) => page.waitForTimeout(ms);
const instrument = () => E(() => {
  const S = window.__leak = { intervals: new Set(), timeouts: new Set(), listeners: new Map(), observed: new Set() };
  const si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
  window.setInterval = (f, ms, ...a) => { const id = si(f, ms, ...a); S.intervals.add(id); return id; };
  window.clearInterval = (id) => { S.intervals.delete(id); return ci(id); };
  window.setTimeout = (f, ms, ...a) => { if (typeof f !== 'function') return st(f, ms, ...a); let id; id = st((...x) => { S.timeouts.delete(id); return f(...x); }, ms, ...a); if (!ms || ms > 1000) S.timeouts.add(id); return id; };   // only timers longer than 1 s can pile up
  window.clearTimeout = (id) => { S.timeouts.delete(id); return ct(id); };
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const global = (t) => t === document || t === window || t === document.body || t === document.documentElement;
  const key = (t, type, f, o) => `${t === window ? 'w' : t === document ? 'd' : 'b'}|${type}|${(o && (o === true || o.capture)) ? 'c' : ''}`;
  const fns = new WeakMap();
  EventTarget.prototype.addEventListener = function (type, f, o) { if (global(this) && f) { const m = fns.get(f) || new Set(); const k = key(this, type, f, o); if (!m.has(k)) { m.add(k); fns.set(f, m); S.listeners.set(k, (S.listeners.get(k) || 0) + 1); } } return add.call(this, type, f, o); };
  EventTarget.prototype.removeEventListener = function (type, f, o) { if (global(this) && f) { const m = fns.get(f); const k = key(this, type, f, o); if (m && m.has(k)) { m.delete(k); S.listeners.set(k, (S.listeners.get(k) || 1) - 1); } } return rem.call(this, type, f, o); };
  // every element the page creates, weakly: after a forced GC the ones that are detached but still alive are RETAINED DOM
  S.refs = [];
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (...a) { const e = ce.apply(this, a); S.refs.push(new WeakRef(e)); return e; };
});
await instrument();
const gc = async () => { for (let i = 0; i < 2; i++) { await E(() => new Promise((r) => setTimeout(r, 60))); await E(() => { window.gc && window.gc(); }); } };
const snap = async () => { await gc(); return E(() => {
  const S = window.__leak; let detached = 0;
  S.refs.forEach((w) => { const e = w.deref(); if (e && e.isConnected === false) detached++; });
  const lis = {}; S.listeners.forEach((n, k) => { if (n > 0) lis[k] = n; });
  return { intervals: S.intervals.size, timeouts: S.timeouts.size, listeners: Object.values(lis).reduce((a, b) => a + b, 0), listenerKeys: lis, retainedDOM: detached,
    overlays: document.querySelectorAll('dialog[open], .mpop, .mnote, .rm-overlay, .ed-fatal').length, dialogsInDom: document.querySelectorAll('dialog').length, nodes: document.getElementsByTagName('*').length };
}); };
const diffKeys = (a, b) => Object.keys({ ...a, ...b }).filter((k) => (b[k] || 0) > (a[k] || 0)).map((k) => `${k}+${(b[k] || 0) - (a[k] || 0)}`).join(' ');
const results = [];
async function cycle(name, fn, n = 12, sweepWait = 0) {
  await fn(); await settle(300);                       // warm-up (lazy caches, first-time listeners)
  const a = await snap();
  for (let i = 0; i < n; i++) { await fn(); await settle(120); }
  await page.waitForTimeout(6500);   // lazy clean-ups: Entity Details' own watcher gives up on a never-attached view after 5 s
  const b = await snap();
  const grew = { timers: b.timeouts - a.timeouts, intervals: b.intervals - a.intervals, listeners: b.listeners - a.listeners, retainedDOM: b.retainedDOM - a.retainedDOM, overlays: b.overlays - a.overlays, dialogs: b.dialogsInDom - a.dialogsInDom, nodes: b.nodes - a.nodes };
  const bad = Object.entries(grew).filter(([k, v]) => k !== 'retainedDOM' && v > (k === 'nodes' ? 60 : 2));   // retained DOM is judged after the sweep below
  check(`${name}: ×${n} leaves nothing behind`, bad.length === 0, `${JSON.stringify(grew)} ${diffKeys(a.listenerKeys, b.listenerKeys)}`);
}
await E(() => window.editor.setEditing(true)); await settle();
const base = await snap();

const firstId = await E(() => window.editor.getPage().items.find((i) => !i.parent && i.type !== 'container').id);
await cycle('configuration dialog open → cancel', async () => { await page.click(`[data-grid-id="${firstId}"]`, { force: true }); await settle(80); await page.click('[data-k=edit-config]'); await page.locator('dialog[open] .ef').first().waitFor(); await page.keyboard.press('Escape'); await settle(150); });
await cycle('Add dialog open → close', async () => { await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await page.locator('dialog[open]').first().waitFor(); await page.keyboard.press('Escape'); await settle(150); });
await cycle('Pages dialog open → close', async () => { await page.click('.ed-btn--pages'); await page.locator('dialog[open]').first().waitFor(); await page.keyboard.press('Escape'); await settle(150); });
await cycle('page switching', async () => { await E(() => { const ids = window.editor.getModel().pages.map((p) => p.id); const cur = window.editor.getPage().id; const nxt = ids[(ids.indexOf(cur) + 1) % ids.length]; [...document.querySelectorAll('nav[aria-label] button, nav[aria-label] a')].find((b) => b.textContent.trim() && !(b.getAttribute('aria-current') === 'page' || b.getAttribute('aria-pressed') === 'true'))?.click(); }); await settle(200); }, 16);
await cycle('add a widget → delete it', async () => {
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.locator('.ecfg-tile[data-type=sensor]').first().waitFor(); await page.click('.ecfg-tile[data-type=sensor]'); await settle(120);
  await page.click('.ecfg-foot button:has-text("Next")'); await settle(100); await page.click('.ecfg-foot button:has-text("Add Sensor")'); await settle(300);
  await page.click('[data-k=remove]', { force: true }); await settle(100); if (await page.locator('[data-k=remove].is-armed').count()) await page.click('[data-k=remove]', { force: true }); await settle(200);
}, 8);
await cycle('undo / redo', async () => { await E(() => window.editor.setEditing(true)); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y'); }, 10);
await cycle('Test Mode enter → leave', async () => { await page.click('[data-k=pv-fs]'); await page.click('[data-k=fs-preview]'); await settle(350); await page.keyboard.press('Escape'); await settle(300); }, 8);
await cycle('preview size change', async () => { await page.selectOption('[data-k=pv-device]', '390x844'); await settle(250); await page.selectOption('[data-k=pv-device]', '1366x768'); await settle(250); }, 8);
await cycle('Multi preview on → off', async () => { await page.click('[data-k=pv-multi]'); await settle(500); await page.click('[data-k=pv-multi]'); await settle(250); }, 6);
await cycle('replace the whole dashboard (import)', async () => {
  const m = await E(() => window.editor.getModel());
  await page.click('[data-k=more]').catch(() => {}); await page.click('[data-k=import]'); await page.locator('dialog[open] textarea').first().waitFor(); await page.fill('dialog[open] textarea', JSON.stringify(m)); await page.click('dialog[open] .ed-btn--primary:has-text("Import")'); await settle(500);
}, 6);

// everything the editor part created and removed is released after MaisonFit's periodic sweep (it keeps a removed widget up to ~20 s on purpose)
await page.waitForTimeout(45000);
let fin = await snap();
if (fin.retainedDOM - base.retainedDOM > 300) { await page.waitForTimeout(40000); fin = await snap(); }   // a loaded machine delays the sweep timers
check(`after the sweep the DOM that was created and removed is released (retained: ${base.retainedDOM} → ${fin.retainedDOM})`, fin.retainedDOM - base.retainedDOM <= 300, JSON.stringify({ base: base.retainedDOM, fin: fin.retainedDOM }));
check('and the page holds no more timers, intervals or global listeners than before', fin.timeouts - base.timeouts <= 3 && fin.intervals - base.intervals <= 2 && fin.listeners - base.listeners <= 2, JSON.stringify({ base, fin }).slice(0, 300));

// runtime pieces with live HA data (mocked HA endpoints, real server code): camera enlarge, Entity Details
const T2 = await start(ROWS, { browserArgs: ['--js-flags=--expose-gc'] });
page = await T2.page({ width: 1500, height: 950 }); E = (fn, ...a) => page.evaluate(fn, ...a);
await instrument();
await E(() => { document.getElementById('leak-host')?.remove(); const box = document.createElement('div'); box.id = 'leak-host'; box.style.cssText = 'position:fixed;left:10px;top:10px;width:420px;height:260px;z-index:99999;background:#222;display:grid'; document.body.append(box); box.append(window.MaisonRegistry.build('camera', { entity: 'camera.front', name: 'Front door' })); });
await settle(1200);
if (await page.locator('.cam__expand').count()) {   // (locators, never ElementHandles: a handle keeps its node alive and would look like a leak)
  await cycle('camera enlarge → close', async () => { await E(() => { const b = document.querySelector('.cam__expand'); b.hidden = false; b.click(); }); await page.locator('dialog[open]').first().waitFor({ timeout: 3000 }).catch(() => {}); await page.keyboard.press('Escape'); await settle(200); }, 10);
} else console.log('SKIP camera enlarge: control not present for the mocked entity');
await E(() => { document.getElementById('leak-host')?.remove(); });
await E(() => { const layer = document.createElement('div'); layer.id = 'dl'; layer.style.cssText = 'position:fixed;inset:0;z-index:99998'; document.body.append(layer);
  window.__dh = window.MaisonPopup.createHost({ layer, build: (def) => window.IniqHADetails.build(def.payload || {}), key: () => 'desktop', viewport: () => ({ w: innerWidth, h: innerHeight }), icons: window.MaisonRegistry.icons() }); });
await cycle('Entity Details open → close', async () => {
  await E(() => window.__dh.open({ id: 'details', name: 'Details', config: { title: 'Temperature', closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'none', exit: 'none', size: 'custom', custom: { desktop: { w: 480, h: 520 } } }, payload: { entity: 'sensor.temp', label: 'Temperature' } }));
  await settle(300); await page.keyboard.press('Escape'); await settle(300);
}, 8);

const errs = await E(() => 0);
check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join('|'));
await T.close(); await T2.close();
console.log('finished');
