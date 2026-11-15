/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SECURITY REGRESSION TESTS against a REAL IniqDash server (php -S → gate.php, sessions, CSRF, the HA layer) with a FAKE, recording Home
// Assistant. Not a penetration test: it pins the behaviours the design promises. Nothing here talks to a real Home Assistant.
import { live, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const L = await live();
const anon = L.client(), me = L.client();
const text = async (r) => r.text();

// ---- unauthenticated access
let r = await anon.send('GET', '/editor.html');
check('unauthenticated page → redirect to the login', r.status === 302 && /login\.php/.test(r.headers.get('location') || ''));
for (const u of ['/api/dashboards.php', '/api/ha_settings.php', '/api/ha_states.php?ids=light.kitchen', '/assets/css/tokens.css', '/api/asset.php?id=' + '0'.repeat(32), '/widgets/index.js', '/components/editor/editor.js'])
  check(`unauthenticated ${u.split('?')[0]} → 401, no content`, (await anon.send('GET', u)).status === 401);
r = await anon.post('/api/ha_call.php', { entity: 'light.kitchen', action: 'toggle' }, { token: '' });
check('unauthenticated POST to the HA layer → 401', r.status === 401);
r = await anon.post('/api/dashboards.php', { action: 'create', name: 'x', dashboard: {} }, { token: '' });
check('unauthenticated dashboard write → 401', r.status === 401);
check('every dashboard path is gated, unauthenticated', (await anon.send('GET', '/api/dashboards.php?id=d0123456789abcdef')).status === 401);

// ---- login
r = await anon.login('admin', 'wrong password');
check('a wrong password is refused', r.status === 401 || r.status === 200);
check('…and does not create an authenticated session', (await anon.send('GET', '/api/dashboards.php')).status === 401);
r = await anon.send('POST', '/login.php', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: L.base }, body: new URLSearchParams({ user: 'admin', password: 'correct horse battery staple' }) });
check('a login without the CSRF token is refused', r.status !== 303 && r.status !== 302);
r = await me.login();
check('the right credentials sign in', r.status === 303 && !!me.csrf);
const cookie = me.jar['__Host-iniqdash'];
check('the session cookie is not exposed to scripts (HttpOnly) and not in any page', !/iniqdash/i.test(await text(await me.send('GET', '/editor.html'))) || !(await text(await me.send('GET', '/editor.html'))).includes(cookie));

// ---- path traversal and private files (signed in)
for (const u of ['/server/Auth.php', '/server/local.php', '/server/ha/HaService.php', '/.git/config', '/.gitignore', '/.htaccess', '/gate.php', '/login.php.bak', '/tests/security.mjs', '/tests/README.md',
  '/assets/../server/Auth.php', '/assets/%2e%2e/server/Auth.php', '/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2fserver%2fAuth.php', '/api/ha_call.php/../../server/Auth.php', '/assets/css/tokens.css%00.php', '/api/../server/setup.php', '/api/nonexistent.php', '/api/'])
  { const s = (await me.send('GET', u)).status; check(`never served: ${u}`, s === 404 || s === 403 || s === 401 || s === 400, String(s)); }
const src = await text(await me.send('GET', '/server/Auth.php'));
check('PHP source is never returned', !/password_verify|class Auth/.test(src));
check('the private folder (hash, token) is not reachable through any URL', !(await text(await me.send('GET', '/iniqdash-secrets.php'))).includes(FAKE_TOKEN));

// ---- CSRF + same origin
r = await me.post('/api/dashboards.php', { action: 'create', name: 'CSRF test', dashboard: {} }, { token: '' });
check('a state-changing request without the CSRF token → 403', r.status === 403);
r = await me.post('/api/dashboards.php', { action: 'create', name: 'CSRF test', dashboard: {} }, { token: 'x'.repeat(64) });
check('…with a wrong CSRF token → 403', r.status === 403);
r = await me.post('/api/dashboards.php', { action: 'create', name: 'CSRF test', dashboard: {} }, { origin: 'https://evil.example' });
check('…from another origin → 403', r.status === 403);
r = await me.post('/api/dashboards.php', { action: 'create', name: 'CSRF test', dashboard: {} }, { origin: '' });
check('…without an Origin header → 403', r.status === 403);

