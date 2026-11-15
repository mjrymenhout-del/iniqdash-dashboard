/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM / SCENE completion: dynamic scenes (add / remove / reorder, positions shared with the secure action slots), compatibility with
// stored Scene 1–5 configurations, the standard card Interactions next to the scene buttons, the picture following the mapped lights,
// truthful information, the arrangements for the card's own size and the "+N" / panel overflow. Real PHP server + FAKE Home Assistant.
import { live, liveBrowser, RAW } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
// Room 1.4 icon names are read as their MDI icons
const window_mdi = (k) => ({ bulb: 'mdi:lightbulb', movie: 'mdi:movie-open', lamp: 'mdi:lamp', moon: 'mdi:weather-night', power: 'mdi:power' })[k] || k;
let L, B;
try {
  L = await live();
  L.setEntity('light.a', 'off', { name: 'A', f: 0 }); L.setEntity('light.b', 'off', { name: 'B', f: 0 });
  L.setEntity('sensor.temp', '20.84', { name: 'Temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.aq', '61.7', { name: 'Air quality', unit: '%' });
  L.setEntity('scene.relax', 'unknown', { name: 'Relax' }); L.setEntity('script.movie', 'off', { name: 'Movie' }); L.setEntity('button.off', 'unknown', { name: 'Off' });
  for (let i = 1; i <= 8; i++) L.setEntity(`scene.s${i}`, 'unknown', { name: `S${i}` });
  L.setEntity('sensor.hum', '58', { name: 'Humidity', unit: '%', dc: 'humidity' }); L.setEntity('binary_sensor.door', 'on', { name: 'Back door', dc: 'door' });
  L.setEntity('sensor.dead', 'unavailable', { name: 'Dead sensor', unit: 'W' });
  RAW['sensor.hum'] = { entity_id: 'sensor.hum', state: '58', attributes: { unit_of_measurement: '%', device_class: 'humidity', friendly_name: 'Humidity' } };
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const calls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url));

  // ---- 1 / 2 / 19: a stored Scene 1–5 configuration loads unchanged (labels, icons, mappings, positions)
  const OLD = { name: 'Lounge', scenes: [{ label: 'Relax', icon: 'bulb' }, { label: 'Movie', icon: 'movie' }, { label: 'Evening', icon: 'lamp' }, { label: 'Night', icon: 'moon' }, { label: 'All Off', icon: 'power' }],
    haSlots: { scenes: ['scene.relax', 'script.movie', null, 'scene.s4', 'button.off'] }, haRoles: { lights: ['light.a', 'light.b'], temperature: 'sensor.temp', air_quality: 'sensor.aq' } };
  const old = await E(({ id, c }) => { const R = window.MaisonRegistry, f = R.fullConfig(id, c); return { f, errs: R.validateConfig(id, c) }; }, { id: ID, c: OLD });
  check('1 a stored Room configuration loads and validates', old.errs.length === 0, JSON.stringify(old.errs));
  check('2 its five scenes keep label, icon (read as its MDI icon) and position', JSON.stringify(old.f.scenes) === JSON.stringify(OLD.scenes.map((x) => ({ ...x, icon: window_mdi(x.icon) }))), JSON.stringify(old.f.scenes));
  check('2 its mappings keep their positions (slot i = scene i)', JSON.stringify(old.f.haSlots.scenes) === JSON.stringify(OLD.haSlots.scenes), JSON.stringify(old.f.haSlots));
  const orphan = await E((id) => window.MaisonRegistry.fullConfig(id, { name: 'X', scenes: [{ label: 'One', icon: 'sun' }], haSlots: { scenes: ['scene.s1', null, 'scene.s3'] } }), ID);
  check('19 a mapping beyond the stored entries gets its entry (no mapping lost, deterministic)', orphan.scenes.length === 3 && orphan.scenes[0].label === 'One' && orphan.haSlots.scenes[2] === 'scene.s3', JSON.stringify(orphan));
  const fresh = await E((id) => window.MaisonRegistry.fullConfig(id, {}), ID);
  check('S1 / I7 a brand-new Room has no scenes and no information (no Relax / Movie / Evening / All Off, no Temperature / AQI)', !(fresh.scenes || []).length && fresh.info === undefined && !fresh.labels, JSON.stringify(fresh));
  const mig = await E(({ id, c }) => window.MaisonRegistry.fullConfig(id, c), { id: ID, c: { ...OLD, labels: { temperature: 'Inside' } } });
  check('21 the old Temperature / Air-quality mapping becomes Information lines (order, caption, icon, colour kept; old fields gone)',
    JSON.stringify(mig.info) === JSON.stringify([{ id: 'i1', entity: 'sensor.temp', value: 'state', label: 'Inside', icon: 'mdi:thermometer', color: 'accent-hot' }, { id: 'i2', entity: 'sensor.aq', value: 'state', label: 'Air quality', icon: 'mdi:leaf', color: 'success' }])
    && !mig.labels && mig.haRoles.temperature === undefined && mig.haRoles.lights.join() === 'light.a,light.b', JSON.stringify(mig));
  const mig1 = await E(({ id }) => window.MaisonRegistry.fullConfig(id, { name: 'Z', haRoles: { lights: ['light.a'], air_quality: 'sensor.aq' } }), { id: ID });
  check('21 nothing is created for a value that was never mapped (only air quality → one line)', mig1.info.length === 1 && mig1.info[0].entity === 'sensor.aq', JSON.stringify(mig1.info));
  check('21 a migrated configuration validates', (await E(({ id, c }) => window.MaisonRegistry.validateConfig(id, c).length, { id: ID, c: OLD })) === 0);

  // ---- 3 / 6: the configuration — scenes as compact rows (the collection editor itself: tests/room-collection.mjs)
  await E(({ id, c }) => { const f = window.MaisonForm.create({ type: id, config: c }); f.el.id = 'rf'; document.body.prepend(f.el); window.__rf = f; f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, { id: ID, c: OLD });
  const sceneRows = (s) => E((q) => [...document.querySelectorAll(`${q} [data-col="scenes"] .ef-col__row`)].map((r) => r.querySelector('.ef-col__t').textContent), s);
  check('3 one row per configured scene — no empty slots', (await sceneRows('#rf')).join() === 'Relax,Movie,Evening,Night,All Off', (await sceneRows('#rf')).join());
  for (const t of ['Read', 'Wake', 'Away']) {
    await page.click('#rf [data-col="scenes"] [data-k=col-add]');
    await page.fill('#rf [data-k=item-editor] .ef-field[data-key="label"] input', t);
    await page.click('#rf [data-k=item-editor] [data-k=sub-save]'); await page.waitForTimeout(100);
  }
  const v8 = await E(() => window.__rf.value());
  const L8 = (v) => (Array.isArray(v) ? v : Object.keys(v || {}).sort((a, b) => a - b).map((k) => v[k]));
  check('6 at most 8 scenes (the action-slot limit): Add is disabled there', L8(v8.scenes).length === 8 && await E(() => document.querySelector('#rf [data-col="scenes"] [data-k=col-add]').disabled));
  check('the mappings kept their positions while scenes were added', JSON.stringify(L8(v8.haSlots.scenes)) === JSON.stringify(OLD.haSlots.scenes), JSON.stringify(v8.haSlots));
  check('the edited configuration validates', (await E(() => window.__rf.errors().length)) === 0, JSON.stringify(await E(() => window.__rf.errors())));
  // ---- a NEW Room: Scenes and Information start empty
  await E(({ id }) => { const f = window.MaisonForm.create({ type: id, config: window.MaisonRegistry.fullConfig(id, {}) }); f.el.id = 'nf'; document.body.prepend(f.el); f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, { id: ID });
  check('S1 / I7 a new Room: no scene rows, no information rows — only "+ Add scene" / "+ Add information"', await E(() => !document.querySelector('#nf .ef-col__row') && /\+ Add scene/.test(document.querySelector('#nf [data-col="scenes"]').textContent) && /\+ Add information/.test(document.querySelector('#nf [data-col="info"]').textContent)));
  check('the Room form has no fixed Temperature / Air-quality fields or captions', await E(() => ![...document.querySelectorAll('#nf .ef-label')].some((l) => /^(Temperature|Air quality)( caption)?$/.test(l.textContent))));
  await E(() => document.getElementById('nf').remove());
  check('standard Interactions section is part of the Room configuration', await E((id) => ['tap', 'doubleTap', 'longPress'].every((g) => window.MaisonRegistry.TYPES[id].fields.some((f) => f.key === `interactions.${g}.action`)) && window.MaisonRegistry.TYPES[id].groups.some((g) => g[0] === 'interactions'), ID));
  await E(() => document.getElementById('rf').remove());

  // ---- the widget, live
  const mount = (c, w, h) => E(({ id, c, w, h }) => {
    document.getElementById('rw')?.remove();
    const box = document.createElement('div'); box.id = 'rw';
    box.style.cssText = `position:fixed;left:20px;top:20px;width:${w}px;height:${h}px;z-index:99999;display:grid`;
    window.__acts = [];
    box.addEventListener('maison:action', (e) => { window.__acts.push({ type: e.detail.action.type, page: e.detail.action.page, popup: e.detail.action.popup, gesture: e.detail.meta && e.detail.meta.gesture }); e.stopPropagation(); });
    box.append(window.MaisonRegistry.build(id, c)); document.body.append(box);
  }, { id: ID, c, w, h });
  const room = (fn) => E(fn);
  const LIVE = { name: 'Lounge', scenes: OLD.scenes, haSlots: OLD.haSlots, haRoles: OLD.haRoles,
    interactions: { tap: { action: 'navigate', page: 'p-tap' }, doubleTap: { action: 'popup', popup: 'pop-dbl' }, longPress: { action: 'navigate', page: 'p-long' } } };
  await mount(LIVE, 900, 560);
  await page.waitForFunction(() => { const r = document.querySelector('#rw .iq-room'); return r && r.dataset.lit && r.dataset.lit !== 'unknown'; }, null, { timeout: 15000 });
  const lit = () => room(() => { const r = document.querySelector('#rw .iq-room'); return { lit: r.dataset.lit, filter: getComputedStyle(r.querySelector('.iq-room__img, .iq-room__fallback')).filter }; });
  const L0 = await room(() => { const r = document.querySelector('#rw .iq-room'); return r.querySelector(r.dataset.hasImage === 'true' ? '.iq-room__img' : '.iq-room__fallback') ? 1 : 0; });
  let st = await lit();
  check('12 every mapped light off → the Room OFF picture (desaturated, dimmed)', st.lit === 'false' && /grayscale/.test(st.filter) && /brightness/.test(st.filter), JSON.stringify(st) + L0);
  L.setEntity('light.b', 'on');
  await page.waitForFunction(() => document.querySelector('#rw .iq-room').dataset.lit === 'true', null, { timeout: 15000 });
  st = await lit();
  check('13 any mapped light on → the Room ON picture (full colour)', st.lit === 'true' && (st.filter === 'none' || !/grayscale/.test(st.filter)), JSON.stringify(st));
  check('13 the lights are known (1 on) but never printed: no summary, no light words, the temperature only in its Information line', await room(() => { const r = document.querySelector('#rw .iq-room'); const t = r.innerText; return r.room.getState().functional.lights.on === 1 && !r.querySelector('.iq-room__sum') && !/lights? (on|off)/i.test(t) && (t.match(/20\.84/g) || []).length === 1; }), await room(() => document.querySelector('#rw .iq-room').innerText));
  L.setEntity('light.b', 'unavailable'); L.setEntity('light.a', 'off');
  await page.waitForFunction(() => document.querySelector('#rw .iq-room').dataset.lit === 'unknown', null, { timeout: 15000 });
  st = await lit();
  check('14 a light HA does not report (unavailable) → neutral dimmed, never the ON picture', st.lit === 'unknown' && /grayscale/.test(st.filter), JSON.stringify(st));
  L.setEntity('light.b', 'unknown');
  await page.waitForTimeout(2600);
  check('14 state "unknown" → still not the ON picture', (await lit()).lit === 'unknown');
  L.setEntity('light.b', 'off');
  await page.waitForFunction(() => document.querySelector('#rw .iq-room').dataset.lit === 'false', null, { timeout: 15000 });
  check('12 back to every light reported off → OFF picture', true);
  const stats = await room(() => [...document.querySelectorAll('#rw .iq-room__stat')].map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
  check('15 / 21 an old Room shows its migrated Information: temperature, air quality as reported, in order', stats.length === 2 && /^20\.84 °C ?Temperature$/.test(stats[0]) && /^61\.7 ?% ?Air quality$/.test(stats[1]), JSON.stringify(stats));
  check('21 with their old icons and colours', await room(() => { const l = [...document.querySelectorAll('#rw .iq-room__stat .iq-room__sicon')]; return l.length === 2 && l[0].style.color === 'var(--accent-hot)' && l[1].style.color === 'var(--success)'; }));
  check('17 Large: stats, Devices / scenes and the scene row (5 of 5 shown, no overflow)', await room(() => { const r = document.querySelector('#rw .iq-room'); return r.dataset.fitArr === 'large' && r.dataset.scenesShown === '5' && !r.querySelector('.iq-room__scene--more'); }));

  // ---- 7 / 11: a scene press uses the secure action slot only, never a card gesture
  let n0 = calls().length;
  await page.click('#rw .iq-room__scene[data-index="0"]'); await page.waitForTimeout(800);
  let k = calls().slice(n0);
  check('7 scene button → the secure slot path (server planned scene.turn_on for slot 0)', k.length === 1 && k[0].url === '/api/services/scene/turn_on' && JSON.parse(k[0].body).entity_id === 'scene.relax', JSON.stringify(k));
  check('11 the scene press is not a card gesture', (await E(() => window.__acts.length)) === 0);
  n0 = calls().length;
  await page.click('#rw .iq-room__scene[data-index="4"]'); await page.waitForTimeout(800);
  check('7 slot 4 → button.press of its own entity', calls().length === n0 + 1 && calls().at(-1).url === '/api/services/button/press' && JSON.parse(calls().at(-1).body).entity_id === 'button.off');

  // ---- 8 / 9 / 10: the standard card interactions (on the card, away from its controls)
  const card = await page.$eval('#rw .iq-room__name', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 10, y: b.bottom + 4 }; });
  n0 = calls().length;
  await page.mouse.click(card.x, card.y); await page.waitForTimeout(600);
  let acts = await E(() => window.__acts.splice(0));
  check('8 Tap → its configured action (navigate)', acts.length === 1 && acts[0].type === 'navigate' && acts[0].page === 'p-tap' && acts[0].gesture === 'tap', JSON.stringify(acts));
  await page.mouse.dblclick(card.x, card.y); await page.waitForTimeout(600);
  acts = await E(() => window.__acts.splice(0));
  check('9 Double tap → its configured action (popup)', acts.length === 1 && acts[0].type === 'popup' && acts[0].popup === 'pop-dbl' && acts[0].gesture === 'doubleTap', JSON.stringify(acts));
  await page.mouse.move(card.x, card.y); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(400);
  acts = await E(() => window.__acts.splice(0));
  check('10 Long press → its configured action (navigate)', acts.length === 1 && acts[0].page === 'p-long' && acts[0].gesture === 'longPress', JSON.stringify(acts));
  check('11 card gestures never trigger a scene action', calls().length === n0);

  // ---- 16: optional information that is not mapped leaves no gap
  await mount({ ...LIVE, haRoles: { lights: ['light.a'] }, interactions: undefined }, 900, 560);
  await page.waitForFunction(() => document.querySelector('#rw .iq-room')?.dataset.lit === 'false', null, { timeout: 15000 });
  const st2 = await room(() => ({ n: document.querySelectorAll('#rw .iq-room__stat').length, stats: document.querySelector('#rw .iq-room').dataset.stats, text: document.querySelector('#rw .iq-room').innerText }));
  check('16 no Information → no strip, no placeholder, no automatic light / temperature text', st2.n === 0 && st2.stats === '0' && !/light|°C|%/i.test(st2.text) && await room(() => document.querySelector('#rw .iq-room__stats').hidden), JSON.stringify(st2));
  // ---- Information, live: order, real values with HA's unit, truthful missing / unavailable
  const INFO = [{ id: 'i1', entity: 'sensor.hum', value: 'state', label: 'Humidity', icon: 'drop', color: 'info' }, { id: 'i2', entity: 'binary_sensor.door', value: 'state' },
    { id: 'i3', entity: 'sensor.dead', value: 'state', label: 'Power' }, { id: 'i4', entity: 'sensor.gone', value: 'state', label: 'Gone' }];
  await mount({ name: 'Lounge', haRoles: { lights: ['light.a'] }, info: INFO }, 1200, 600);
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 4, null, { timeout: 15000 });
  const lines = () => room(() => [...document.querySelectorAll('#rw .iq-room__stat')].map((x) => [x.querySelector('.iq-room__sval').textContent, x.querySelector('.iq-room__slab').textContent]));
  let ln = await lines();
  check('I17 / I18 the real HA state with its unit (58 %), a door in HA\'s words', /^58 ?%$/.test(ln[0][0]) && ln[0][1] === 'Humidity' && ln[1][0] === 'Open', JSON.stringify(ln));
  check('label fallback: no label → the entity\'s own HA name', ln[1][1] === 'Back door', JSON.stringify(ln));
  check('I19 unavailable / not found are said truthfully (no fake value)', ln[2][0] === 'Unavailable' && ln[3][0] === 'Not found' && await room(() => document.querySelectorAll('#rw .iq-room__stat--off').length === 2), JSON.stringify(ln));
  check('the icon colour is a design token', await room(() => document.querySelector('#rw .iq-room__stat[data-info="i1"] .iq-room__sicon').style.color === 'var(--info)'));
  await mount({ name: 'Lounge', haRoles: { lights: ['light.a'] }, info: [INFO[1], INFO[0]] }, 1200, 600);
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 2, null, { timeout: 15000 });
  ln = await lines();
  check('I14 the editor order IS the display order', ln[0][1] === 'Back door' && ln[1][1] === 'Humidity', JSON.stringify(ln));
  // ---- zero scenes on the card
  const z = await room(() => { const r = document.querySelector('#rw .iq-room'); return { scenes: r.querySelectorAll('.iq-room__scene').length, more: !!r.querySelector('.iq-room__scene--more'), row: !!r.querySelector('.iq-room__scenes').offsetParent, mb: !!r.querySelector('.iq-room__mscenes').offsetParent }; });
  check('S2 zero scenes: no scene buttons, no +N, no scenes button', z.scenes === 0 && !z.more && !z.row && !z.mb, JSON.stringify(z));

  // ---- 6 / 17 / 18: sizes, multiple counts, overflow
  const EIGHT = { name: 'Lounge', scenes: Array.from({ length: 8 }, (_, i) => ({ label: `S${i + 1}`, icon: 'star' })), haSlots: { scenes: Array.from({ length: 8 }, (_, i) => `scene.s${i + 1}`) }, haRoles: { lights: ['light.a'] },
    info: [{ id: 'i1', entity: 'sensor.temp', value: 'state', label: 'Temperature', icon: 'thermo', color: 'accent-hot' }] };
  const shape = () => room(() => { const r = document.querySelector('#rw .iq-room'); const tiles = [...r.querySelectorAll('.iq-room__scenes .iq-room__scene')].filter((b) => b.offsetParent);
    return { arr: r.dataset.fitArr, total: r.dataset.scenes, shown: r.dataset.scenesShown, more: !!r.querySelector('.iq-room__scenes .iq-room__scene--more'), tiles: tiles.length, minW: Math.min(...tiles.map((b) => b.getBoundingClientRect().width)),
      acts: !!r.querySelector('.iq-room__acts').offsetParent, mbtn: !!r.querySelector('.iq-room__mscenes').offsetParent, stats: !!r.querySelector('.iq-room__stats').offsetParent, name: !!r.querySelector('.iq-room__name').offsetParent }; });
  const sizes = {};
  for (const [label, w, h] of [['large', 1000, 600], ['normal', 440, 400], ['compact', 380, 200], ['micro', 170, 170]]) {
    await mount(EIGHT, w, h); await page.waitForTimeout(700);
    sizes[label] = await shape();
  }
  check('17 each size gets its own arrangement', ['large', 'normal', 'compact', 'micro'].every((k) => sizes[k].arr === k), JSON.stringify(Object.fromEntries(Object.entries(sizes).map(([k, x]) => [k, x.arr]))));
  check('17 Large: stats, name, several scene tiles of usable width', sizes.large.stats && sizes.large.name && sizes.large.tiles >= 4 && sizes.large.minW >= 80, JSON.stringify(sizes.large));
  check('17 Normal: name, the owner\'s Information line and a few usable scene tiles', sizes.normal.name && sizes.normal.stats && sizes.normal.tiles >= 3 && sizes.normal.minW >= 60, JSON.stringify(sizes.normal));
  check('17 Compact: picture thumbnail, name, a few tiles', sizes.compact.name && sizes.compact.tiles >= 2 && sizes.compact.tiles <= 4 && sizes.compact.minW >= 36, JSON.stringify(sizes.compact));
  check('17 Micro: no scene row, no stats — name + one line, a small scenes button', !sizes.micro.acts && !sizes.micro.stats && sizes.micro.name && sizes.micro.mbtn, JSON.stringify(sizes.micro));
  check('18 more scenes than fit: the last tile is "+N" (Large / Normal / Compact)', ['large', 'normal', 'compact'].every((k) => sizes[k].more && Number(sizes[k].shown) + 1 === sizes[k].tiles && sizes[k].total === '8'), JSON.stringify(sizes));
  await mount(EIGHT, 440, 400); await page.waitForTimeout(700);
  await page.click('#rw .iq-room__scene--more'); await page.waitForTimeout(200);
  const pn = await room(() => [...document.querySelectorAll('#rw .iq-room__panel:not([hidden]) .iq-room__scene')].map((b) => b.dataset.index));
  check('18 "+N" opens the panel with every scene', pn.join() === '0,1,2,3,4,5,6,7', pn.join());
  n0 = calls().length;
  await page.click('#rw .iq-room__panel .iq-room__scene[data-index="6"]'); await page.waitForTimeout(800);
  check('18 a scene from the panel triggers ITS slot (scene.s7) and the panel closes', calls().length === n0 + 1 && JSON.parse(calls().at(-1).body).entity_id === 'scene.s7' && await room(() => document.querySelector('#rw .iq-room__panel').hidden), JSON.stringify(calls().at(-1)));
  await mount(EIGHT, 170, 170); await page.waitForTimeout(700);
  await page.click('#rw .iq-room__mscenes'); await page.waitForTimeout(200);
  check('18 Micro: the scenes button opens the same panel (every scene reachable)', (await room(() => document.querySelectorAll('#rw .iq-room__panel:not([hidden]) .iq-room__scene').length)) === 8);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('the panel closes with Escape', await room(() => document.querySelector('#rw .iq-room__panel').hidden));
  for (const n of [1, 3, 6]) {
    await mount({ ...EIGHT, scenes: EIGHT.scenes.slice(0, n), haSlots: { scenes: EIGHT.haSlots.scenes.slice(0, n) } }, 1000, 600); await page.waitForTimeout(600);
    const x = await shape();
    check(`6 ${n} scene${n > 1 ? 's' : ''}: exactly ${n} button${n > 1 ? 's' : ''}, no empty tiles`, x.total === String(n) && x.tiles === n && !x.more, JSON.stringify(x));
  }
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
