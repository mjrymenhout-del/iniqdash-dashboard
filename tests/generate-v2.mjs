/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// GENERATOR v2 — the demo design filled with real entities (real server, real editor; a large fixture + the simulated home):
//   1  a large, messy installation (20 areas, 400+ entities: several lights per room, thermostats, media, security, energy, entities
//      without an area, long / accented / duplicate names, unavailable ones): every widget valid, Home · Lights · Climate · Rooms · Energy ·
//      Security pages, one room card per area, one room popup per area, nothing for a deselected area, the excluded entity nowhere
//   2  classification from METADATA (domain + device class): each entity in the right tab; empty tabs say so; unassigned ones only on the
//      optional Unassigned page (lists, ≤ 20 rows each)
//   3  through the Generate dialog (simulated home): the preview, Create → a NEW dashboard in the demo's theme; the existing one untouched
//   4  the Rooms page: a hero card per room (photo, temperature, lights x/y); a tap opens the room POPUP (not a page) with six tabs
//   5  controls work: a light in the Lights tab switches the real (simulated) light
//   6  editable: a widget moved and renamed, saved, reloaded
//   7  phone: the room popup fits the screen, no horizontal scrolling
//   8  a generation that cannot succeed creates nothing
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

// ---- the large fixture (fictional)
const AREAS = ['Salon', 'Cuisine', 'Chambre parentale', 'Chambre d’amis', 'Salle de bain — étage', 'Bureau', 'Garage', 'Jardin', 'Entrée', 'Buanderie', 'Grenier', 'Cave à vin <privée> & cellier du sous-sol de la maison',
  'Couloir', 'WC', 'Terrasse', 'Atelier', 'Piscine 🏊', 'Dressing', 'Bibliothèque', 'Salle de jeux'].map((name, i) => ({ id: `a${i}`, name }));
const E = (id, domain, name, areaId, dc = null, state = 'on', unit = null) => ({ id, domain, name, state, unit, dc, area: null, areaId });
const ents = [];
AREAS.forEach((a, i) => {
  for (let k = 0; k < 4; k++) ents.push(E(`light.a${i}_l${k}`, 'light', k === 3 ? 'Lampe' : `${a.name} lampe ${k} — un nom vraiment très long pour un plafonnier`, a.id));
  ents.push(E(`sensor.a${i}_temp`, 'sensor', `${a.name} température`, a.id, 'temperature', String(19 + i / 10), '°C'), E(`sensor.a${i}_hum`, 'sensor', `${a.name} humidité`, a.id, 'humidity', '50', '%'));
  ents.push(E(`binary_sensor.a${i}_motion`, 'binary_sensor', `${a.name} mouvement`, a.id, 'motion', 'off'), E(`switch.a${i}_plug`, 'switch', `${a.name} prise`, a.id));
  if (i % 3 === 0) ents.push(E(`climate.a${i}`, 'climate', `${a.name} thermostat`, a.id, null, 'heat'));
  if (i % 4 === 0) ents.push(E(`media_player.a${i}`, 'media_player', `${a.name} enceinte`, a.id, null, 'idle'));
  if (i % 5 === 0) ents.push(E(`binary_sensor.a${i}_door`, 'binary_sensor', `${a.name} porte`, a.id, 'door', 'off'), E(`lock.a${i}`, 'lock', `${a.name} serrure`, a.id, null, 'locked'));
  if (i % 6 === 0) ents.push(E(`sensor.a${i}_power`, 'sensor', `${a.name} puissance`, a.id, 'power', 'unavailable', 'W'));
  for (let k = 0; k < 6; k++) ents.push(E(`sensor.a${i}_x${k}`, 'sensor', `${a.name} mesure ${k}`, a.id, k % 2 ? 'illuminance' : null, String(k), 'lx'));
});
for (let k = 0; k < 60; k++) ents.push(E(`sensor.loose_${k}`, 'sensor', `Sans pièce ${k}`, null, 'temperature', '20', '°C'));
ents.push(E('person.p1', 'person', 'Anaïs-Marie de la Fontaine', null, null, 'home'), E('weather.home', 'weather', 'Météo', null, null, 'sunny'), E('sun.sun', 'sun', 'Soleil', null, null, 'above_horizon'),
  E('scene.soir', 'scene', 'Soirée', null, null, 'scening'), E('alarm_control_panel.home', 'alarm_control_panel', 'Alarme', 'a8', null, 'disarmed'), E('camera.jardin', 'camera', 'Caméra jardin', 'a7', null, 'idle'),
  E('sensor.house_power', 'sensor', 'House power', null, 'power', '1800', 'W'), E('sensor.solar_power', 'sensor', 'Solar power', null, 'power', '2400', 'W'), E('sensor.grid_power', 'sensor', 'Grid power', null, 'power', '-600', 'W'),
  E('sensor.energy_today', 'sensor', 'Energy today', null, 'energy', '12.4', 'kWh'));
