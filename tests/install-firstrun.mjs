/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// FIRST-RUN JOURNEY against a DEPLOYED IniqDash (not part of tests/run-all.sh): sign in → Settings → Home Assistant (test, save) →
// new dashboard → Add Widget → Sensor → choose an entity from Home Assistant → Done (saved) → sign out → sign in → the saved dashboard
// shows the entity's value. Creates one dashboard. -k: self-signed certificates are accepted.
// usage: IQ_PASS='…' IQ_HA_URL=http://ha:8123 IQ_HA_TOKEN='…' IQ_ENTITY=sensor.x IQ_VALUE=21.5 node tests/install-firstrun.mjs https://host [shot.png]
import { playwright } from './lib/harness.mjs';
const { chromium } = playwright();
const B = process.argv[2], SHOT = process.argv[3];
const USER = process.env.IQ_USER || 'admin', PASS = process.env.IQ_PASS, HA_URL = process.env.IQ_HA_URL, HA_TOKEN = process.env.IQ_HA_TOKEN;
const ENTITY = process.env.IQ_ENTITY || 'sensor.hall_temperature', VALUE = process.env.IQ_VALUE || '';
if (!B || !PASS || !HA_URL || !HA_TOKEN) { console.error('usage: IQ_PASS=… IQ_HA_URL=… IQ_HA_TOKEN=… [IQ_ENTITY=… IQ_VALUE=…] node tests/install-firstrun.mjs https://host [shot.png]'); process.exit(2); }
let fails = 0;
const log = (ok, s, x = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}${ok ? '' : '  ' + x}`); };
const br = await chromium.launch(); const ctx = await br.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage(); const errs = []; const csp = [];
page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (/Content Security Policy/.test(m.text())) csp.push(m.text()); });
const E = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const signIn = async () => { await page.goto(B + '/'); await page.fill('#user', USER); await page.fill('#password', PASS); await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]); await page.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 15000 }); await wait(800); };
try {
  // 1-2: installed + setup done by the shell script; sign in
  await signIn();
  log(new URL(page.url()).pathname === '/', 'sign in → the application (viewing mode)');
  // 3: connect Home Assistant from Settings (the form: URL + token, Test, Save)
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('[data-k=more]'); await page.click('[data-k=ha-settings]'); await page.waitForSelector('dialog[open] [data-k=ha-url]');
  await page.fill('[data-k=ha-url]', HA_URL); await page.fill('[data-k=ha-token]', HA_TOKEN);
  await page.click('[data-k=ha-test]'); await page.waitForFunction(() => /Connected/.test(document.querySelector('dialog[open] .ed-has__result')?.textContent || ''), null, { timeout: 10000 });
  await page.click('[data-k=ha-save]'); await page.waitForFunction(() => /Saved/.test(document.querySelector('dialog[open] .ed-has__result')?.textContent || ''), null, { timeout: 10000 });
  const res = await E(() => document.querySelector('dialog[open] .ed-has__result').textContent);
  log(/Saved\. Connected/.test(res), 'Settings → Home Assistant: Test then Save (token typed in the browser, stored on the server)', res);
  await page.keyboard.press('Escape'); await wait(300);
  // 4: a new dashboard
  await page.click('[data-k=more]'); await page.click('[data-k=dashboards]'); await page.waitForSelector('dialog[open] [data-k=dash-new-name]');
  await page.fill('[data-k=dash-new-name]', 'My home ' + Date.now() % 100000);
  await Promise.all([page.waitForURL(/[?&]d=d[0-9a-f]{16}/), page.click('[data-k=dash-create]')]);
  await page.waitForFunction(() => window.editor && window.editor.dashboard && window.editor.dashboard(), null, { timeout: 15000 }); await wait(800);
  const did = new URL(page.url()).searchParams.get('d');
  log(!!did, 'Dashboards → New "My home" (created on the server)', page.url());
  // 5-6: add a Sensor widget and choose a Home Assistant entity in its configuration
  await E(() => window.editor.setEditing(true)); await wait(400);
  const n0 = await E(() => window.editor.getPage().items.length);
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector('.ecfg-tile[data-type=sensor]'); await page.click('.ecfg-tile[data-type=sensor]'); await wait(300);
  await page.click('dialog[open] .ef-field[data-key="entity"] [data-k=iqp-choose]'); await wait(600);
  await E(() => { const b = document.querySelector('dialog[open] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); }); await wait(300);
  const listed = await E(() => [...document.querySelectorAll('dialog[open] .iqp__item')].map((i) => i.dataset.entity));
  await page.click(`dialog[open] .iqp__item[data-entity="${ENTITY}"]`); await wait(700);
  await page.click('.ecfg-foot button:has-text("Next")'); await wait(400);
  await page.click('.ecfg-foot button:has-text("Add Sensor")'); await wait(800);
  const items = await E(() => window.editor.getPage().items.map((i) => ({ type: i.type, entity: i.config && i.config.entity })));
  log(listed.includes(ENTITY) && items.length === n0 + 1 && items.some((i) => i.type === 'sensor' && i.entity === ENTITY), `Add Widget → Sensor → entity chosen from Home Assistant's list (${ENTITY})`, JSON.stringify({ listed, items }));
  // 7: save (Done)
  await page.click('.ed-bar button:has-text("Done")').catch(async () => { await E(() => window.editor.save()); });
  await wait(1500);
  const srv = await E(async (id) => (await (await fetch('api/dashboards.php?id=' + id)).json()), did);
  const onServer = JSON.stringify(srv.dashboard || {}).includes(ENTITY);
  log(onServer, 'Done → saved on the server (the dashboard file contains the widget)', JSON.stringify(srv).slice(0, 200));
  // 8: sign out
  await page.waitForSelector('[data-k=sign-out]', { state: 'attached' });
  await Promise.all([page.waitForNavigation(), E(() => document.querySelector('[data-k=sign-out]').closest('form').requestSubmit ? document.querySelector('[data-k=sign-out]').closest('form').requestSubmit() : document.querySelector('[data-k=sign-out]').click())]);
  log(/login\.php/.test(page.url()), 'Sign out → the sign-in page', page.url());
  const after = (await ctx.request.get(B + '/api/dashboards.php', { maxRedirects: 0 })).status();
  log(after === 401, 'signed out: the API answers 401', String(after));
  // 9-10: sign in again → back on the saved dashboard with the live value
  await signIn();
  await page.goto(`${B}/?d=${did}`); await page.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 15000 }); await wait(2500);
  const shown = await E(() => ({ items: window.editor.getPage().items.map((i) => i.config && i.config.entity), text: document.querySelector('.ed-frame, main, body').innerText.replace(/\s+/g, ' ').slice(0, 400) }));
  log(shown.items.includes(ENTITY) && (!VALUE || shown.text.includes(VALUE)), `sign in again → the saved dashboard${VALUE ? `, the widget showing ${VALUE}` : ''}`, JSON.stringify(shown));
  if (SHOT) await page.screenshot({ path: SHOT });
  log(csp.length === 0, 'no Content-Security-Policy violation during the journey', csp.slice(0, 2).join(' | '));
  log(errs.filter((e) => !/Failed to load resource/.test(e)).length === 0, 'no page / console error', errs.slice(0, 3).join(' | '));
} catch (e) { log(false, 'journey ran', e.stack); }
await br.close();
process.exit(fails ? 1 : 0);