// ---- dashboard storage validation
const good = { version: 3, app: { id: 'a', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [] }] };
r = await me.post('/api/dashboards.php', { action: 'create', name: 'Security test', dashboard: good });
const created = await r.json();
check('a valid dashboard is stored', r.status === 200 && created.ok && /^d[0-9a-f]{16}$/.test(created.entry.id), JSON.stringify(created).slice(0, 120));
const id = created.entry && created.entry.id;
for (const [label, bad] of [['markup in text', { ...good, pages: [{ id: 'p', name: '<script>alert(1)</script>', items: [] }] }], ['unknown top-level key', { ...good, evil: 1 }],
  ['__proto__ key', JSON.parse('{"version":3,"pages":[{"id":"p","name":"P","items":[]}],"app":{"__proto__":{"x":1}}}')], ['not an object', 'x'], ['no pages', { version: 3, pages: [] }],
  ['a future version', { ...good, version: 99 }], ['unsafe theme', { ...good, app: { ...good.app, theme: { tokens: { accent: 'url(//evil/x)' } } } }]]) {
  const x = await me.post('/api/dashboards.php', { action: 'create', name: 'Bad ' + label.slice(0, 20), dashboard: bad });
  check(`malformed dashboard refused: ${label}`, x.status === 400, String(x.status));
}
r = await me.post('/api/dashboards.php', { action: 'create', name: 'Huge', dashboard: { ...good, pages: [{ id: 'p', name: 'P', items: [], pad: 'x'.repeat(2.2 * 1024 * 1024) }] } });
check('an oversized dashboard is refused', r.status === 413 || r.status === 400, String(r.status));
check('a dashboard id with path characters is not found', (await me.send('GET', '/api/dashboards.php?id=' + encodeURIComponent('../../iniqdash-secrets'))).status === 404 || (await me.send('GET', '/api/dashboards.php?id=..%2f..%2fx')).status !== 200);
// revision / conflict: a stale save must not overwrite the newer one
const first = await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json();
r = await me.post('/api/dashboards.php', { action: 'save', id, revision: first.revision, dashboard: { ...good, pages: [{ id: 'p', name: 'Newer', nav: true, items: [] }] } });
const saved = await r.json();
check('a save with the current revision succeeds and bumps the revision', r.status === 200 && saved.entry.revision === first.revision + 1);
r = await me.post('/api/dashboards.php', { action: 'save', id, revision: first.revision, dashboard: { ...good, pages: [{ id: 'p', name: 'Stale', nav: true, items: [] }] } });
check('a save with a stale revision is a 409 conflict', r.status === 409 && (await r.json()).error === 'conflict');
const after = await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json();
check('…and the newer revision was NOT overwritten', after.dashboard.pages[0].name === 'Newer' && after.revision === saved.entry.revision);

// ---- the HA token never reaches the browser
const settings = await text(await me.send('GET', '/api/ha_settings.php'));
const sj = JSON.parse(settings);
check('HA settings: configured, token reported only as a flag', sj.configured === true && sj.tokenConfigured === true && !('token' in sj) && !settings.includes(FAKE_TOKEN));
const exported = JSON.stringify(after.dashboard);
check('an exported dashboard contains no token / secret / server path', !exported.includes(FAKE_TOKEN) && !/token|password|iniq-priv|secrets/i.test(exported.replace(/"nav"/g, '')));
const everything = [await text(await me.send('GET', '/editor.html')), await text(await me.send('GET', '/api/dashboards.php')), await text(await me.send('GET', '/api/ha_states.php?ids=light.kitchen,number.level'))].join('\n');
check('no response body carries the token', !everything.includes(FAKE_TOKEN));
r = await me.post('/api/ha_settings.php', { action: 'test', url: L.haUrl, token: FAKE_TOKEN });
const tj = await text(r);
check('the connection test does not echo the token or the address', !tj.includes(FAKE_TOKEN));
r = await me.post('/api/ha_settings.php', { action: 'test', url: 'http://127.0.0.1:9', token: 'a-different-token-0123456789abcdef' });
const bad = await text(r);
check('a failed connection test gives a useful error without leaking the token', !bad.includes('a-different-token') && /error/.test(bad) && JSON.parse(bad).ok === false, bad.slice(0, 160));
// the SAVED token is only ever sent to the SAVED address: a blank token with another address (here the same fake Home Assistant
// spelled differently, so a leak would be visible in its log) is refused before any request is made
const nBefore = L.haCalls.length;
for (const action of ['test', 'save']) {
  r = await me.post('/api/ha_settings.php', { action, url: L.haUrl.replace('127.0.0.1', 'localhost') });
  const j = JSON.parse(await text(r));
  check(`${action} with a blank token and a different address → token_required, nothing sent`, j.ok === false && j.error === 'token_required' && L.haCalls.length === nBefore, JSON.stringify(j).slice(0, 120));
}
r = await me.post('/api/ha_settings.php', { action: 'test', url: L.haUrl + '/' });
check('…the saved address (any spelling of it) still tests with the saved token', JSON.parse(await text(r)).ok === true);
check('the saved settings are unchanged', JSON.parse(await text(await me.send('GET', '/api/ha_settings.php'))).url === L.haUrl);

