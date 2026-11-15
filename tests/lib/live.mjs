/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// A REAL IniqDash server for security tests: the PHP built-in server running gate.php (sessions, CSRF, same-origin, the HA layer)
// with a private folder in a temp dir and a FAKE Home Assistant that records every request it receives. Not a real Home Assistant.
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

export const FAKE_TOKEN = 'fake-token-for-tests-0123456789abcdef-NOT-REAL';
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

/** entities of the fake HA: [id, state, picks] with the short keys of HaService::pick */
export const ENTITIES = {
  'light.kitchen': ['on', { name: 'Kitchen', f: 0, br: 100, cm: 'brightness', scm: ['brightness'] }],
  'number.level': ['5', { name: 'Level', nmin: 0, nmax: 10, nstep: 1 }],
  'select.mode': ['a', { name: 'Mode', opts: ['a', 'b'] }],
};

/** the fake HA's area registry: { area id: name } */
export const AREAS = {};
/** raw HA state objects ({ entity_id, state, attributes, … }) answered by GET /api/states/<id>, keyed by entity id */
export const RAW = {};
/** REGISTRY: what the fake WebSocket API answers config/entity_registry/list_for_display and config/device_registry/list with —
    entities: { id: { ec: 0 (config) | 1 (diagnostic), hb: true (hidden), di: device id, pl: integration } }, devices: { id: { name, entry_type, model } };
    REGISTRY.refuse = true: Home Assistant refuses the command (an older version) */
export const REGISTRY = { entities: {}, devices: {}, refuse: false };
/** FORECASTS[weather id] = { daily: [HA forecast entries], hourly: [...] } — what the fake weather.get_forecasts answers (tests only) */
export const FORECASTS = {};

/** HISTORY[id] = [[iso time, state], …] — what the fake answers GET /api/history/period/… with for that entity (tests only) */
export const HISTORY = {};
/** STATS[id] = { meta: { has_sum, has_mean, statistics_unit_of_measurement }, rows: { hour | day | week | month: [{ start (ms), change, mean, min, max }] } }
    — what the fake WebSocket API answers recorder/get_statistics_metadata and recorder/statistics_during_period with (tests only) */
export const STATS = {};

