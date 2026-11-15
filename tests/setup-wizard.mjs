/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// FIRST-RUN WIZARD (login.php step 1 · the application steps 2–4 · server/FirstRun.php), through the real pages on fresh servers:
//   1  a fresh installation opens on "Create your account" (step 1); a short / mismatched password is refused with a clear message
//   2  creating the account signs the new administrator in and opens the wizard (step 2) — no second password prompt
//   3  a second visitor can no longer create an administrator (the page signs in; a forged setup POST is refused)
//   4  step 2: a wrong token is refused with Home Assistant's own reason; the right one connects; Continue saves it
//   5  step 3: the generator's own form, from Home Assistant's areas; step 4: a summary
//   6  an unfinished setup resumes after a reload (the wizard comes back, nothing was created)
//   7  a failed finish (an invalid dashboard) creates nothing and leaves the setup open
//   8  Finish: one dashboard, the default, opened; setup done — the wizard does not come back and cannot be replayed
//   9  the demo choice: the official demo becomes the default and opens
//   10 an EXISTING installation (an account, no setup state) never sees the wizard: sign-in page, no setup meta, nothing changed
import { live, liveBrowser, FAKE_TOKEN, AREAS } from './lib/live.mjs';
import { check, playwright } from './lib/harness.mjs';

const PASS = 'a long first-run password';
let L, L2, L3, L4, br;
const ctxFor = async (Lx, vw = 1280) => br.newContext({ viewport: { width: vw, height: 900 }, extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
try {
  br = await playwright().chromium.launch();
  L = await live({ configureHa: false, fresh: true });
  AREAS.kitchen = 'Kitchen'; AREAS.living = 'Living room';
  L.setEntity('light.kitchen', 'on', { name: 'Kitchen light', area: 'kitchen', f: 0, br: 100, cm: 'brightness', scm: ['brightness'] });
  L.setEntity('light.sofa', 'off', { name: 'Sofa lamp', area: 'living', f: 0, cm: 'onoff', scm: ['onoff'] });
  L.setEntity('sensor.living_temperature', '21.4', { name: 'Living temperature', area: 'living', unit: '°C', dc: 'temperature' });
  const ctx = await ctxFor(L), p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  // ---- 1
  await p.goto(`${L.base}/`);
  const s1 = await p.evaluate(() => ({ url: location.pathname, h2: document.querySelector('h2')?.textContent || '', step: !!document.querySelector('.step .on'), signIn: /Sign in to continue/.test(document.body.textContent) }));
  await p.fill('#password', 'short'); await p.fill('#password2', 'short');
  await p.evaluate(() => { document.querySelector('#password').removeAttribute('minlength'); document.querySelector('#password2').removeAttribute('minlength'); });
  await Promise.all([p.waitForLoadState('load'), p.click('button[type=submit]')]); await p.waitForTimeout(300);
  const e1 = await p.evaluate(() => document.querySelector('.msg--error')?.textContent || '');
  await p.fill('#password', PASS); await p.fill('#password2', `${PASS}!`);
  await Promise.all([p.waitForLoadState('load'), p.click('button[type=submit]')]); await p.waitForTimeout(300);
  const e2 = await p.evaluate(() => document.querySelector('.msg--error')?.textContent || '');
  check('1 · a fresh installation opens on step 1 "Create your account"; a short password and a mismatch are refused with clear messages',
    s1.url.endsWith('login.php') && s1.h2 === 'Create your account' && s1.step && !s1.signIn && /12 characters/.test(e1) && /not the same/.test(e2), JSON.stringify({ s1, e1, e2 }));
  // ---- 2
  await p.fill('#user', 'owner'); await p.fill('#password', PASS); await p.fill('#password2', PASS);
  await Promise.all([p.waitForURL(/setup=1/, { timeout: 15000 }), p.click('button[type=submit]')]);
  await p.waitForSelector('[data-k=setup]', { timeout: 20000 });
  const s2 = await p.evaluate(() => ({ title: document.querySelector('.ed-setup__title').textContent, on: [...document.querySelectorAll('.ed-setup__steps span')].map((x) => x.dataset.on).join() }));
  check('2 · creating the account signs the administrator in and opens the wizard at step 2 (no second password prompt)', s2.title === 'Connect Home Assistant' && s2.on === 'true,true,false,false', JSON.stringify(s2));
  // ---- 3
  const other = await ctxFor(L), q = await other.newPage();
  await q.goto(`${L.base}/login.php`);
  const s3 = await q.evaluate(() => ({ setup: !!document.querySelector('input[name=action][value=setup]'), signIn: !!document.querySelector('#password') && /Sign in/.test(document.body.textContent) }));
  // a second visitor posting the setup form with a matching double-submit cookie (the strongest forgery): still refused — an account exists
  const tok = 'ab'.repeat(32);
  const forged = (await fetch(`${L.base}/login.php`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-Proto': 'https', Origin: L.base, Cookie: `iniqdash_setup_csrf=${tok}` },
    body: `action=setup&setup_csrf=${tok}&user=intruder&password=intruder-password-1&password2=intruder-password-1` })).status;
  const me = L.client(); const okIntruder = [302, 303].includes((await me.login('intruder', 'intruder-password-1')).status);
  check('3 · afterwards nobody can create an administrator: the page signs in, a forged setup request is refused, the intruder cannot sign in', !s3.setup && s3.signIn && forged !== 303 && !okIntruder, JSON.stringify({ s3, forged, okIntruder }));
  await other.close();
  // ---- 4
  await p.fill('[data-k=setup-url]', L.haUrl); await p.fill('[data-k=setup-token]', 'wrong-token-but-long-enough-0123456789');
  await p.click('[data-k=setup-test]'); await p.waitForFunction(() => /rejected|failed|could not/i.test(document.querySelector('[data-k=setup-result]').textContent), null, { timeout: 15000 });
  const bad = await p.evaluate(() => ({ t: document.querySelector('[data-k=setup-result]').textContent, next: document.querySelector('[data-k=setup-next]').disabled }));
  await p.fill('[data-k=setup-token]', FAKE_TOKEN);
  await p.click('[data-k=setup-test]'); await p.waitForFunction(() => /Connected/.test(document.querySelector('[data-k=setup-result]').textContent), null, { timeout: 15000 });
  const good = await p.evaluate(() => ({ t: document.querySelector('[data-k=setup-result]').textContent, next: document.querySelector('[data-k=setup-next]').disabled }));
  check('4 · step 2: a wrong token is refused with the reason (Continue stays off); the right one connects', /rejected/i.test(bad.t) && bad.next && /Connected/.test(good.t) && !good.next, JSON.stringify({ bad, good }));
  await p.click('[data-k=setup-next]');
  await p.waitForFunction(() => document.querySelector('.ed-setup__title').textContent === 'Choose your dashboard', null, { timeout: 15000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-k=gen-area]').length > 0 && !document.querySelector('[data-k=setup-review]').disabled, null, { timeout: 20000 });
  const s5 = await p.evaluate(() => ({ areas: [...document.querySelectorAll('[data-k=gen-area]')].map((x) => x.value), preview: document.querySelector('[data-k=gen-preview]').textContent.slice(0, 160) }));
  // ---- 6 (resume after a reload: the HA connection is saved, the wizard comes back; nothing was created)
  const listBefore = await p.evaluate(async () => (await (await fetch('api/dashboards.php')).json()).dashboards.length);
  await p.reload(); await p.waitForSelector('[data-k=setup]', { timeout: 20000 });
  const resumed = await p.evaluate(() => document.querySelector('.ed-setup__title').textContent);
  check('6 · an unfinished setup resumes after a reload (the wizard is back; no dashboard was made by the wizard)', resumed === 'Connect Home Assistant' && listBefore <= 1, JSON.stringify({ resumed, listBefore }));
  // ---- 7 (a failed finish: nothing created, the setup stays open)
  const fail = await p.evaluate(async () => { const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content;
    const r = await fetch('api/setup.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'finish', name: 'Broken', dashboard: { version: 3, pages: 'nope' } }) });
    const after = (await (await fetch('api/dashboards.php')).json()).dashboards; const st = await (await fetch('api/setup.php')).json();
    return { status: r.status, body: await r.json(), names: after.map((d) => d.name), pending: st.pending }; });
  check('7 · a failed finish (an invalid dashboard) creates nothing and the setup stays open', fail.status >= 400 && !fail.names.includes('Broken') && fail.pending === true, JSON.stringify(fail));
  // back through step 2 (the saved connection: the token field may stay empty for the saved address)
  await p.fill('[data-k=setup-url]', L.haUrl); await p.fill('[data-k=setup-token]', FAKE_TOKEN);
  await p.click('[data-k=setup-test]'); await p.waitForFunction(() => /Connected/.test(document.querySelector('[data-k=setup-result]').textContent), null, { timeout: 15000 });
  await p.click('[data-k=setup-next]'); await p.waitForFunction(() => !!document.querySelector('[data-k=setup-review]') && !document.querySelector('[data-k=setup-review]').disabled, null, { timeout: 20000 });
  await p.click('[data-k=setup-review]'); await p.waitForSelector('[data-k=setup-summary]');
  const sum = await p.evaluate(() => document.querySelector('[data-k=setup-summary]').textContent);
  check('5 · step 3: the generator\'s form lists Home Assistant\'s areas with a live preview; step 4 summarises name, pages, rooms and widgets',
    s5.areas.includes('kitchen') && s5.areas.includes('living') && /Pages/.test(sum) && /Kitchen/.test(sum) && /Living room/.test(sum) && /Widgets/.test(sum), JSON.stringify({ s5, sum: sum.slice(0, 200) }));
  // ---- 8
  await Promise.all([p.waitForURL(/\?d=/, { timeout: 20000 }), p.click('[data-k=setup-finish]')]);
  await p.waitForFunction(() => window.editor && window.editor.getModel && window.editor.getModel().pages.length > 0, null, { timeout: 20000 }); await p.waitForTimeout(1200);
  const fin = await p.evaluate(async () => { const d = await (await fetch('api/dashboards.php')).json(); const st = await (await fetch('api/setup.php')).json();
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content;
    const replay = await fetch('api/setup.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'demo' }) });
    return { id: new URLSearchParams(location.search).get('d'), def: d.settings.default, names: d.dashboards.map((x) => x.name), pages: window.editor.getModel().pages.map((x) => x.id), wizard: !!document.querySelector('[data-k=setup]'), pending: st.pending, replay: replay.status,
      meta: !!document.querySelector('meta[name="iniqdash-setup"]') }; });
  await p.goto(`${L.base}/`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await p.waitForTimeout(800);
  const after = await p.evaluate(() => ({ wizard: !!document.querySelector('[data-k=setup]'), meta: !!document.querySelector('meta[name="iniqdash-setup"]') }));
  check('8 · Finish: the dashboard is created, is the default and opens (Home, Rooms…); setup is done — the wizard does not return and cannot be replayed',
    fin.id && fin.def === fin.id && fin.names.includes('My home') && fin.pages.includes('home') && fin.pages.includes('rooms') && !fin.wizard && fin.pending === false && fin.replay === 409 && !after.wizard && !after.meta, JSON.stringify({ fin, after }));
  check('no page errors (main flow)', errors.length === 0, errors.join(' | '));
  await ctx.close();
  // ---- 9 · the demo choice
  L2 = await live({ configureHa: false, fresh: true });
  const c2 = await ctxFor(L2), d = await c2.newPage();
  await d.goto(`${L2.base}/`); await d.fill('#password', PASS); await d.fill('#password2', PASS);
  await Promise.all([d.waitForURL(/setup=1/, { timeout: 15000 }), d.click('button[type=submit]')]); await d.waitForSelector('[data-k=setup-demo]', { timeout: 20000 });
  await Promise.all([d.waitForURL(/\?d=/, { timeout: 20000 }), d.click('[data-k=setup-demo]')]);
  await d.waitForFunction(() => window.editor && window.editor.getModel().pages.length > 3, null, { timeout: 20000 }); await d.waitForTimeout(800);
  const demo = await d.evaluate(async () => { const x = await (await fetch('api/dashboards.php')).json(); return { def: x.settings.default, id: new URLSearchParams(location.search).get('d'), sim: window.editor.getModel().app.simulated === true, name: (x.dashboards.find((y) => y.id === x.settings.default) || {}).name, wizard: !!document.querySelector('[data-k=setup]') }; });
  check('9 · "Explore the demo instead": the official demo (simulated, never real devices) becomes the default and opens; the wizard is done', demo.def === demo.id && demo.sim && /demo/i.test(demo.name || '') && !demo.wizard, JSON.stringify(demo));
  await c2.close();
  // ---- 10 · an existing installation
  L3 = await live({ configureHa: true });
  const c3 = await ctxFor(L3), x = await c3.newPage();
  await x.goto(`${L3.base}/login.php`);
  const ex1 = await x.evaluate(() => ({ setup: !!document.querySelector('input[name=action][value=setup]'), signIn: !!document.querySelector('#password') }));
  await x.fill('#user', 'admin'); await x.fill('#password', 'correct horse battery staple');
  await Promise.all([x.waitForNavigation(), x.click('button[type=submit]')]); await x.waitForFunction(() => window.editor, null, { timeout: 20000 }); await x.waitForTimeout(800);
  const ex2 = await x.evaluate(async () => ({ wizard: !!document.querySelector('[data-k=setup]'), meta: !!document.querySelector('meta[name="iniqdash-setup"]'), pending: (await (await fetch('api/setup.php')).json()).pending }));
  check('10 · an existing installation (an account, no setup state) never sees the wizard: the sign-in page, no setup meta, nothing pending', !ex1.setup && ex1.signIn && !ex2.wizard && !ex2.meta && ex2.pending === false, JSON.stringify({ ex1, ex2 }));
  await c3.close();
  // ---- 11 · two first visitors at the same moment: exactly one administrator is created
  L4 = await live({ configureHa: false, fresh: true });
  const race = await Promise.all(['racer-one', 'racer-two', 'racer-three'].map(async (u) => { const tk = Buffer.from(u.padEnd(32, 'x')).toString('hex').slice(0, 64);
    return [u, (await fetch(`${L4.base}/login.php`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-Proto': 'https', Origin: L4.base, Cookie: `iniqdash_setup_csrf=${tk}` },
      body: `action=setup&setup_csrf=${tk}&user=${u}&password=${encodeURIComponent(PASS)}&password2=${encodeURIComponent(PASS)}` })).status]; }));
  const winners = race.filter(([, st]) => st === 303).map(([u]) => u);
  const signedIn = await Promise.all(['racer-one', 'racer-two', 'racer-three'].map(async (u) => [u, [302, 303].includes((await L4.client().login(u, PASS)).status)]));
  check('11 · three first visitors at once: exactly one administrator is created, and only that one can sign in', winners.length === 1 && signedIn.filter(([, ok]) => ok).map(([u]) => u).join() === winners.join(), JSON.stringify({ race, signedIn }));
} catch (e) {
  check('setup-wizard test ran', false, e.stack || e.message);
} finally {
  if (br) await br.close();
  for (const x of [L, L2, L3, L4]) if (x) await x.close();
}
console.log('finished');
