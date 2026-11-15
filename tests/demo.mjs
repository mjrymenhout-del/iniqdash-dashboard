/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Public demo mode (static files, no server): everything is simulated and local. No request leaves for api/, login or Home Assistant; no
// credential or token exists in the page or its storage; the demo opts in to a plain "simulated" note with <meta name="iniqdash-demo">;
// edits stay in this browser and Reset restores the built-in sample.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1400, height: 900 });
const requests = []; page.on('request', (r) => requests.push(new URL(r.url()).pathname));
await page.waitForTimeout(1500);
const E = (fn, ...a) => page.evaluate(fn, ...a);
check('no request to api/, login or logout (no server involved)', !requests.some((u) => /^\/(api\/|login|logout|gate)/.test(u)), requests.filter((u) => /^\/(api\/|login|logout|gate)/.test(u)).join());
check('the Home Assistant layer is off (every widget keeps its simulated data)', await E(() => window.IniqHA.enabled() === false && window.IniqHA.status().state === 'demo'));
check('the dashboard is the built-in sample, not saved anywhere', await E(() => window.editor.dashboard() === null && window.editor.getModel().pages.length > 1));
check('no token / credential / server setting exists in the page or its storage', await E(() => !/token|password|secret|bearer/i.test(JSON.stringify(Object.assign({}, localStorage, sessionStorage))) && !document.querySelector('meta[name=iniqdash-csrf]')));
check('without the demo meta there is no banner (local files and showrooms are unchanged)', !(await page.$('[data-k=demo-note]')));
// a demo deployment opts in with the meta tag
const page2 = await (async () => { const ctx = page.context(); const p = await ctx.newPage(); await p.route('**/editor.html', async (r) => { const resp = await r.fetch(); r.fulfill({ response: resp, body: (await resp.text()).replace('<head>', '<head><meta name="iniqdash-demo" content="1">') }); });   /* what a demo deployment's HTML carries */
  await p.goto(T.url); await p.waitForFunction(() => window.editor); return p; })();
await page2.waitForTimeout(800);
const note = await page2.$eval('[data-k=demo-note]', (n) => n.textContent).catch(() => '');
check('a demo deployment says plainly that the data is simulated and stays in the browser', /simulated/i.test(note) && /browser/i.test(note), note);
check('the note is a labelled landmark-free note (role=note), readable', await page2.$eval('[data-k=demo-note]', (n) => n.getAttribute('role') === 'note' && getComputedStyle(n).display !== 'none').catch(() => false));
// edits are local; reset restores the sample
await page2.evaluate(() => window.editor.setEditing(true));
await page2.evaluate(() => document.querySelector('.ed-btn--pages').click()); await page2.waitForSelector('[data-k=pages-add]'); await page2.click('[data-k=pages-add]', { force: true }); await page2.waitForTimeout(300); await page2.keyboard.press('Escape');
const n1 = await page2.evaluate(() => window.editor.getModel().pages.length);
check('an edit works locally', n1 > 6);
check('Save keeps it in this browser only', await page2.evaluate(() => window.editor.save()) && await page2.evaluate(() => Object.keys(localStorage).some((k) => /dashboard/.test(k))));
await page2.click('[data-k=more]'); await page2.click('[data-k=reset]'); await page2.waitForTimeout(200);
await page2.click('[data-k=reset]'); await page2.waitForTimeout(800);   // second press confirms
check('Reset restores the built-in sample and clears the browser copy', (await page2.evaluate(() => window.editor.getModel().pages.length)) === n1 - 1 && !(await page2.evaluate(() => Object.keys(localStorage).some((k) => /dashboard\.v1$/.test(k) && localStorage.getItem(k)))));
check('no page errors', page.errors.length === 0 && true, page.errors.join('|'));
await T.close();
console.log('finished');
