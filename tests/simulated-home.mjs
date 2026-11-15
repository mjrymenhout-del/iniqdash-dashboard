/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE SIMULATED HOME (server/ha/SimHa.php) — a dashboard marked app.simulated is answered by the server's fictional home, through
// the SAME HaService code (normalisation, action plans, history, statistics), and NEVER reaches the configured Home Assistant.
// Real PHP server + a FAKE live Home Assistant (tests/lib/live.mjs) whose request log proves the isolation.
import fs from 'node:fs';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SIM = { 'X-IniqDash-Simulated': '1' };
let L, U, B;
try {
  L = await live();                                   // a configured (fake) live Home Assistant
  const me = L.client(); await me.login();
  const get = async (url, sim = true) => (await me.send('GET', url, { headers: sim ? SIM : {} })).json();
  const post = async (url, body, sim = true) => (await me.post(url, body, { headers: sim ? SIM : {} })).json();
  const n0 = L.haCalls.length;

  // ---- reading
  const st = await get('/api/ha_status.php');
  check('status: simulated, connected, without contacting Home Assistant', st.simulated === true && st.connected === true && L.haCalls.length === n0, JSON.stringify(st));
  let s = await get('/api/ha_states.php?ids=light.dining_ceiling,climate.pellet_stove,sensor.solar_power,sensor.grid_export_power,sensor.house_power,light.attic,light.nope');
  const e = s.states || {};
  check('states come from the simulated home, normalised by the real HaService (caps, attrs)', e['light.dining_ceiling']?.state === 'off' && e['light.dining_ceiling']?.caps?.brightness === true
    && e['climate.pellet_stove']?.attrs?.target_temperature === 18 && e['climate.pellet_stove']?.attrs?.current_temperature === 21.8, JSON.stringify(e['light.dining_ceiling']).slice(0, 160));
  check('energy is consistent: solar = house + export (no battery in this home)', Number(e['sensor.solar_power']?.state) === Number(e['sensor.house_power']?.state) + Number(e['sensor.grid_export_power']?.state));
  check('an unreachable device is unavailable (not "off"); an unknown id is not found', e['light.attic']?.available === false && e['light.nope'] === null);
  const ent = await get('/api/ha_entities.php?fresh=1');
  check('discovery lists the simulated entities with Home Assistant areas', (ent.entities || []).some((x) => x.id === 'light.kitchen_island' && x.area === 'Cuisine') && (ent.areas || []).length >= 10, JSON.stringify(ent).slice(0, 200));
  const hist = await get('/api/ha_history.php?entities=sensor.solar_power&range=24h&kind=numeric');
  check('history: a plausible series (24 h of solar power, zero at night)', (hist.results?.['sensor.solar_power']?.points || []).length > 20, JSON.stringify(hist).slice(0, 160));
  const stats = await get('/api/ha_statistics.php?entities=sensor.solar_energy_today,sensor.grid_import_today&period=hour');
  const sp = stats.results?.['sensor.solar_energy_today'];
  check('long-term statistics (WebSocket path): hourly changes with a unit', sp && sp.hasSum && sp.unit === 'kWh' && sp.points.length >= 12, JSON.stringify(stats).slice(0, 200));
  // ---- the demo home's WATER, GAS and CO₂: today's sensors, their statistics and the stated estimate agree
  const dm = (await get('/api/ha_states.php?ids=sensor.demo_water_today,sensor.demo_gas_today,sensor.demo_co2_today,sensor.demo_grid_import_today,sensor.demo_water_flow,sensor.demo_gas_flow,sensor.demo_event')).states || {};
  const nv = (id) => Number(dm[id]?.state);
  check('demo meters: water, gas and CO₂ today exist with units', dm['sensor.demo_water_today']?.unit === 'm³' && dm['sensor.demo_gas_today']?.unit === 'm³'
    && dm['sensor.demo_co2_today']?.unit === 'kg' && Number.isFinite(nv('sensor.demo_water_flow')) && Number.isFinite(nv('sensor.demo_gas_flow')), JSON.stringify(dm).slice(0, 300));
  check('CO₂ = imported kWh × 0.18 + gas m³ × 2.0 (the stated assumption)', Math.abs(nv('sensor.demo_co2_today') - (nv('sensor.demo_grid_import_today') * 0.18 + nv('sensor.demo_gas_today') * 2)) < 0.15, `${nv('sensor.demo_co2_today')}`);
  const ds = await get('/api/ha_statistics.php?entities=sensor.demo_water_today,sensor.demo_gas_today,sensor.demo_co2_today,sensor.demo_grid_import_today&period=day&days=7');
  const dpts = (id) => ds.results?.[id]?.points || [];
  const sameDays = ['sensor.demo_water_today', 'sensor.demo_gas_today', 'sensor.demo_co2_today'].every((id) => dpts(id).length >= 6 && dpts(id).every((p) => Number(p[1] ?? 0) >= 0));
  const co2ok = dpts('sensor.demo_co2_today').every((p, i) => { const g = dpts('sensor.demo_gas_today')[i], im = dpts('sensor.demo_grid_import_today')[i]; const v = (q) => Number(q?.[1] ?? 0);
    return g && im && Math.abs(v(p) - (v(im) * 0.18 + v(g) * 2)) < 0.05 + v(p) * 0.02; });
  check('daily statistics for water, gas and CO₂ (7 days), and every day\'s CO₂ follows the same factors', sameDays && co2ok, JSON.stringify(ds).slice(0, 400));
  const ev = dm['sensor.demo_event'];
  check('demo events: a fresh demo has none yet', ev?.state === 'none' && ev?.name === 'Demo event', JSON.stringify(ev).slice(0, 200));
  const cal = await get('/api/ha_calendar.php?entity=calendar.waste_collection');
  check('calendar events (today: PMC — blue bags, all day)', (cal.events || []).some((x) => x.title === 'PMC — blue bags' && x.allDay), JSON.stringify(cal).slice(0, 160));
  const fc = await get('/api/ha_forecast.php?entity=weather.home&type=daily');
  check('weather forecast (daily)', (fc.forecast || []).length >= 5, JSON.stringify(fc).slice(0, 160));

  // ---- acting: allow-listed actions change the simulation only
  let r = await post('/api/ha_call.php', { entity: 'light.dining_ceiling', action: 'brightness', value: 40 });
  s = await get('/api/ha_states.php?ids=light.dining_ceiling');
  check('a dimmer works: brightness 40 % → on at 40 %', r.ok && s.states['light.dining_ceiling'].state === 'on' && s.states['light.dining_ceiling'].attrs.brightness_pct === 40, JSON.stringify(s.states['light.dining_ceiling']?.attrs).slice(0, 120));
  r = await post('/api/ha_call.php', { entity: 'light.dining_ceiling', action: 'toggle' });
  s = await get('/api/ha_states.php?ids=light.dining_ceiling');
  check('a toggle works: on → off', r.ok && s.states['light.dining_ceiling'].state === 'off');
  r = await post('/api/ha_call.php', { entity: 'climate.pellet_stove', action: 'set_temperature', value: 19.5 });
  s = await get('/api/ha_states.php?ids=climate.pellet_stove');
  check('a thermostat target works: 18 → 19.5', r.ok && s.states['climate.pellet_stove'].attrs.target_temperature === 19.5);
  r = await post('/api/ha_call.php', { entity: 'switch.rice_cooker', action: 'toggle' });
  s = await get('/api/ha_states.php?ids=switch.rice_cooker');
  check('a switch works', r.ok && s.states['switch.rice_cooker'].state === 'on');
  r = await post('/api/ha_call.php', { entity: 'scene.evening', action: 'trigger' });
  s = await get('/api/ha_states.php?ids=light.dining_ceiling,light.living_ceiling');
  check('a scene switches its lights on', r.ok && s.states['light.dining_ceiling'].state === 'on' && s.states['light.living_ceiling'].state === 'on', JSON.stringify(r));
  r = await post('/api/ha_call.php', { entity: 'light.attic', action: 'toggle' });
  check('an unavailable device refuses the action (as with Home Assistant)', r.ok === false && r.error === 'unavailable', JSON.stringify(r));
  r = await post('/api/ha_call.php', { entity: 'light.kitchen', action: 'turn_on', value: null, service: 'homeassistant.restart' });
  check('the server\'s action allow-list still applies (no arbitrary service)', !JSON.stringify(r).includes('restart'));
  check('ISOLATION: the configured Home Assistant received NOTHING for any simulated request', L.haCalls.length === n0, JSON.stringify(L.haCalls.slice(n0).map((c) => c.url)));
  // pictures: the URL the server wrote carries sim=1 and is answered by the simulated client
  const img = await me.send('GET', '/api/ha_img.php?entity=person.alex&sim=1');
  check('a simulated picture request never reaches Home Assistant (404, no picture in the simulation)', img.status === 404 && L.haCalls.length === n0);

  // ---- the live mode is untouched
  const live1 = await get('/api/ha_states.php?ids=light.kitchen,light.dining_ceiling', false);
  check('without the flag: the LIVE Home Assistant answers, and the simulated entities do not exist there', L.haCalls.length > n0 && live1.states['light.dining_ceiling'] === null && live1.states['light.kitchen'] !== undefined, JSON.stringify(live1).slice(0, 160));
  const liveEnt = await get('/api/ha_entities.php?fresh=1', false);
  check('live discovery lists only live entities (separate caches)', !(liveEnt.entities || []).some((x) => x.id === 'light.kitchen_island') && (liveEnt.entities || []).length > 0);
  const simEnt2 = await get('/api/ha_entities.php');
  check('…and the simulated discovery still lists only simulated ones', (simEnt2.entities || []).some((x) => x.id === 'light.kitchen_island'));
  const simFiles = fs.existsSync(`${L.priv}/var/sim`) ? fs.readdirSync(`${L.priv}/var/sim`).filter((f) => /^s[0-9a-f]{40}\.json$/.test(f)) : [];
  check('the simulated state lives in the private folder (one file per signed-in session), never in the application folder', simFiles.length === 1, JSON.stringify(simFiles));

  // ---- ISOLATION BETWEEN VISITORS: a second sign-in (another browser) has a home of its own
  const other = L.client(); await other.login();
  const oget = async (url) => (await other.send('GET', url, { headers: SIM })).json();
  const opost = async (url, body) => (await other.post(url, body, { headers: SIM })).json();
  const mineNow = (await get('/api/ha_states.php?ids=light.demo_kitchen_main')).states['light.demo_kitchen_main'].state;
  await post('/api/ha_call.php', { entity: 'light.demo_kitchen_main', action: mineNow === 'on' ? 'turn_off' : 'turn_on', value: null });
  const mine2 = (await get('/api/ha_states.php?ids=light.demo_kitchen_main')).states['light.demo_kitchen_main'].state;
  const theirs = (await oget('/api/ha_states.php?ids=light.demo_kitchen_main')).states['light.demo_kitchen_main'].state;
  check('visitor A switches a demo light: A sees the change, visitor B (another session) does not', mine2 !== mineNow && theirs === mineNow, JSON.stringify({ mineNow, mine2, theirs }));
  await opost('/api/ha_call.php', { entity: 'light.demo_hall', action: 'turn_on', value: null });
  await opost('/api/ha_call.php', { entity: 'button.demo_reset', action: 'press', value: null });
  const afterReset = (await get('/api/ha_states.php?ids=light.demo_kitchen_main')).states['light.demo_kitchen_main'].state;
  check('visitor B resets the demo: only B\'s home is reset — A\'s change stays', afterReset === mine2, JSON.stringify({ afterReset, mine2 }));

  // ---- the editor: app.simulated, the badge, the mode follows the dashboard
  const dash = (simulated) => ({ version: 3, app: { id: 'x', startPage: 'p', navigation: {}, ...(simulated ? { simulated: true } : {}) }, pages: [{ id: 'p', name: 'P', nav: true, items: [
    { id: 'l1', type: 'light', parent: null, config: { name: 'Plafonnier', entity: 'light.dining_ceiling' }, layout: { desktop: { x: 1, y: 1, w: 3, h: 4 }, tablet: { x: 1, y: 1, w: 3, h: 4 }, mobile: { w: 2, h: 4 } } }] }] });
  const simId = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Simulated', dashboard: dash(true) })).json()).entry.id;
  const liveId = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Live', dashboard: dash(false) })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1280, height: 800 } }); const p = B.page;
  await p.goto(`${L.base}/editor.html?d=${simId}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated() && window.IniqHA.get('light.dining_ceiling'), null, { timeout: 15000 });
  const v = await p.evaluate(() => ({ badge: !document.querySelector('[data-k=sim-badge]').hidden, text: document.querySelector('[data-k=sim-badge]').textContent, kept: window.editor.getModel().app.simulated }));
  check('a simulated dashboard: the editor keeps app.simulated and shows "Simulated home" at all times', v.badge && /Simulated home/.test(v.text) && v.kept === true, JSON.stringify(v));
  const n1 = L.haCalls.length;
  await p.evaluate(() => window.IniqHA.call('light.dining_ceiling', 'toggle')); await p.waitForTimeout(1500);
  check('a control in the simulated dashboard: no request to Home Assistant', L.haCalls.length === n1, JSON.stringify(L.haCalls.slice(n1).map((c) => c.url)));
  await p.goto(`${L.base}/editor.html?d=${liveId}`); await p.waitForFunction(() => window.editor, null, { timeout: 15000 }); await p.waitForTimeout(1500);
  const w = await p.evaluate(() => ({ sim: window.IniqHA.simulated(), badge: !document.querySelector('[data-k=sim-badge]').hidden }));
  check('a normal dashboard stays live (no flag, no badge)', w.sim === false && w.badge === false, JSON.stringify(w));
  const bad = await p.evaluate(() => window.MaisonModel.validate({ version: 3, app: { simulated: 'yes' }, pages: [{ id: 'p', name: 'P', items: [] }] }, window.MaisonRegistry));
  check('app.simulated must be true or false', bad.ok === false && bad.errors.some((x) => /simulated/.test(x)));
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
  await B.close(); B = null;
  await L.close(); L = null;

  // ---- an installation WITHOUT Home Assistant: the simulated home still works
  U = await live({ configureHa: false });
  const u = U.client(); await u.login();
  const us = await (await u.send('GET', '/api/ha_states.php?ids=sensor.solar_power', { headers: SIM })).json();
  const uLive = await (await u.send('GET', '/api/ha_states.php?ids=sensor.solar_power')).json();
  check('no Home Assistant configured: the simulated home answers; live requests still say "not configured"', us.states?.['sensor.solar_power']?.state === '2380' && uLive.configured === false, JSON.stringify([us, uLive]).slice(0, 200));
} catch (e) {
  check('simulated-home test ran', false, e.stack);
} finally {
  if (B) await B.close();
  if (L) await L.close();
  if (U) await U.close();
}
console.log('finished');