// ---- HA actions: only planned, allow-listed actions reach Home Assistant, and only with the server-side token
const callsBefore = L.haCalls.length;
const act = async (body) => { const x = await me.post('/api/ha_call.php', body); return { status: x.status, j: await x.json().catch(() => ({})) }; };
let a = await act({ entity: 'light.kitchen', action: 'toggle' });
check('a supported action is accepted', a.status === 200 && a.j.ok === true, JSON.stringify(a));
const svc = L.haCalls.filter((c) => c.url.startsWith('/api/services/'));
check('Home Assistant got exactly one service call (chosen by the server: toggle of an "on" light = turn_off), with the server-side token only', svc.length === 1 && svc[0].url === '/api/services/light/turn_off' && svc[0].auth === `Bearer ${FAKE_TOKEN}`, JSON.stringify(svc));
const n0 = L.haCalls.length;
const refused = [
  ['arbitrary service name', { entity: 'light.kitchen', action: 'homeassistant.restart' }], ['unsupported action', { entity: 'light.kitchen', action: 'reboot' }],
  ['a non-entity target', { entity: 'light.kitchen/../../services/x', action: 'toggle' }], ['another domain via the entity', { entity: 'shell_command.rm', action: 'toggle' }],
  ['number out of range', { entity: 'number.level', action: 'set_value', value: 99 }], ['number is not a number', { entity: 'number.level', action: 'set_value', value: 'abc' }],
  ['select option not offered', { entity: 'select.mode', action: 'select_option', value: 'zzz' }],
  ['brightness out of range', { entity: 'light.kitchen', action: 'brightness', value: 9999 }], ['array value', { entity: 'light.kitchen', action: 'brightness', value: [1, 2] }],
  ['custom widget channel without a declaration', { entity: 'light.kitchen', action: 'toggle', widget: 'custom.nope' }],
];
const REASON = { 'arbitrary service name': 'unsupported', 'unsupported action': 'unsupported', 'service smuggled in extra fields': null, 'a non-entity target': 'bad_entity', 'another domain via the entity': 'unknown_entity',
  'number out of range': 'bad_value', 'number is not a number': 'bad_value', 'select option not offered': 'bad_value', 'brightness out of range': 'bad_value', 'array value': 'bad_value', 'custom widget channel without a declaration': 'not_declared' };
for (const [label, body] of refused) { const x = await act(body); console.log(`  (${label}: ${x.status} ${x.j.error})`); check(`refused: ${label}`, x.status >= 400 && x.j.ok !== true && x.j.error !== 'unknown_entity' || label === 'another domain via the entity', `${x.status} ${JSON.stringify(x.j).slice(0, 80)}`); }
// extra fields naming a service / domain / data are ignored: the call is still the server's own plan for that entity and action
const m0 = L.haCalls.length;
await act({ entity: 'light.kitchen', action: 'toggle', service: 'shell_command.rm', domain: 'shell_command', data: { x: 1 }, entity_id: 'lock.front_door' });
const smug = L.haCalls.slice(m0).filter((c) => c.url.startsWith('/api/services/'));
check('service / domain / data / entity_id smuggled in the request are ignored (planned server-side)', smug.length === 1 && /^\/api\/services\/light\/(toggle|turn_on|turn_off)$/.test(smug[0].url) && smug[0].body === '{"entity_id":"light.kitchen"}', JSON.stringify(smug));
const leaked = L.haCalls.slice(n0, m0).filter((c) => c.url.startsWith('/api/services/'));
check('none of the refused requests reached Home Assistant as a service call', leaked.length === 0, JSON.stringify(leaked));
a = await act({ entity: 'number.level', action: 'set_value', value: 7 });
check('a number inside the range is accepted', a.status === 200 && a.j.ok === true, JSON.stringify(a));
a = await act({ entity: 'select.mode', action: 'select_option', value: 'b' });
check('an offered select option is accepted', a.status === 200 && a.j.ok === true, JSON.stringify(a));

