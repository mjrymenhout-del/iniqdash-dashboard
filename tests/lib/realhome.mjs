/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE REALISTIC HOME in the fake Home Assistant (tests/lib/live.mjs): tests/fixtures/ha-realistic-home.json loaded into the fake's states,
// areas and registry — so discovery runs its real server path (template + WebSocket registry) and every widget reads real-looking states
// (a dimmed light, a heating thermostat, a playing speaker…). loadRealHome({ registry: false }): an installation whose registry cannot be
// read (an older Home Assistant) — the generator then decides from domain, device class and names alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTITIES, AREAS, REGISTRY } from './live.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'ha-realistic-home.json');
export const REAL = JSON.parse(fs.readFileSync(FIX, 'utf8'));

/** a few realistic attributes per domain (only what the widgets read) */
function attrs(e, i) {
  const a = { name: e.name, unit: e.unit || null, dc: e.dc || null, area: e.areaId || null, ...(e.sc ? { sc: e.sc } : {}), ...(e.members ? { members: e.members } : {}) };
  if (e.state === 'unavailable') return a;            // Home Assistant keeps almost nothing of an unavailable entity's attributes
  if (e.domain === 'light') Object.assign(a, { f: 32, scm: ['color_temp', 'brightness'], cm: e.state === 'on' ? 'color_temp' : null, br: e.state === 'on' ? 90 + (i % 5) * 30 : null, ctk: e.state === 'on' ? 2900 : null, ckmin: 2200, ckmax: 6500 });
  if (e.domain === 'climate') Object.assign(a, { cur: 18.5 + (i % 4) * 0.7, target: e.state === 'off' ? null : 19 + (i % 3), min: 7, max: 30, step: 0.5, modes: ['heat', 'off'], action: e.state === 'heat' ? (i % 2 ? 'heating' : 'idle') : 'off', f: 1 });
  if (e.domain === 'media_player') Object.assign(a, { f: 152463, ...(e.state === 'playing' ? { title: 'Morning Jazz', artist: 'Studio Ensemble', vol: 0.35 } : {}) });
  if (e.domain === 'humidifier') Object.assign(a, { hum: 44, thum: 50, hmin: 30, hmax: 70 });
  if (e.domain === 'fan') Object.assign(a, { pct: e.state === 'on' ? 50 : 0, f: 1 });
  if (e.domain === 'cover') Object.assign(a, { pos: e.state === 'open' ? 100 : 0, f: 15 });
  if (e.domain === 'weather') Object.assign(a, { wt: 3.3, wtu: '°C', wh: 82, ws: 9, wsu: 'km/h' });
  return a;
}

export function loadRealHome({ registry = true } = {}) {
  Object.keys(ENTITIES).forEach((k) => delete ENTITIES[k]);
  Object.keys(AREAS).forEach((k) => delete AREAS[k]);
  REGISTRY.entities = {}; REGISTRY.devices = {}; REGISTRY.refuse = !registry;
  REAL.areas.forEach((a) => { AREAS[a.id] = a.name; });
  REAL.entities.forEach((e, i) => {
    ENTITIES[e.id] = [e.state, attrs(e, i)];
    if (!registry) return;
    const r = {};
    if (e.cat) r.ec = e.cat === 'config' ? 0 : 1;
    if (e.hidden) r.hb = true;
    if (e.platform) r.pl = e.platform;
    if (e.device) { r.di = e.device; REGISTRY.devices[e.device] = { name: e.deviceName || e.device, ...(e.service ? { entry_type: 'service' } : {}) }; }
    REGISTRY.entities[e.id] = r;
  });
  return REAL;
}
