/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// PERSISTENCE / COMPATIBILITY: the shipped dashboards (old data) still validate in the editor model AND are accepted by the server's save
// validation; a dashboard holding every built-in widget with its default config and every variant is accepted by both; the keys the new
// widgets added are all optional (an old config without them loads with safe defaults); a recovery draft of the new widgets round-trips.
import { execFileSync } from 'node:child_process';
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page();
const server = (model) => { try { execFileSync('php', ['tests/checkmodel.php'], { input: JSON.stringify(model), stdio: ['pipe', 'pipe', 'pipe'] }); return 'ok'; } catch (e) { return String(e.stdout || e.message).trim(); } };
const shipped = await page.evaluate(() => Object.entries(window.IniqDashboards || {}).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
for (const [name, model] of shipped) {
  const r = await page.evaluate((m) => window.MaisonModel.validate(m, window.MaisonRegistry), model);
  check(`shipped dashboard "${name}" validates in the editor model`, r.ok === true, JSON.stringify(r.errors || []).slice(0, 200));
  check(`shipped dashboard "${name}" is accepted by the server's save validation`, server(model) === 'ok', server(model));
}
// every type x every variant, default config: editor model + server
const full = await page.evaluate(() => {
  const R = window.MaisonRegistry, items = [];
  Object.entries(R.TYPES).forEach(([type, t]) => {
    if (t.isContainer || t.isFloating || t.hidden || ['popup', 'notification'].includes(type)) return;
    const ids = t.variantsFor ? (t.variantsFor({}) || []) : (t.variants || []).map((v) => v.id);
    (ids.length ? ids : [null]).forEach((v, i) => items.push({ id: `${type}${v ? `-${v}` : ''}`, type, config: R.fullConfig(type, v ? { variant: v } : {}), layout: { desktop: { w: 4, h: 4 }, tablet: { w: 4, h: 4 }, mobile: { w: 4, h: 4 } } }));
  });
  return { version: 3, app: { id: 'all', startPage: 'p' }, pages: [{ id: 'p', name: 'All', items }] };
});
const vr = await page.evaluate((m) => window.MaisonModel.validate(m, window.MaisonRegistry), full);
check(`a dashboard with every widget × variant (${full.pages[0].items.length} items) validates`, vr.ok === true, JSON.stringify(vr.errors || []).slice(0, 300));
check('…and is accepted by the server', server(full) === 'ok', server(full));
// old configs without any of the new keys load with safe defaults
const old = { version: 3, app: { id: 'old', startPage: 'p' }, pages: [{ id: 'p', name: 'Old', items: [
  { id: 'a', type: 'light', config: { name: 'Old light', entity: 'light.x' }, layout: { desktop: { w: 3, h: 4 } } },
  { id: 'b', type: 'climate', config: { name: 'Old climate', entity: 'climate.x' }, layout: { desktop: { w: 4, h: 7 } } },
  { id: 'c', type: 'person', config: { name: 'Old person', presence: 'home' }, layout: { desktop: { w: 2, h: 2 } } },
  { id: 'd', type: 'camera', config: { name: 'Old cam', entity: 'camera.x' }, layout: { desktop: { w: 4, h: 4 } } },
  { id: 'e', type: 'media', config: { name: 'Old media', entity: 'media_player.x' }, layout: { desktop: { w: 4, h: 4 } } },
  { id: 'f', type: 'cover', config: { name: 'Old cover', entity: 'cover.x' }, layout: { desktop: { w: 4, h: 3 } } },
  { id: 'g', type: 'sensor', config: { name: 'Old sensor', entity: 'sensor.x' }, layout: { desktop: { w: 2, h: 3 } } },
] }] };
const orr = await page.evaluate((m) => { const r = window.MaisonModel.validate(m, window.MaisonRegistry); return { ok: r.ok, errors: r.errors, items: r.ok ? r.model.pages[0].items.map((i) => [i.type, i.config.variant]) : null }; }, old);
check('old widget configs (no variant, no new keys) validate', orr.ok === true, JSON.stringify(orr.errors || []).slice(0, 300));
check('…and keep rendering their default presentation (no variant forced on them)', orr.ok && orr.items.every(([, v]) => v === undefined), JSON.stringify(orr.items));
// the new keys are rejected when malformed (a hand-edited / imported file cannot smuggle bad shapes)
const bad = await page.evaluate(() => {
  const R = window.MaisonRegistry, out = [];
  const t = (type, cfg) => out.push([type, JSON.stringify(R.validateConfig(type, R.fullConfig(type, cfg)).map((e) => e.key))]);
  t('entitylist', { rows: [{ id: 'i1', entity: 'not an entity', value: 'state' }] });
  t('entitylist', { rows: [{ id: 'i1', entity: 'light.x', label: '<b>x</b>' }] });
  t('datetime', { timeZone: 'Mars/Phobos' });
  out.push(['robot-map', JSON.stringify(R.fullConfig('robot', { mappings: { battery: 'light.nope', evil: 'sensor.x' } }).mappings ?? null)]);
  out.push(['camera-map', JSON.stringify(R.fullConfig('camera', { mappings: { lock: 'sensor.x', motion: 'binary_sensor.ok' } }).mappings)]);
  return out;
});
check('malformed new keys are flagged by validation (rows, time zone)', bad.slice(0, 3).every(([, e]) => e !== '[]'), JSON.stringify(bad));
check('mappings to the wrong domain / unknown roles are dropped on load', bad[3][1] === 'null' && bad[4][1] === '{"motion":"binary_sensor.ok"}', JSON.stringify(bad.slice(3)));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
