/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// FORWARDING HEADERS AND LOGIN LIMITS, end to end (real PHP server, FAKE Home Assistant — tests/lib/live.mjs):
//   1. with NO trusted proxy, a client that sends X-Forwarded-Proto: https itself is still plain HTTP → refused (require_https);
//   2. behind a TRUSTED proxy (127.0.0.1 here) the forwarded scheme and client address are used;
//   3. one client's failed logins lock THAT client, not everyone behind the same proxy;
//   4. an account lock (many addresses guessing) does not lock out the owner's RECOGNISED browser (device cookie from an earlier
//      sign-in); a new browser is still locked; the responses do not reveal whether the account name exists.
import { live } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const PW = 'correct horse battery staple';
let A, T;
try {
  // ---- 1. nobody trusted
  A = await live({ trustedProxies: '' });
  const raw = (url, init = {}) => fetch(A.base + url, { redirect: 'manual', ...init });
  let r = await raw('/login.php', { headers: { 'X-Forwarded-Proto': 'https' } });
  check('untrusted client claiming HTTPS (X-Forwarded-Proto) → still plain HTTP: a GET is sent to https://', r.status === 301 && /^https:\/\//.test(r.headers.get('location') || ''), `${r.status} ${r.headers.get('location')}`);
  r = await raw('/login.php', { method: 'POST', headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/x-www-form-urlencoded', Origin: A.base }, body: 'user=admin&password=x' });
  check('…and a POST is refused (403): the forged header does not open the login', r.status === 403, String(r.status));
  r = await raw('/api/dashboards.php', { headers: { 'X-Forwarded-Proto': 'https' } });
  check('…the same for the API (no content)', r.status === 403 || r.status === 301, String(r.status));
  await A.close(); A = null;

  // ---- 2..4. a trusted proxy at 127.0.0.1 (the test client plays the proxy and forwards the client address)
  T = await live({ trustedProxies: '127.0.0.1' });
  const as = (ip) => T.client({ headers: { 'X-Forwarded-For': ip } });
  const owner = as('203.0.113.10');
  r = await owner.login();
  check('behind the trusted proxy: the forwarded HTTPS is believed (sign-in works, secure cookie name)', r.status === 303 && Object.keys(owner.jar).some((k) => k.startsWith('__Host-iniqdash')), `${r.status} ${Object.keys(owner.jar)}`);
  const devName = Object.keys(owner.jar).find((k) => /device/.test(k));
  check('a successful sign-in gives the browser a device cookie', !!devName, Object.keys(owner.jar).join(','));
  {
    const page = await (await fetch(`${T.base}/login.php`, { headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.11' } }));
    const sid = (page.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
    const t = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1] || '';
    const p = await fetch(`${T.base}/login.php`, { method: 'POST', redirect: 'manual', headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.11', Cookie: sid, Origin: T.base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: t, user: 'admin', password: PW }) });
    const dc = (p.headers.getSetCookie() || []).find((c) => /device=/.test(c)) || '';
    check('…named __Host-, HttpOnly, Secure, SameSite=Strict, Path=/, about 180 days', /^__Host-iniqdash_device=[0-9a-f]{64};/.test(dc) && /HttpOnly/i.test(dc) && /Secure/i.test(dc) && /SameSite=Strict/i.test(dc) && /path=\//i.test(dc) && /Max-Age=15552000/.test(dc), dc);
  }
  const fs = await import('node:fs');
  const devFile = JSON.parse(fs.readFileSync(`${T.priv}/var/devices.json`, 'utf8'));
  check('…stored as a hash only (the cookie value is not in the server file)', Object.keys(devFile).length >= 1 && !JSON.stringify(devFile).includes(owner.jar[devName]));

  // 3. one attacker address locked after 5 failures; the owner's address unaffected
  const evil = as('198.51.100.66');
  let last;
  for (let i = 0; i < 6; i++) last = await evil.login('admin', 'wrong-' + i);
  check('one address: after 5 failures the 6th attempt is locked (429)', last.status === 429, String(last.status));
  const other = as('198.51.100.67');
  r = await other.login('admin', 'wrong');
  check('…another client behind the SAME proxy is not locked (401, a normal failure)', r.status === 401, String(r.status));

  // 4. account lock: 20 failures spread over many addresses (4 each)
  for (let a = 0; a < 5; a++) { const c = as(`192.0.2.${a + 1}`); for (let i = 0; i < 4; i++) await c.login('admin', `guess-${a}-${i}`); }
  r = await as('192.0.2.200').login('admin', PW);
  check('after 20 failures from many addresses the ACCOUNT is locked for a new browser, even with the right password (429)', r.status === 429, String(r.status));
  const ghost = await as('192.0.2.201').login('nobody-here', 'x');
  check('another account name has its own counter (a wrong name gets the same 401 as a wrong password)', ghost.status === 401, String(ghost.status));
  const back = as('203.0.113.99'); back.jar[devName] = owner.jar[devName];
  r = await back.login('admin', PW);
  check('…but the owner\'s RECOGNISED browser (device cookie from the earlier sign-in) still signs in (303)', r.status === 303, String(r.status));
  check('…and its device cookie was renewed (the old one retired)', back.jar[devName] && back.jar[devName] !== owner.jar[devName]);
  const forged = as('203.0.113.98'); forged.jar[devName] = 'a'.repeat(64);
  r = await forged.login('admin', PW);
  check('a forged / unknown device cookie gets no exemption (still 429)', r.status === 429, String(r.status));
  const stale = as('203.0.113.97'); stale.jar[devName] = owner.jar[devName];
  r = await stale.login('admin', PW);
  check('the retired (previous) device cookie no longer exempts (429)', r.status === 429, String(r.status));
  // a recognised device is itself limited: 5 failures lock that device
  // (each attempt from another address: only the device limit can stop them)
  let devCookie = back.jar[devName];
  for (let i = 0; i < 5; i++) { const d = as(`203.0.113.${120 + i}`); d.jar[devName] = devCookie; await d.login('admin', 'nope-' + i); }
  const dev = as('203.0.113.130'); dev.jar[devName] = devCookie;
  r = await dev.login('admin', PW);
  check('a recognised device is limited on its own (5 failures, even from changing addresses → 429)', r.status === 429, String(r.status));
} catch (e) {
  check('proxy-trust test ran', false, e.stack);
} finally {
  if (A) await A.close();
  if (T) await T.close();
}
console.log('finished');
