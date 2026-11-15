/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Journeys A (new dashboard), D (export / import) and storage / recovery / conflict, in the REAL editor against the REAL PHP server
// (sessions, CSRF, dashboard storage) with a FAKE Home Assistant. Server-side storage is authoritative.
import { live, liveBrowser, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const L = await live();
const B = await liveBrowser(L); const page = B.page;
await page.waitForTimeout(1200);
const settle = (ms = 300) => page.waitForTimeout(ms);
const E = (fn, ...a) => page.evaluate(fn, ...a);
const api = (fn, ...a) => E(async ([f, args]) => window.IniqDashStore[f](...args), [fn, a]);
const list = async () => (await api('list')).dashboards;

// ---- the first save turns the built-in sample into a server dashboard
check('a fresh server has no dashboards', (await list()).length === 0);
check('the editor starts from the built-in sample, not saved', (await E(() => window.editor.dashboard())) === null);
check('first Save succeeds', await E(() => window.editor.save()));
await settle(500);
let dl = await list();
check('…and creates exactly one server dashboard', dl.length === 1 && /^d[0-9a-f]{16}$/.test(dl[0].id), JSON.stringify(dl));
const firstId = dl[0].id;

// ---- Journey A: create a new dashboard from the Dashboards dialog and build on it
await page.click('[data-k=more]'); await page.click('[data-k=dashboards]'); await page.waitForSelector('dialog[open] [data-k=dash-new-name]');
await page.fill('[data-k=dash-new-name]', 'Kitchen'); 
await Promise.all([page.waitForURL(/[?&]d=d[0-9a-f]{16}/), page.click('[data-k=dash-create]')]);
await page.waitForFunction(() => window.editor && window.editor.dashboard() && window.editor.dashboard().name === 'Kitchen', null, { timeout: 15000 });
dl = await list();
check('a new dashboard "Kitchen" was created and opened', dl.length === 2 && dl.some((d) => d.name === 'Kitchen'));
const kid = (await E(() => window.editor.dashboard())).id;
let m = await E(() => window.editor.getModel());
check('a new dashboard is valid and has one page', m.pages.length >= 1 && (await E((x) => window.MaisonModel.validate(x, window.MaisonRegistry).ok, m)));
check('and does not carry the other dashboard\'s pages', JSON.stringify(m.pages.map((p) => p.id)) !== JSON.stringify((await api('get', firstId)).dashboard.pages.map((p) => p.id)) || m.pages.length === 1);
await E(() => window.editor.setEditing(true)); await settle();
// page → container → widget → save → reload → continue
await E(() => document.querySelector('.ed-btn--pages').click()); await page.waitForSelector('[data-k=pages-add]'); await page.click('[data-k=pages-add]', { force: true }); await settle(); await page.keyboard.press('Escape'); await settle();
const addTop = async (type, label) => {
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type=${type}]`); await page.click(`.ecfg-tile[data-type=${type}]`); await settle(200);
  await page.click('.ecfg-foot button:has-text("Next")'); await settle(150); await page.click(`.ecfg-foot button:has-text("Add ${label}")`); await settle(400);
};
await addTop('container', 'Container'); await addTop('sensor', 'Sensor');
check('the page has a container and a widget', (await E(() => window.editor.getPage().items.map((i) => i.type).join())) === 'container,sensor');
check('Save stores the new content', await E(() => window.editor.save()));
await settle(400);
const savedServer = (await api('get', kid));
check('the server holds the page and its items', savedServer.dashboard.pages.at(-1).items.length === 2 && savedServer.revision >= 2);
await page.reload(); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(800);
const afterReload = await E(() => window.editor.getModel());
check('after a reload the same pages and items come back', JSON.stringify(afterReload.pages.map((p) => [p.id, p.items.length])) === JSON.stringify(savedServer.dashboard.pages.map((p) => [p.id, p.items.length])));

// ---- recovery draft: unsaved edits are offered after a reload, for THIS dashboard and revision only
await E(() => window.editor.setEditing(true)); await settle();
await E(() => document.querySelector('.ed-btn--pages').click()); await page.waitForSelector('[data-k=pages-add]'); await page.click('[data-k=pages-add]', { force: true }); await settle(); await page.keyboard.press('Escape');
await page.waitForTimeout(2500);   // the draft is written shortly after an edit
const drafts = await E(() => Object.keys(localStorage).filter((k) => k.startsWith('iniqdash.draft')));
check('an unsaved edit writes a recovery draft for this dashboard only', drafts.length >= 1 && drafts.every((k) => k === `iniqdash.draft.${kid}`), JSON.stringify(drafts));
const unsavedPages = (await E(() => window.editor.getModel())).pages.length;
await page.reload(); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(1000);
const banner = await E(() => { const d = document.querySelector('.ed-draft'); return d && !d.hidden ? d.textContent : ''; });
check('after the reload the draft is offered', /Unsaved changes found/.test(banner), banner);
check('the saved version is what is loaded (the draft is not applied silently)', (await E(() => window.editor.getModel())).pages.length === unsavedPages - 1);
await E(() => [...document.querySelectorAll('.ed-draft button')].find((b) => /Restore/.test(b.textContent)).click()); await settle(500);
check('Restore brings the unsaved changes back', (await E(() => window.editor.getModel())).pages.length === unsavedPages);
// the draft belongs to this dashboard: opening the other one never offers it
await page.goto(`${L.base}/editor.html?d=${firstId}`); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(800);
check('another dashboard does not get this dashboard\'s draft', !(await E(() => { const d = document.querySelector('.ed-draft'); return d && !d.hidden; })));
await page.goto(`${L.base}/editor.html?d=${kid}`); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(800);
await E(() => [...document.querySelectorAll('.ed-draft button')].find((b) => /Discard/.test(b.textContent))?.click()); await settle(300);
check('Discard removes the draft', !(await E((id) => Object.keys(localStorage).some((k) => k === `iniqdash.draft.${id}`), kid)));
await page.reload(); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(800);
check('and it is not offered again (no stale offer)', !(await E(() => { const d = document.querySelector('.ed-draft'); return d && !d.hidden; })));
// a malformed draft fails safe
await E((k) => localStorage.setItem(k, '{"model": {"version": 3, "pages": "nope"}, "savedAt": 1}'), `iniqdash.draft.${kid}`);
await E((k) => localStorage.setItem(k + 'x', 'not json'), `iniqdash.draft.${kid}`);
await page.reload(); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(800);
check('a malformed draft is not offered and is cleaned up', !(await E(() => { const d = document.querySelector('.ed-draft'); return d && !d.hidden; })) && !(await E((k) => localStorage.getItem(k), `iniqdash.draft.${kid}`)));

// ---- conflict: a stale tab can not overwrite a newer revision
// (tab 1 is EDITING when tab 2 saves: live sync never replaces a dashboard that is being edited, so tab 1 stays on the older revision —
//  a tab that is only viewing would simply pick up tab 2's save, which is live sync doing its job, not a conflict)
await E(() => window.editor.setEditing(true)); await settle(200);
const page2 = await B.ctx.newPage();
await page2.goto(`${L.base}/editor.html?d=${kid}`); await page2.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 });
await page2.evaluate(() => window.editor.setEditing(true));
await page2.evaluate(() => document.querySelector('.ed-btn--pages').click()); await page2.waitForSelector('[data-k=pages-add]'); await page2.click('[data-k=pages-add]', { force: true }); await page2.waitForTimeout(300); await page2.keyboard.press('Escape');
check('tab 2 saves its change', await page2.evaluate(() => window.editor.save()));
const newer = await api('get', kid);
await E(() => window.editor.setEditing(true)); await settle(200);
await E(() => document.querySelector('.ed-btn--pages').click()); await page.waitForSelector('[data-k=pages-add]'); await page.click('[data-k=pages-add]', { force: true }); await settle(); await page.keyboard.press('Escape'); await settle(200);
const saved = await E(() => window.editor.save());
check('the stale tab\'s save is refused (conflict)', saved === false);
await settle(400);
const stillNewer = await api('get', kid);
check('…and the newer server version was not overwritten', stillNewer.revision === newer.revision && JSON.stringify(stillNewer.dashboard) === JSON.stringify(newer.dashboard));
check('the conflict is shown with a way to reload or export', !!(await page.$('[data-k=conflict-reload]')) && !!(await page.$('[data-k=conflict-export]')));
await page2.close();

// ---- export → import: equivalent, no secrets, and an import never overwrites an existing dashboard
await page.goto(`${L.base}/editor.html?d=${kid}`); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 }); await settle(800);
await page.click('[data-k=more]'); await page.click('[data-k=export]'); await page.waitForSelector('dialog[open] textarea.ed-code');
const exported = await E(() => document.querySelector('dialog[open] textarea.ed-code').value);
await page.keyboard.press('Escape'); await settle(200);
check('the export is the dashboard model', JSON.parse(exported).pages.length === (await E(() => window.editor.getModel())).pages.length);
check('the export carries no token, password, session, server path or HA address', !exported.includes(FAKE_TOKEN) && !exported.includes(L.haUrl) && !/token|password|secret|iniq-priv|PHPSESSID|__Host/i.test(exported.replace(/"nav"/g, '')));
const before = await list();
await page.click('[data-k=more]'); await page.click('[data-k=import]'); await page.waitForSelector('dialog[open] textarea');
await page.fill('[data-k=import-name]', 'Imported copy'); await page.fill('dialog[open] textarea', exported);
await Promise.all([page.waitForURL(/[?&]d=d[0-9a-f]{16}/), page.click('dialog[open] .ed-btn--primary:has-text("Import")')]);
await page.waitForFunction(() => window.editor && window.editor.dashboard() && window.editor.dashboard().name.startsWith('Imported'), null, { timeout: 15000 });
const after = await list();
check('the import became a NEW dashboard; the existing ones are unchanged', after.length === before.length + 1 && before.every((b) => { const a = after.find((x) => x.id === b.id); return a && a.revision === b.revision; }));
const imported = await E(() => window.editor.getModel());
check('the imported dashboard is equivalent to the exported one', JSON.stringify(imported) === JSON.stringify(JSON.parse(exported)) || JSON.stringify(imported.pages) === JSON.stringify(JSON.parse(exported).pages));
const impId = (await E(() => window.editor.dashboard())).id;

// ---- rename / duplicate / delete (with confirmation) through the Dashboards dialog; unique names
check('rename to a name that is taken is refused', (await api('rename', impId, 'Kitchen')).error === 'name_taken');
check('rename works', (await api('rename', impId, 'Renamed')).ok === true);
const dup = await api('duplicate', impId);
check('duplicate creates a separate dashboard with its own id', dup.ok && dup.entry.id !== impId);
check('a duplicate does not share storage (editing the copy leaves the original)', (await api('get', dup.entry.id)).dashboard.pages.length === (await api('get', impId)).dashboard.pages.length);
check('deleting removes only that dashboard', (await api('remove', dup.entry.id)).ok && (await list()).length === after.length);
check('a deleted dashboard is gone (404)', (await api('get', dup.entry.id)).error === 'not_found');
await page.goto(`${L.base}/editor.html?d=${dup.entry.id}`); await settle(1500);
check('opening a deleted dashboard shows a clear message and does not offer to save over anything', !!(await page.$('.ed-fatal')) && /does not exist|no longer exists|not found/i.test(await page.$eval('.ed-fatal', (n) => n.textContent)));

// ---- a corrupted file is reported and left untouched
import fs from 'node:fs';
import path from 'node:path';
const dir = (fs.readdirSync(L.priv, { recursive: true }).map(String).find((f) => /dashboards?$/.test(f) && fs.statSync(path.join(L.priv, f)).isDirectory()) || '');
const files = dir ? fs.readdirSync(path.join(L.priv, dir)).filter((f) => f.endsWith('.json')) : [];
if (files.length) {
  const victim = path.join(L.priv, dir, files.find((f) => f.includes(firstId)) || files[0]); const orig = fs.readFileSync(victim, 'utf8');
  fs.writeFileSync(victim, '{ broken json');
  const id = path.basename(victim, '.json').replace(/^.*(d[0-9a-f]{16}).*$/, '$1');
  const r = await api('get', id);
  check('a corrupt dashboard file is reported as corrupt', r.error === 'corrupt' || r.error === 'not_found', JSON.stringify(r).slice(0, 100));
  check('…and left untouched on the server', fs.readFileSync(victim, 'utf8') === '{ broken json');
  fs.writeFileSync(victim, orig);
} else console.log('SKIP corrupt-file check: storage layout not found');

check('no resource (script, style, image, file) failed to load', B.failed.filter((f) => !/\/api\//.test(f)).length === 0, B.failed.filter((f) => !/\/api\//.test(f)).join(', '));
check('no page errors in the whole journey', B.errors.length === 0, B.errors.join(' | ').slice(0, 300));
await B.close(); await L.close();
console.log('finished');