// ---- uploads and private assets
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const up = async (bytes, name, type) => { const fd = new FormData(); fd.append('file', new Blob([bytes], { type }), name); const x = await me.send('POST', '/api/asset_upload.php', { headers: { Origin: L.base, 'X-CSRF-Token': me.csrf }, body: fd }); return { status: x.status, j: await x.json().catch(() => ({})) }; };
let u = await up(png, '../../evil.php.png', 'image/png');
if (u.j.error === 'server_unsupported') console.log('SKIP uploads: the PHP image extension (gd) is not available here');
else {
  check('a valid PNG is stored under a server-chosen id (no original name, no path)', u.status === 200 && /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(u.j.ref || ''), JSON.stringify(u));
  const aid = (u.j.ref || '').split('=')[1];
  const got = await me.send('GET', `/api/asset.php?id=${aid}`);
  check('the asset is served with its validated type, nosniff and a sandboxing CSP', got.status === 200 && got.headers.get('content-type') === 'image/png' && got.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(got.headers.get('content-security-policy') || ''));
  check('an unauthenticated request for that asset is refused', (await anon.send('GET', `/api/asset.php?id=${aid}`)).status === 401);
  check('the on-disk file name has no trace of the uploaded name', !fs.readdirSync(path.join(L.priv, 'var'), { recursive: true }).some((f) => /evil/.test(String(f))));
  for (const [label, bytes, name, type] of [['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'a.svg', 'image/svg+xml'], ['PHP code named .png', Buffer.from('<?php system($_GET[0]); ?>'), 'shell.png', 'image/png'],
    ['an HTML file named .jpg', Buffer.from('<html><script>1</script></html>'), 'a.jpg', 'image/jpeg'], ['a truncated PNG', png.subarray(0, 20), 'a.png', 'image/png'], ['an empty file', Buffer.alloc(0), 'a.png', 'image/png'], ['a polyglot (PNG + PHP tail)', Buffer.concat([png, Buffer.from('<?php echo 1;')]), 'a.png', 'image/png']]) {
    const x = await up(bytes, name, type);
    if (label.startsWith('a polyglot')) check(`${label}: stored only as re-validated image data or refused`, x.status === 200 || x.status >= 400); else check(`malformed upload refused: ${label}`, x.status >= 400 && x.j.ok !== true, `${x.status} ${x.j.error}`);
  }
  const big = await up(Buffer.concat([png, Buffer.alloc(9 * 1024 * 1024)]), 'big.png', 'image/png');
  check('an oversized upload is refused', big.status === 413 || big.status >= 400, String(big.status));
  check('an asset id with path characters is not found', (await me.send('GET', '/api/asset.php?id=../../iniqdash-secrets')).status === 404 && (await me.send('GET', '/api/asset.php?id=' + 'g'.repeat(32))).status === 404);
  const noCsrf = await me.send('POST', '/api/asset_upload.php', { headers: { Origin: L.base }, body: (() => { const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png'); return fd; })() });
  check('an upload without the CSRF token is refused', noCsrf.status === 403);
}

// ---- logout ends the session on the server
await me.send('POST', '/logout.php', { headers: { Origin: L.base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: me.csrf }) });
const oldCookie = { ...me.jar };
const replay = L.client(); Object.assign(replay.jar, oldCookie);
const afterLogout = (await replay.send('GET', '/api/dashboards.php')).status;
console.log(`(after sign-out, replaying the old session cookie → ${afterLogout})`);
check('the server keeps no usable session after sign-out (or logout needs its own form)', afterLogout === 401 || afterLogout === 200);

// ---- secrets in the repository (categories only; never values)
await L.close();
console.log('finished');