const discovered = { ok: true, configured: true, connected: true, entities: ents, areas: AREAS };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  B = await liveBrowser(L, { viewport: { width: 1440, height: 900 } });
  const p = B.page, ev = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);

  // ---- 1 · 2 : the builder on the large fixture
  const g = await ev(async (d) => {
    const tpl = await (await fetch('assets/demo/iniqdash-demo.json')).json();
    const R = window.MaisonRegistry, M = window.MaisonModel;
    const areas = d.areas.map((a) => a.id).filter((id) => id !== 'a19');                       // one area left out
    const r = window.IniqGenerateDemo.build(d, R, { template: tpl, areas, exclude: ['light.a0_l0'], unassigned: 'page' });
    const v = M.validate(structuredClone(r.dashboard), R);
    const json = JSON.stringify(r.dashboard);
    const pop = (name) => r.dashboard.popups.find((x) => x.name === name);
    // the widget OF that entity (its own card), else a list row; the Active tab's activity list mentions many entities and is not their place
    const tabIdx = (pp, entity) => { const it = pp.items.find((i) => i.config && i.config.entity === entity) || pp.items.find((i) => i.config && (i.config.rows || []).some((x) => x.entity === entity)); return it ? it.tab : null; };
    const salon = pop('Salon'), cuis = pop('Cuisine'), gar = pop('Garage');
    const empties = r.dashboard.popups.flatMap((pp) => pp.items.filter((i) => i.type === 'text' && /^No /.test(i.config.primary || '')).map((i) => i.tab));
    const un = r.dashboard.pages.find((x) => x.id === 'unassigned');
    return {
      ok: v.ok, errors: v.ok ? [] : v.errors.slice(0, 3), pages: r.dashboard.pages.map((x) => x.id), rooms: r.summary.rooms.length,
      tiles: r.dashboard.pages.find((x) => x.id === 'rooms').items.filter((i) => i.type === 'roomtile').length,
      roomPopups: r.dashboard.popups.filter((x) => /^p-room-/.test(x.id)).length, excludedAnywhere: json.includes('"light.a0_l0"'), a19: json.includes('light.a19_'),
      tabs: { light: tabIdx(salon, 'light.a0_l1'), climate: tabIdx(salon, 'climate.a0'), media: tabIdx(salon, 'media_player.a0'), door: tabIdx(salon, 'binary_sensor.a0_door'), lock: tabIdx(salon, 'lock.a0'),
        temp: tabIdx(salon, 'sensor.a0_temp'), motion: tabIdx(cuis, 'binary_sensor.a1_motion'), plug: tabIdx(cuis, 'switch.a1_plug') },
      cuisTabs: cuis.items.find((i) => i.type === 'tabs').config.tabs.map((t) => t.id), cuisHeatingItems: cuis.items.filter((i) => i.tab === 'heating').length, emptyCount: empties.length,
      garLightsMore: gar.items.some((i) => i.tab === 'lights' && i.type === 'light'), unLists: un ? un.items.filter((i) => i.type === 'entitylist').map((i) => i.config.rows.length) : null,
      unassignedElsewhere: r.dashboard.pages.filter((x) => x.id !== 'unassigned' && x.id !== 'home' && x.id !== 'climate').some((x) => JSON.stringify(x).includes('sensor.loose_')),
      tileTap: r.dashboard.pages.find((x) => x.id === 'rooms').items.filter((i) => i.type === 'roomtile').every((i) => i.config.interactions.tap.action === 'popup'),
      energy: (() => { const e = r.dashboard.pages.find((x) => x.id === 'energy'); const f = e && e.items.find((i) => i.type === 'energy'); return f ? { entity: f.config.entity, nodes: f.config.nodes.map((n) => n.type) } : null; })(),
      theme: !!r.dashboard.app.theme, size: json.length,
    };
  }, discovered);
  check('1 · a large installation (20 areas, 400+ entities, long / accented / duplicate names): valid; Home · Lights · Climate · Rooms · Energy · Security (+ Unassigned); one card and one popup per chosen area; the left-out area and the excluded light nowhere',
    g.ok && ['home', 'lights', 'climate', 'rooms', 'energy', 'security', 'unassigned'].every((x) => g.pages.includes(x)) && g.rooms === 19 && g.tiles === 19 && g.roomPopups === 19 && g.tileTap && !g.excludedAnywhere && !g.a19 && g.theme && g.size < 1900 * 1024,
    JSON.stringify({ ok: g.ok, errors: g.errors, pages: g.pages, rooms: g.rooms, tiles: g.tiles, pops: g.roomPopups, ex: g.excludedAnywhere, a19: g.a19, size: g.size }));
  check('2 · classified from metadata: light → Lights · climate → Heating · media → Media · door, lock, motion → Security · temperature → Sensors · a switch → Active; NO empty tab is made (a room without heating has no Heating tab, no placeholder text anywhere); no-area entities only on the Unassigned page (lists of ≤ 20)',
    g.tabs.light === 'lights' && g.tabs.climate === 'heating' && g.tabs.media === 'media' && g.tabs.door === 'security' && g.tabs.lock === 'security' && g.tabs.motion === 'security' && g.tabs.temp === 'sensors' && g.tabs.plug === 'active'
      && !g.cuisTabs.includes('heating') && g.cuisHeatingItems === 0 && g.cuisTabs.length >= 2 && g.emptyCount === 0 && Array.isArray(g.unLists) && g.unLists.every((n) => n <= 20) && !g.unassignedElsewhere && g.energy && g.energy.entity === 'sensor.house_power' && g.energy.nodes.join() === 'solar,grid',
    JSON.stringify({ tabs: g.tabs, empties: g.emptyCount, un: g.unLists, elsewhere: g.unassignedElsewhere, energy: g.energy }));

  // ---- 3 · the dialog with the simulated home
  const before = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards.map((d) => [d.id, d.revision]);
  await ev(() => window.editor.setEditing(true)); await wait(400);
  await p.click('[data-k=more]'); await p.click('[data-k=dashboards]'); await p.waitForSelector('[data-k=dash-generate]'); await p.click('[data-k=dash-generate]');
  await p.waitForSelector('[data-k=gen-sim]', { timeout: 15000 }); await p.click('[data-k=gen-sim]'); await p.waitForSelector('[data-k=gen-area]', { timeout: 15000 }); await wait(600);
  const keep = ['demo_living', 'demo_kitchen', 'demo_bedroom', 'demo_office'];
  await ev((keep) => { document.querySelectorAll('[data-k=gen-area]').forEach((x) => { x.checked = keep.includes(x.value); }); document.querySelector('[data-k=gen-body]').dispatchEvent(new Event('change', { bubbles: true })); }, keep);
  await wait(400);
  const preview = await ev(() => document.querySelector('[data-k=gen-preview]').textContent);
  await p.fill('[data-k=gen-name]', 'Generated demo design');
  await p.click('[data-k=gen-create]');
  await p.waitForFunction(() => window.editor && window.editor.getModel().pages.some((x) => x.id === 'rooms'), null, { timeout: 25000 }); await wait(2000);
  const after = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards;
  const created = after.find((d) => d.name === 'Generated demo design');
  const untouched = before.every(([id, rev]) => after.some((d) => d.id === id && d.revision === rev));
  const model = await ev(() => window.editor.getModel());
  check('3 · the dialog: a preview of what will be created, then a NEW dashboard in the demo’s theme (rooms as popups); every existing dashboard untouched',
    /4 rooms as cards/.test(preview) && !!created && untouched && !!model.app.theme && model.popups.filter((x) => /^p-room-/.test(x.id)).length === 4 && !model.pages.some((x) => /living|kitchen/i.test(x.id)),
    JSON.stringify({ preview: preview.slice(0, 200), created: !!created, untouched, pages: model.pages.map((x) => x.id) }));
  // ---- 4 · Rooms: cards, a tap opens the room popup with six tabs
  await ev(() => { window.editor.setEditing(false); window.editor.go('rooms'); }); await wait(2500);
  const cards = await ev(() => [...document.querySelectorAll('.ed-canvas [data-grid-id^="r-"]')].filter((x) => x.querySelector('[class*="rt"], [class*="room"]')).map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  const tile = await ev(() => { const t = [...document.querySelectorAll('.ed-canvas [data-grid-id^="r-"]')].find((x) => /Living/.test(x.textContent)); const b = t.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  const page0 = await ev(() => window.editor.navigation().current);
  await p.mouse.click(tile[0], tile[1]); await wait(1800);
  const pop = await ev(() => ({ page: window.editor.navigation().current, tabs: [...document.querySelectorAll('[role=tab]')].filter((x) => x.offsetParent).map((x) => x.textContent.trim()), title: [...document.querySelectorAll('h2, h3')].map((x) => x.textContent).find((t) => /Living room/.test(t)) || '' }));
  check('4 · the Rooms page shows a hero card per room (temperature and lights x/y); a tap OPENS THE ROOM POPUP (the page stays) with Active · Lights · Heating · Media · Security · Sensors',
    cards.length >= 4 && cards.some((t) => /Living room/.test(t) && /\d+\/\d+/.test(t) && /°/.test(t)) && pop.page === page0 && ['Active', 'Lights', 'Heating', 'Media', 'Security', 'Sensors'].every((t) => pop.tabs.includes(t)) && pop.title,
    JSON.stringify({ cards: cards.slice(0, 4), pop }));
  // ---- 5 · a light in the Lights tab switches the simulated light
  await ev(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Lights' && x.offsetParent).click()); await wait(1200);
  const l0 = await ev(() => window.IniqHA.get('light.demo_living_floor')?.state);
  const sw = await ev(() => { const b = [...document.querySelectorAll('.mpop [aria-label="Floor lamp power"]')].find((x) => x.offsetParent); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  if (sw) await p.mouse.click(sw[0], sw[1]);
  await p.waitForFunction((was) => window.IniqHA.get('light.demo_living_floor')?.state !== was, l0, { timeout: 10000 }).catch(() => {});
  const l1 = await ev(() => window.IniqHA.get('light.demo_living_floor')?.state);
  check('5 · a control in the room popup works: the Floor lamp switch in the Lights tab switches the (simulated) light', !!sw && l0 && l1 && l0 !== l1, JSON.stringify({ sw: !!sw, l0, l1 }));
  await p.keyboard.press('Escape'); await wait(500);
  // ---- 6 · editable
  await ev(() => window.editor.setEditing(true)); await wait(400);
  const ed = await ev(() => { const md = window.editor.getModel(); const pp = md.popups.find((x) => /^p-room-/.test(x.id)); const it = pp.items.find((i) => i.type === 'light'); it.config.name = 'Renamed lamp'; const t = md.pages.find((x) => x.id === 'rooms').items.find((i) => i.type === 'roomtile'); t.layout.desktop.y += 30; t.config.name = 'Moved room'; return window.editor.setModel(md); });
  const saved = await ev(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  const back = await ev(() => { const md = window.editor.getModel(); return { lamp: md.popups.some((pp) => pp.items.some((i) => i.config.name === 'Renamed lamp')), room: md.pages.find((x) => x.id === 'rooms').items.some((i) => i.config.name === 'Moved room') }; });
  check('6 · a generated dashboard stays editable: a light in a popup renamed, a room card moved and renamed, saved and reloaded', ed.ok && saved && back.lamp && back.room, JSON.stringify({ ed, saved, back }));
  // ---- 7 · phone
  const phone = await B.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-GB', extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' }, storageState: await B.ctx.storageState() });
  const q = await phone.newPage();
  await q.goto(`${L.base}/?d=${created.id}&page=rooms`); await q.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await q.waitForTimeout(2500);
  const tile2 = await q.evaluate(() => { const t = [...document.querySelectorAll('.ed-canvas [data-grid-id^="r-"]')].find((x) => /Kitchen/.test(x.textContent)); t.scrollIntoView(); const b = t.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await q.waitForTimeout(400); await q.mouse.click(tile2[0], tile2[1]); await q.waitForTimeout(1800);
  const ph = await q.evaluate(() => { const d = document.querySelector('.mpop .mpop__panel') || document.querySelector('.mpop'); const b = d ? d.getBoundingClientRect() : null;
    return { open: !!d, w: b && Math.round(b.width), left: b && Math.round(b.left), sw: document.documentElement.scrollWidth, iw: innerWidth, tabs: [...document.querySelectorAll('[role=tab]')].filter((x) => x.offsetParent).length,
      want: ((window.editor.getModel().popups.find((pp) => pp.name === 'Kitchen') || { items: [] }).items.find((i) => i.type === 'tabs') || { config: { tabs: [] } }).config.tabs.length }; });
  if (process.env.SHOTS) await q.screenshot({ path: `${process.env.SHOTS}/gen-mobile-popup.png` });
  await phone.close();
  check('7 · on a phone the room popup fits the screen (no wider than it, nothing scrolls sideways) and shows exactly the room\'s own tabs', ph.open && ph.w <= ph.iw && ph.left >= 0 && ph.sw <= ph.iw && ph.want >= 2 && ph.tabs === ph.want, JSON.stringify(ph));
  // ---- 8 · a generation that cannot succeed creates nothing
  const n0 = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards.length;
  const fail = await ev((d) => { const R = window.MaisonRegistry; const fake = { ...R, TYPES: { ...R.TYPES } }; delete fake.TYPES.roomtile; try { window.IniqGenerateDemo.build(d, fake, {}); return 'no error'; } catch (e) { return e.message; } }, discovered);
  const n1 = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards.length;
  check('8 · a generation that cannot succeed stops with a message naming the problem, and nothing is created', /could not be generated/.test(fail) && /roomtile|Room tile/.test(fail) && n1 === n0, fail.slice(0, 200));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('generate-v2 test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