// trustedProxies: the test client stands in for a TLS-terminating reverse proxy on 127.0.0.1 (it sends X-Forwarded-Proto: https), so the
// server is told to trust that address (INIQDASH_TRUSTED_PROXIES); '' = trust nobody (tests/proxy-trust.mjs)
export async function live({ configureHa = true, user = 'admin', password = 'correct horse battery staple', trustedProxies = '127.0.0.1', demoInstall = false, fresh = false } = {}) {
  const priv = fs.mkdtempSync(path.join(os.tmpdir(), 'iniq-priv-'));
  const doc = fs.mkdtempSync(path.join(os.tmpdir(), 'iniq-doc-'));
  const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', password], { encoding: 'utf8' });
  const haCalls = [];
  const ha = { down: false, status: 0 };
  const fake = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      haCalls.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body });
      if (ha.down) { if (ha.status) { res.statusCode = ha.status; return res.end('{}'); } return req.socket.destroy(); }   // unreachable (or a proxy error)
      res.setHeader('Content-Type', 'application/json');
      // a token starting with "wrong-" is rejected the way Home Assistant does (401) — for the tests of a refused token
      if (/^Bearer wrong-/.test(req.headers.authorization || '')) { res.statusCode = 401; return res.end('{"message":"Invalid authentication"}'); }
      if (req.url === '/api/template') {
        // the entity DISCOVERY template (the pickers): { rows: [[id, state, friendly name, unit, device class, area name, area_id(entity), area_id(device)]],
        // areas: [[id, name]] } — an entity's own area (picks.area) and its DEVICE's area (picks.deviceArea) as two columns, as the template asks HA
        try { if (/for s in states/.test(JSON.parse(body).template || '')) return res.end(JSON.stringify({ areas: Object.entries(AREAS),
          rows: Object.keys(ENTITIES).map((i) => { const p = ENTITIES[i][1]; return [i, ENTITIES[i][0], p.name || null, p.unit || null, p.dc || null, null, p.area || null, p.deviceArea || null, p.sc || null, p.members || null]; }) })); } catch (e) { /* not a discovery */ }
        // ha.restOnly: an HA that answers state reads only through REST (GET /api/states/<id>, full attribute objects) — HaService's fallback path
        if (ha.restOnly) { res.statusCode = 400; return res.end('{}'); }
        let list = []; try { const tpl = JSON.parse(body).template || ''; list = JSON.parse((tpl.match(/\["[^\]]*"\]/) || ['[]'])[0]); } catch (e) { /* none */ }
        return res.end(JSON.stringify(list.filter((i) => ENTITIES[i]).map((i) => [i, ENTITIES[i][0], '2026-10-23T10:00:00+00:00', ENTITIES[i][1], '2026-10-23T10:00:00+00:00', null])));
      }
      if (req.url === '/api/config') return res.end(JSON.stringify({ version: '2026.10.0', location_name: 'Test', unit_system: {} }));
      // weather.get_forecasts (return_response): the forecast a test gave the entity in FORECASTS[id][type] — HA's response shape
      if (req.url.startsWith('/api/services/weather/get_forecasts')) {
        let b = {}; try { b = JSON.parse(body); } catch (e) { /* none */ }
        const list = FORECASTS[b.entity_id] && FORECASTS[b.entity_id][b.type];
        if (!list) { res.statusCode = 400; return res.end('{}'); }
        return res.end(JSON.stringify({ changed_states: [], service_response: { [b.entity_id]: { forecast: list } } }));
      }
      if (req.url.startsWith('/api/services/')) return res.end('[]');
      // a single raw state object (GET /api/states/<id>): only for entities given one in RAW (the inspector test); others stay 404
      { const m = /^\/api\/states\/([^/?]+)$/.exec(req.url); if (m && RAW[decodeURIComponent(m[1])]) return res.end(JSON.stringify(RAW[decodeURIComponent(m[1])])); }
      { const m = /^\/api\/states\/([^/?]+)$/.exec(req.url), id = m && decodeURIComponent(m[1]);
        if (ha.restOnly && id && ENTITIES[id]) return res.end(JSON.stringify({ entity_id: id, state: ENTITIES[id][0], attributes: ENTITIES[id][1], last_changed: '2026-10-23T10:00:00+00:00', last_updated: '2026-10-23T10:00:00+00:00' })); }
      // the recorder's history (GET /api/history/period/<start>?filter_entity_id=a,b&…): one list per entity that has HISTORY
      if (req.url.startsWith('/api/history/period/')) {
        const ids = decodeURIComponent((/filter_entity_id=([^&]+)/.exec(req.url) || [])[1] || '').split(',').filter(Boolean);
        return res.end(JSON.stringify(ids.filter((i) => HISTORY[i]).map((i) => HISTORY[i].map(([t, st], k) => (k ? { state: String(st), last_changed: t } : { entity_id: i, state: String(st), last_changed: t })))));
      }
      if (req.url === '/api/states') return res.end(JSON.stringify(Object.keys(ENTITIES).map((i) => ({ entity_id: i, state: ENTITIES[i][0], attributes: {} }))));
      res.statusCode = 404; res.end('{}');
    });
  });
  // HA's WEBSOCKET API (read-only use by the server: auth, then recorder statistics) — a minimal RFC 6455 server
  fake.on('upgrade', (req, sock) => {
    if (req.url !== '/api/websocket' || ha.down) return sock.destroy();
    const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const send = (o) => { const d = Buffer.from(JSON.stringify(o)); const h = d.length < 126 ? Buffer.from([0x81, d.length]) : d.length < 65536 ? Buffer.from([0x81, 126, d.length >> 8, d.length & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(d.length), 2); return b; })(); sock.write(Buffer.concat([h, d])); };
    let buf = Buffer.alloc(0), authed = false;
    send({ type: 'auth_required', ha_version: '2026.10.0' });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const op = buf[0] & 15, masked = (buf[1] & 128) !== 0; let len = buf[1] & 127, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + (masked ? 4 : 0) + len) return;
        const mask = masked ? buf.subarray(off, off + 4) : null; off += masked ? 4 : 0;
        const data = Buffer.from(buf.subarray(off, off + len)); if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
        buf = buf.subarray(off + len);
        if (op === 8) { sock.end(); return; }
        if (op !== 1) continue;
        let m = {}; try { m = JSON.parse(data.toString()); } catch (e) { continue; }
        haCalls.push({ method: 'WS', url: m.type, auth: m.type === 'auth' ? `Bearer ${m.access_token}` : '', body: JSON.stringify(m) });
        if (m.type === 'auth') { authed = m.access_token === FAKE_TOKEN; send({ type: authed ? 'auth_ok' : 'auth_invalid' }); if (!authed) sock.end(); continue; }
        if (!authed) { sock.end(); return; }
        if (m.type === 'config/entity_registry/list_for_display' && !REGISTRY.refuse) {
          send({ id: m.id, type: 'result', success: true, result: { entity_categories: { 0: 'config', 1: 'diagnostic' },
            entities: Object.keys(ENTITIES).map((i) => ({ ei: i, ...(REGISTRY.entities[i] || {}) })) } });
        } else if (m.type === 'config/device_registry/list' && !REGISTRY.refuse) {
          send({ id: m.id, type: 'result', success: true, result: Object.entries(REGISTRY.devices).map(([id, d]) => ({ id, ...d })) });
        } else if (m.type === 'recorder/get_statistics_metadata') {
          send({ id: m.id, type: 'result', success: true, result: (m.statistic_ids || []).filter((i) => STATS[i]).map((i) => ({ statistic_id: i, source: 'recorder', ...STATS[i].meta })) });
        } else if (m.type === 'recorder/statistics_during_period') {
          const from = Date.parse(m.start_time), to = Date.parse(m.end_time), out = {};
          (m.statistic_ids || []).forEach((i) => { const rows = STATS[i] && STATS[i].rows && STATS[i].rows[m.period]; if (rows) out[i] = rows.filter((r) => r.start >= from - 1 && r.start < to).map((r) => ({ start: r.start, end: r.start + 3600000, ...r })); });
          send({ id: m.id, type: 'result', success: true, result: out });
        } else send({ id: m.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command.' } });
      }
    });
    sock.on('error', () => {});
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const haUrl = `http://127.0.0.1:${fake.address().port}`;
  // fresh: a NEW installation — no administrator yet (the first-run wizard's case); the Home Assistant connection only when asked
  const arr = { ...(fresh ? {} : { admin: { user, hash } }), ...(configureHa ? { ha: { url: haUrl, token: FAKE_TOKEN } } : {}) };
  if (!fresh || configureHa) execFileSync('php', ['-r', 'file_put_contents($argv[1], "<?php\\nreturn " . var_export(json_decode($argv[2], true), true) . ";\\n");', path.join(priv, 'iniqdash-secrets.php'), JSON.stringify(arr)]);
  const port = await freePort();
  const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', doc, path.join(ROOT, 'tests/lib/router.php')], { env: { ...process.env, INIQDASH_PRIVATE: priv, INIQDASH_TRUSTED_PROXIES: trustedProxies, INIQDASH_DEMO_INSTALL: demoInstall ? 'on' : 'off' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { await fetch(`${base}/login.php`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }

  /** a browser-like client with a cookie jar; every request claims HTTPS the way a proxy would (so the secure cookie name is used) */
  function client({ headers: extra = {} } = {}) {          // extra: headers on every request (e.g. X-Forwarded-For, as a proxy adds it)
    const jar = {}; let csrf = '';
    const send = async (method, url, { headers = {}, body, redirect = 'manual' } = {}) => {
      const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(base + url, { method, redirect, body, headers: { 'X-Forwarded-Proto': 'https', ...extra, ...(ck ? { Cookie: ck } : {}), ...headers } });
      (r.headers.getSetCookie?.() || []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); });
      return r;
    };
    return {
      send, jar, get csrf() { return csrf; },
      async login(u = user, p = password) {
        const page = await (await send('GET', '/login.php')).text();
        const t = /name="csrf" value="([^"]+)"/.exec(page)?.[1] || '';
        const r = await send('POST', '/login.php', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams({ csrf: t, user: u, password: p, next: 'editor.html' }) });
        if (r.status === 303 || r.status === 302) { const h = await (await send('GET', '/editor.html')).text(); csrf = /name="iniqdash-csrf" content="([^"]+)"/.exec(h)?.[1] || ''; }
        return r;
      },
      post: (url, json, { origin = base, token = csrf, headers = {} } = {}) => send('POST', url, { headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(token ? { 'X-CSRF-Token': token } : {}), ...headers }, body: JSON.stringify(json) }),
    };
  }
  return { base, priv, client, haCalls, haUrl, ha, setEntity: (id, state, picks) => { ENTITIES[id] = [state, picks || (ENTITIES[id] ? ENTITIES[id][1] : {})]; }, removeEntity: (id) => { delete ENTITIES[id]; }, async close() { php.kill(); fake.close(); fs.rmSync(priv, { recursive: true, force: true }); fs.rmSync(doc, { recursive: true, force: true }); } };
}

/** a Chromium page signed in to the live server through the real login form (every request carries X-Forwarded-Proto: https, as a TLS proxy would) */
export async function liveBrowser(L, { viewport = { width: 1400, height: 900 }, user = 'admin', password = 'correct horse battery staple' } = {}) {
  const { playwright } = await import('./harness.mjs');
  const browser = await playwright().chromium.launch();
  const ctx = await browser.newContext({ viewport, locale: 'en-GB', timezoneId: 'Europe/Amsterdam', extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.errors = errors;
  const failed = []; page.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 400 && !/favicon/.test(u.pathname)) failed.push(`${r.status()} ${u.pathname}`); });
  page.failed = failed;
  await page.goto(`${L.base}/login.php?next=editor.html`);
  await page.fill('input[name=user]', user); await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL(/editor\.html/), page.click('button[type=submit]')]);
  await page.waitForFunction(() => window.editor && window.MaisonRegistry, null, { timeout: 15000 });
  return { page, ctx, browser, errors, failed, async close() { await browser.close(); } };
}
