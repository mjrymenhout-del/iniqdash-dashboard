/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE INIQDASH DEMO (assets/demo/iniqdash-demo.json — built by tools/build-iniqdash-demo.mjs): the official six-page demonstration
// dashboard (Home · Lights · Climate · Rooms · Energy · Security) of the SIMULATED home, made of standard widgets, popups, notifications and the
// radial menu. Installed from the first-run screen / Dashboards as a NEW dashboard, driven through its real widgets, saved, exported and
// imported — while the user's own dashboard, a Widget Studio collection of the user's and the configured Home Assistant are left alone.
// Real PHP server + a FAKE live Home Assistant (tests/lib/live.mjs) whose request log proves the isolation.
import fs from 'node:fs';
import { live } from './lib/live.mjs';
import { check, playwright } from './lib/harness.mjs';

const PAGES = ['home', 'lights', 'climate', 'rooms', 'energy', 'security'];
let L, browser;
try {
  L = await live();                                    // a configured (fake) live Home Assistant
  const me = L.client(); await me.login();
  const api = async (method, url, body) => (method === 'GET' ? await me.send('GET', url) : await me.post(url, body)).json();
  // the simulated home is PER SESSION: read it through the browser's own session (the one the dashboard uses)
  let p = null;
  const sim = async (ids) => (await p.evaluate(async (q) => (await (await fetch(`api/ha_states.php?ids=${encodeURIComponent(q)}`, { headers: { 'X-IniqDash-Simulated': '1' }, cache: 'no-store' })).json()).states || {}, ids.join(','))) || {};

  // ---- what exists before: the user's own dashboard, and a "My examples" collection with a Studio widget
  const mine = { version: 3, app: { id: 'mine', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'Mine', nav: true, items: [] }] };
  const col = (await api('POST', '/api/studio_widgets.php', { action: 'create_collection', name: 'My examples' })).collection.id;
  const exDef = JSON.parse(fs.readFileSync(new URL('./fixtures/maison-demo.widgets.json', import.meta.url), 'utf8')).widgets[0].definition;
  exDef.meta.name = 'Studio example — test card'; exDef.meta.collection = col;
  const ex = await api('POST', '/api/studio_widgets.php', { action: 'save', id: null, definition: exDef });
  const studioBefore = JSON.stringify(await api('GET', '/api/studio_widgets.php'));
  check('the installation already has a "My examples" collection with a Studio widget', ex.ok && JSON.parse(studioBefore).widgets.length === 1, JSON.stringify(ex).slice(0, 200));

  browser = await playwright().chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Paris', locale: 'en-GB', extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
  p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  const until = (fn, a, ms = 8000) => p.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);
  await p.goto(`${L.base}/login.php`); await p.fill('input[name=user]', 'admin'); await p.fill('input[name=password]', 'correct horse battery staple');
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  await p.waitForFunction(() => window.editor, null, { timeout: 20000 });

  // ---- the shipped file: a valid ordinary dashboard; every entity exists in the simulated home
  const demoJson = await E(async () => (await fetch('assets/demo/iniqdash-demo.json')).json());
  const shape = await E((d) => { const v = window.MaisonModel.validate(structuredClone(d), window.MaisonRegistry);
    const ents = new Set(); JSON.stringify(d, (k, val) => { if (typeof val === 'string' && /^(light|sensor|binary_sensor|climate|lock|alarm_control_panel|weather|scene|button|media_player|person)\.[a-z0-9_]+$/.test(val)) ents.add(val); return val; });
    return { ok: v.ok, errors: v.ok ? [] : v.errors.slice(0, 5), pages: d.pages.map((x) => x.id), simulated: d.app.simulated, popups: d.popups.length, rules: d.notifications.rules.length, ents: [...ents] }; }, demoJson);
  check('the shipped demo is a valid dashboard: six pages, simulated, with popups and notification rules', shape.ok && shape.pages.join() === PAGES.join() && shape.simulated === true && shape.popups >= 6 && shape.rules >= 5, JSON.stringify(shape).slice(0, 300));
  const st0 = await sim(shape.ents);
  const missing = shape.ents.filter((id) => !st0[id]);
  check(`every entity it uses (${shape.ents.length}) exists in the simulated home`, missing.length === 0, missing.join(', '));

  // ---- 1 · first run: "Open the INIQDASH demo" stores it as a NEW dashboard and opens it
  await p.goto(`${L.base}/`); await p.waitForSelector('[data-k=start-iniqdash-demo]', { timeout: 15000 });
  await Promise.all([p.waitForURL(/[?&]d=d[0-9a-f]{16}/, { timeout: 15000 }), p.click('[data-k=start-iniqdash-demo]')]);
  await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(2000);
  const nLive = L.haCalls.length;                       // (the first-run page showed the built-in LIVE sample; the demo starts here)
  let list = (await api('GET', '/api/dashboards.php')).dashboards;
  check('1 · first run: "Open the INIQDASH demo" adds it as a new dashboard and opens it (simulated)', list.length === 1 && list[0].name === 'INIQDASH demo' && await E(() => window.IniqHA.simulated()));
  // an existing installation: the user's dashboard first, then Dashboards → "Add the INIQDASH demo" adds ANOTHER one
  const myId = (await api('POST', '/api/dashboards.php', { action: 'create', name: 'My home', dashboard: mine })).entry.id;
  const myRev = (await api('GET', `/api/dashboards.php?id=${myId}`)).revision;
  await E(() => window.editor.setEditing(true)); await wait(300);
  await p.click('[data-k=more]'); await p.click('[data-k=dashboards]'); await p.waitForSelector('[data-k=dash-add-iniqdash-demo]');
  await Promise.all([p.waitForURL((u) => /[?&]d=d[0-9a-f]{16}/.test(String(u)), { timeout: 15000 }), p.click('[data-k=dash-add-iniqdash-demo]')]);
  await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(1000);
  list = (await api('GET', '/api/dashboards.php')).dashboards;
  check('Dashboards → "Add the INIQDASH demo" adds another dashboard with a unique name — nothing is replaced', list.length === 3 && list.filter((x) => /^INIQDASH demo/.test(x.name)).length === 2
    && new Set(list.map((x) => x.name)).size === 3, JSON.stringify(list.map((x) => x.name)));
  const demoId = new URL(p.url()).searchParams.get('d');

  // ---- 2 · 3 · 4 · every page, every widget, values from the simulated home
  await p.goto(`${L.base}/?d=${demoId}`); await p.waitForFunction(() => window.editor && window.editor.viewing && window.IniqHA.simulated(), null, { timeout: 20000 });
  const shown = {};
  for (const id of PAGES) {
    await E((id) => window.editor.go(id), id); await wait(1800);
    shown[id] = await E((id) => { const m = window.editor.getModel(); const pg = m.pages.find((x) => x.id === id);
      const ids = pg.items.filter((i) => !i.parent).map((i) => i.id), els = ids.map((x) => document.querySelector(`.ed-canvas [data-grid-id="${x}"], .ed-cornerlayer [data-grid-id="${x}"]`)).filter(Boolean);
      const want = ids.length;
      const empty = els.filter((el) => !el.firstElementChild || el.firstElementChild.getBoundingClientRect().height < 10).map((el) => el.dataset.gridId);
      return { page: window.editor.navigation().current, want, have: els.length, empty, notFound: /Not found:|Unknown widget/.test(document.querySelector('.ed-canvas').innerText) }; }, id);
  }
  check('2 · all six pages are reachable', PAGES.every((id) => shown[id].page === id), JSON.stringify(Object.values(shown).map((s) => s.page)));
  check('3 · every widget of every page renders (none missing, none empty, no "Not found")', PAGES.every((id) => shown[id].have === shown[id].want && !shown[id].empty.length && !shown[id].notFound), JSON.stringify(shown));
  await E(() => window.editor.go('home')); await wait(1500);
  const vals = await E(() => ({ indoor: document.querySelector('[data-grid-id="h-climate"]').innerText, who: document.querySelector('[data-grid-id="h-who"]').innerText,
    feed: document.querySelector('[data-grid-id="h-notify"]').innerText, spot: document.querySelector('[data-grid-id="h-spot"]').innerText, read: document.querySelector('[data-grid-id="h-read"]').innerText,
    devices: ['h-d0', 'h-d1', 'h-d2', 'h-d3'].map((id) => document.querySelector(`[data-grid-id="${id}"]`)?.innerText.replace(/\s+/g, ' ') || ''), badge: !document.querySelector('[data-k=sim-badge]').hidden }));
  check('4 · demo values appear without Home Assistant (the living room 20.6 °C, who is home — 2 of 4, the notification centre, the household calendar, readings, device tiles) and the "Simulated home" badge shows',
    /20\.6/.test(vals.indoor) && /Mia/.test(vals.who) && /2 of 4/.test(vals.who) && /Evening scene started/.test(vals.feed) && /General waste|Organic waste/.test(vals.spot) && /°C/.test(vals.read)
    && /ON/.test(vals.devices[0]) && /HEAT/i.test(vals.devices[1]) && vals.badge, JSON.stringify(vals).slice(0, 500));

  // ---- 5 · a light switched on from its card; the count follows on the Lights hero
  await E(() => window.editor.go('lights')); await wait(1500);
  const on0 = await E(() => window.IniqHA.get('sensor.demo_lights_on')?.state);
  await p.click('[data-grid-id="l-kitchen_main"] [aria-label$="power"]');
  const lit = await until(() => window.IniqHA.get('light.demo_kitchen_main')?.state === 'on');
  await until((b) => window.IniqHA.get('sensor.demo_lights_on')?.state === String(Number(b) + 1), on0);
  const on1 = await E(() => ({ count: window.IniqHA.get('sensor.demo_lights_on')?.state, card: document.querySelector('[data-grid-id="l-hero"]').innerText }));
  check('5 · a light is switched on from its card; "lights on" follows (+1)', lit && on1.count === String(Number(on0) + 1) && on1.card.includes(on1.count), JSON.stringify({ on0, on1 }));
  // ---- 6 · a Device tile on Home switches its light
  await E(() => window.editor.go('home')); await wait(1500);
  const d0 = await E(() => window.IniqHA.get('light.demo_living_floor')?.state);
  await p.click('[data-grid-id="h-d0"] .iq-dev__sw');
  const d1ok = await until((b) => window.IniqHA.get('light.demo_living_floor')?.state !== b, d0);
  const d1 = (await sim(['light.demo_living_floor']))['light.demo_living_floor']?.state;
  check('6 · a Device tile switches its device in the simulated home (the floor lamp)', d1ok && d1 !== d0, JSON.stringify({ d0, d1 }));
  if (d1 !== d0) { await p.click('[data-grid-id="h-d0"] .iq-dev__sw'); await until((b) => window.IniqHA.get('light.demo_living_floor')?.state === b, d0); }
  // ---- 7 · climate: + raises the target; the dial shows it
  const t0 = await E(() => window.IniqHA.get('climate.demo_living')?.attrs?.target_temperature);
  await p.click('[data-grid-id="h-climate"] [aria-label^="Increase"]');
  await until((t) => window.IniqHA.get('climate.demo_living')?.attrs?.target_temperature > t, t0);
  const t1 = (await sim(['climate.demo_living']))['climate.demo_living']?.attrs?.target_temperature;
  check('7 · climate: "+" raises the living-room target in the simulation', typeof t0 === 'number' && t1 > t0, JSON.stringify({ t0, t1 }));
  // ---- 8 · scenes: "All off" (Lights), then "Evening" (Home) sets its own lights
  await E(() => window.editor.go('lights')); await wait(1200);
  await p.click('[data-grid-id="l-allof"] .aw__trigger');
  await until(() => window.IniqHA.get('sensor.demo_lights_on')?.state === '0');
  const off = await sim(['sensor.demo_lights_on', 'light.demo_living_ceiling', 'light.demo_garden_path']);
  await E(() => window.editor.go('home')); await wait(1200);
  await p.click('[data-grid-id="h-sc0"] .aw__trigger');
  await until(() => window.IniqHA.get('light.demo_living_ceiling')?.state === 'on');
  const eve = await sim(['light.demo_living_ceiling', 'light.demo_living_floor', 'sensor.demo_lights_on']);
  check('8 · scenes update their devices: "All off" → 0 on; "Evening" turns the living-room lights on (dimmed)', off['sensor.demo_lights_on'].state === '0' && off['light.demo_garden_path'].state === 'off'
    && eve['light.demo_living_ceiling'].state === 'on' && eve['light.demo_living_floor'].state === 'on' && Number(eve['sensor.demo_lights_on'].state) > 0, JSON.stringify({ off: off['sensor.demo_lights_on'], eve: eve['sensor.demo_lights_on'] }));

  // ---- 9 · energy: the numbers agree with each other (today, the live split, the daily history)
  const en = await sim(['sensor.demo_house_energy_today', 'sensor.demo_solar_energy_today', 'sensor.demo_grid_import_today', 'sensor.demo_grid_export_today', 'sensor.demo_house_power', 'sensor.demo_solar_power', 'sensor.demo_grid_power', 'sensor.demo_self_sufficiency_today']);
  const n = (k) => Number(en[`sensor.demo_${k}`].state);
  const balance = Math.abs(n('house_energy_today') - (n('solar_energy_today') - n('grid_export_today') + n('grid_import_today')));
  const livePower = Math.abs(n('house_power') - (n('solar_power') + n('grid_power')));
  const stats = await E(() => window.IniqHA.statistics(['sensor.demo_house_energy_today', 'sensor.demo_solar_energy_today', 'sensor.demo_grid_import_today', 'sensor.demo_grid_export_today'], 'day'));
  const days = (id) => ((stats.results || {})[id]?.points || []).map((x) => x[1]);
  const H = days('sensor.demo_house_energy_today'), S = days('sensor.demo_solar_energy_today'), I = days('sensor.demo_grid_import_today'), X = days('sensor.demo_grid_export_today');
  const everyDay = H.length >= 28 && H.every((h, i) => Math.abs(h - (S[i] - X[i] + I[i])) < 0.02);
  check('9 · energy is coherent: home = solar − export + import (today and every day of the history); power home = solar + grid; today\'s bar = today\'s card',
    balance < 0.03 && livePower <= 1 && everyDay && Math.abs(H[H.length - 1] - n('house_energy_today')) < 0.02, JSON.stringify({ balance, livePower, days: H.length, last: H[H.length - 1], today: n('house_energy_today') }));
  await E(() => window.editor.go('energy')); await wait(2500);
  const flow = await E(() => { const e = document.querySelector('[data-grid-id="e-flow"] .iq-energy'); return { house: e?.dataset.house, nodes: [...document.querySelectorAll('[data-grid-id="e-flow"] .iq-energy__n:not(.iq-energy__n--home)')].map((b) => b.innerText.replace(/\s+/g, ' ')),
    pic: getComputedStyle(document.querySelector('[data-grid-id="e-flow"] .iq-energy__n--home')).backgroundImage }; });
  check('…the five domains around the house: Solar (W), Grid (W), CO₂ (kg), Gas (m³/h), Water (L/min) — the house picture in the middle', flow.house === 'true' && /house-night/.test(flow.pic)
    && ['Solar', 'Grid', 'CO₂', 'Gas', 'Water'].every((k) => flow.nodes.some((t) => t.includes(k))) && flow.nodes.some((t) => /kg/.test(t)) && flow.nodes.some((t) => /L\/min/.test(t)), JSON.stringify(flow).slice(0, 400));
  const tabText = async (tab, id) => { await p.click(`[data-grid-id="e-hist"] .mtabs__tab[data-tab="${tab}"]`); await wait(1500); return E((id) => document.querySelector(`[data-grid-id="${id}"]`).innerText, id); };
  const bars = { week: await tabText('week', 'e-w-el'), water: await tabText('week', 'e-w-water'), month: await tabText('month', 'e-m-el'), co2: await tabText('month', 'e-m-co2'), day: await tabText('today', 'e-t-el') };
  check('…the consumption tabs: Today (power), Week (electricity, gas, water — daily), Month (electricity, CO₂ — daily)', /7 days/.test(bars.week) && /m³/.test(bars.water) && /30 days/.test(bars.month) && /kg/.test(bars.co2) && /W/.test(bars.day),
    JSON.stringify(bars).slice(0, 300));

  // ---- 10 · a room tile opens its popup; Escape closes it
  await E(() => window.editor.go('rooms')); await wait(1500);
  const tile = await E(() => document.querySelector('[data-grid-id="r-living"]').innerText.replace(/\s+/g, ' '));
  await p.click('[data-grid-id="r-living"]'); await until(() => window.editor.popups().current === 'p-room-living');
  const pop = await E(() => ({ cur: window.editor.popups().current, lights: document.querySelectorAll('.mpop [data-grid-id^="pr-living-l"]').length, hero: !!document.querySelector('.mpop .mpop__hero img'),
    tabs: [...document.querySelectorAll('.mpop .mtabs__tab')].map((t) => t.textContent.trim()), facts: document.querySelector('.mpop .mpop__info')?.innerText || '' }));
  const tabsSeen = {};
  for (const t of ['active', 'lights', 'heating', 'media', 'security', 'sensors']) {
    await p.click(`.mpop .mtabs__tab[data-tab="${t}"]`); await wait(500);
    tabsSeen[t] = await E(() => [...document.querySelectorAll('.mpop .mtabs__pane:not([hidden]) .mg__item[data-grid-id]')].filter((x) => x.getBoundingClientRect().height > 20).length);
  }
  await p.keyboard.press('Escape'); await until(() => !window.editor.popups().current);
  const popClosed = await E(() => !window.editor.popups().current);
  check('10 · a room tile (photo, humidity, lights, temperature) opens the room popup: its picture, temperature · humidity · lights over it, six tabs each with content; Escape closes it',
    /Living room/.test(tile) && /%/.test(tile) && /\//.test(tile) && pop.cur === 'p-room-living' && pop.hero && /temperature/i.test(pop.facts) && /Humidity/.test(pop.facts)
    && pop.tabs.join('|').replace(/\s+/g, ' ') === 'Active|Lights|Heating|Media|Security|Sensors' && Object.values(tabsSeen).every((n) => n > 0) && popClosed, JSON.stringify({ tile, pop, tabsSeen }));

  // ---- 11 · 12 · security demo actions → a toast, the activity log, and the notification centre on Home
  await E(() => window.editor.go('security')); await wait(1500);
  await p.click('[data-grid-id="s-alarm"] button[aria-label="Arm: Away"]');
  await until(() => window.IniqHA.get('alarm_control_panel.demo_alarm')?.state === 'armed_away');
  await p.click('[data-grid-id="s-ev1"] .aw__trigger');                                  // "Open back door" (demo)
  const trig = await until(() => window.IniqHA.get('alarm_control_panel.demo_alarm')?.state === 'triggered', null, 10000);
  const toast = await until(() => [...document.querySelectorAll('.mnote')].some((n) => /Alarm triggered/.test(n.textContent)), null, 10000);
  const log = await (async () => { await until(() => /Door opened/.test(document.querySelector('[data-grid-id="s-log"]')?.innerText || ''), null, 8000); return E(() => document.querySelector('[data-grid-id="s-log"]').innerText); })();
  await p.click('[data-grid-id="s-alarm"] button[aria-label="Disarm"], [data-grid-id="s-alarm"] button[aria-label="Press again to disarm"]');
  await until(() => window.IniqHA.get('alarm_control_panel.demo_alarm')?.state === 'disarmed');
  await p.click('[data-grid-id="s-ev2"] .aw__trigger');                                  // "Clear events"
  await until(() => window.IniqHA.get('binary_sensor.demo_back_door')?.state === 'off');
  const sec = await sim(['alarm_control_panel.demo_alarm', 'binary_sensor.demo_back_door', 'lock.demo_back_door']);
  check('11 · security (demo): arm away → "Open back door" triggers the alarm (the activity log says "Door opened") → disarm → "Clear events" closes and locks it',
    trig && /Door opened/.test(log) && sec['alarm_control_panel.demo_alarm'].state === 'disarmed' && sec['binary_sensor.demo_back_door'].state === 'off' && sec['lock.demo_back_door'].state === 'locked',
    JSON.stringify({ trig, log: log.slice(0, 120), sec: Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, v.state])) }));
  // the notification centre on Home: the alert is there; dismiss one, mark all as read
  await E(() => window.editor.go('home')); await wait(1500);
  const items0 = await E(() => [...document.querySelectorAll('[data-grid-id="h-notify"] .ibx-p__item')].map((li) => li.querySelector('.ibx-p__title').textContent));
  const new0 = await E(() => document.querySelectorAll('[data-grid-id="h-notify"] .ibx-p__item.is-unread').length);
  await p.click('[data-grid-id="h-notify"] .ibx-p__item .ibx-p__del'); await wait(300);
  const items1 = await E(() => [...document.querySelectorAll('[data-grid-id="h-notify"] .ibx-p__item')].map((li) => li.querySelector('.ibx-p__title').textContent));
  await p.click('[data-grid-id="h-notify"] :is(.ibx-l__all, .ibx-p__all)').catch(() => {}); await wait(300);
  const new1 = await E(() => document.querySelectorAll('[data-grid-id="h-notify"] .ibx-p__item.is-unread').length);
  check('12 · notifications: the alarm shows a toast and lands at the top of the notification centre (under the later "Alarm disarmed") on Home (unread); an entry can be dismissed; "Mark all as read" clears the unread ones',
    toast && items0.slice(0, 2).some((t) => /Alarm triggered/.test(t)) && new0 > 0 && items1[0] !== items0[0] && new1 === 0, JSON.stringify({ toast, items0: items0.slice(0, 3), items1: items1.slice(0, 3), new0, new1 }));

  // ---- 12b · the OCCASIONAL demo events: this visitor's schedule (back-dated in its own simulated state) raises ONE notification per
  // event; a refresh replays nothing; another visitor's schedule is untouched
  const simDir = `${L.priv}/var/sim`, files = fs.readdirSync(simDir).filter((f) => /^s[0-9a-f]+\.json$/.test(f)).map((f) => `${simDir}/${f}`);
  const evFiles = files.filter((f) => { try { return !!JSON.parse(fs.readFileSync(f, 'utf8'))['sensor.demo_event_clock']; } catch { return false; } });
  const shift = (f, ago) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); j['sensor.demo_event_clock'] = { changed: Math.floor(Date.now() / 1000) - ago }; fs.writeFileSync(f, JSON.stringify(j)); };
  const otherSims = files.filter((f) => !evFiles.includes(f)).map((f) => fs.readFileSync(f, 'utf8'));
  evFiles.forEach((f) => shift(f, 200));                                        // 200 s: the first event (washing machine, at 150 s) is due
  const evToast = await until(() => [...document.querySelectorAll('.mnote')].some((n) => /Washing machine finished/.test(n.textContent)), null, 20000);
  const evState = await E(() => window.IniqHA.get('sensor.demo_event')?.state);
  await p.reload(); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(6000);
  const replay = await E(() => [...document.querySelectorAll('.mnote')].filter((n) => /Washing machine finished/.test(n.textContent)).length);
  const othersSame = files.filter((f) => !evFiles.includes(f)).every((f, i) => fs.readFileSync(f, 'utf8') === otherSims[i]);
  check('12b · demo events: a due event raises its notification once ("Washing machine finished"); a refresh does not replay it; other visitors are untouched',
    evFiles.length >= 1 && evToast && evState === 'washer_done' && replay === 0 && othersSame, JSON.stringify({ evFiles: evFiles.length, evToast, evState, replay, othersSame }));
  // ---- 13 · the radial menu (pinned to the screen corner): opens, navigates, closes on Escape
  await p.click('.ed-cornerlayer .rm__centre'); await p.waitForSelector('.rm-overlay .rm-seg');
  const labels = await E(() => [...document.querySelectorAll('.rm-overlay .rm-seg__label')].map((x) => x.textContent));
  await p.click('.rm-overlay .rm-seg[aria-label="Lights"] .rm-seg__ic'); await until(() => window.editor.navigation().current === 'lights');
  const nav = await E(() => window.editor.navigation().current);
  await p.click('.ed-cornerlayer .rm__centre'); await p.waitForSelector('.rm-overlay .rm-seg');
  await p.click('.rm-overlay .rm-seg[aria-label="Notifications"] .rm-seg__ic'); await until(() => window.editor.popups().current === 'p-notify');
  const notifyPop = await E(() => window.editor.popups().current);
  await p.keyboard.press('Escape'); await until(() => !window.editor.popups().current);
  await p.click('.ed-cornerlayer .rm__centre'); await p.waitForSelector('.rm-overlay'); await p.keyboard.press('Escape'); await wait(400);
  const ringGone = await E(() => !document.querySelector('.rm-overlay'));
  check('13 · radial menu: exactly four labelled actions (Home, Lights, Scenes, Notifications) — navigates, opens a popup, closes on Escape', nav === 'lights' && ringGone && labels.join() === 'Home,Lights,Scenes,Notifications' && notifyPop === 'p-notify',
    JSON.stringify({ labels, nav, ringGone, notifyPop }));

  // ---- 15 · desktop, tablet and mobile: no sideways scrolling, no overlapping widgets
  const layoutIssues = [];
  for (const [name, w, h] of [['desktop', 1440, 900], ['tablet', 834, 1112], ['mobile', 390, 844]]) {
    await p.setViewportSize({ width: w, height: h }); await wait(800);
    for (const id of PAGES) {
      await E((id) => window.editor.go(id), id); await wait(900);
      const r = await E(() => {
        // the PAGE grid's own items (not those inside a container, not the float layer); the grid root itself also carries a
        // data-grid-id ("dashboard"), so items are found by their grid, not by a [data-grid-id] ancestor (that matched nothing)
        const top = document.querySelector('.ed-canvas .ed-slot > .mg');
        const rects = [...(top ? top.querySelectorAll(':scope > .mg__grid > .mg__item') : [])].filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => ({ id: el.dataset.gridId, r: el.getBoundingClientRect() })).filter((x) => x.r.width > 0);
        const over = [];
        rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => { const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top); if (ox > 2 && oy > 2) over.push(`${a.id}×${b.id}`); }));
        const wide = rects.filter((x) => x.r.right > innerWidth + 1 || x.r.left < -1).map((x) => x.id);
        return { n: rects.length, over, wide, scroll: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      if (r.over.length || r.wide.length || r.scroll || r.n < 3) layoutIssues.push({ name, id, ...r });
    }
  }
  check('15 · desktop, tablet and mobile: every page fits the width, nothing overlaps', layoutIssues.length === 0, JSON.stringify(layoutIssues).slice(0, 500));
  await p.setViewportSize({ width: 1440, height: 900 });

  // ---- 14 · editable: a widget moved and renamed is saved and survives a reload; export → import gives the same dashboard
  await p.goto(`${L.base}/editor.html?d=${demoId}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(800);
  await E(() => { window.editor.go('lights'); window.editor.setEditing(true); const m = window.editor.getModel(); const it = m.pages.find((x) => x.id === 'lights').items.find((i) => i.id === 'l-allof');
    it.config.name = 'Everything off'; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join()); });
  const saved = await E(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(800);
  const reloaded = await E(() => window.editor.getModel().pages.find((x) => x.id === 'lights').items.find((i) => i.id === 'l-allof').config.name);
  const exported = await E(() => JSON.parse(JSON.stringify(window.editor.getModel())));
  const imp = await api('POST', '/api/dashboards.php', { action: 'create', name: 'Imported demo', dashboard: exported });
  const impBack = imp.ok ? await api('GET', `/api/dashboards.php?id=${imp.entry.id}`) : null;
  const same = impBack && JSON.stringify(impBack.dashboard.pages) === JSON.stringify(exported.pages) && JSON.stringify(impBack.dashboard.popups) === JSON.stringify(exported.popups)
    && JSON.stringify(impBack.dashboard.notifications) === JSON.stringify(exported.notifications) && impBack.dashboard.app.simulated === true;
  check('14 · layouts survive save and reload (a renamed widget is still renamed); exported and imported, the dashboard is the same (pages, popups, notifications)', saved && reloaded === 'Everything off' && same, JSON.stringify({ saved, reloaded, imp: imp.ok }));
  await api('POST', '/api/dashboards.php', { action: 'delete', id: imp.entry.id });

  // ---- reset: the demo home's "Reset demo" puts the simulated devices back
  const nDemo = L.haCalls.length;
  // ---- 16 · 17 · 18 · what was there before is untouched; the configured Home Assistant never heard from the demo
  const after = await api('GET', `/api/dashboards.php?id=${myId}`);
  check('16 · the user\'s own dashboard is untouched (same revision, same content)', after.revision === myRev && after.dashboard.pages[0].name === 'Mine');
  const studioAfter = JSON.stringify(await api('GET', '/api/studio_widgets.php'));
  check('17 · the user\'s "My examples" collection and its widget are untouched', studioAfter === studioBefore && ex.ok, `${studioBefore.slice(0, 300)}\n${studioAfter.slice(0, 300)}`);
  await p.goto(`${L.base}/editor.html?d=${myId}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(1000);
  check('…and the user\'s own dashboard stays live (no simulated mode, no badge)', await E(() => window.IniqHA.simulated() === false && document.querySelector('[data-k=sim-badge]').hidden));
  check('18 · ISOLATION: the configured Home Assistant received nothing from the demo (install, view, lights, climate, scenes, alarm, locks, editing)', nDemo === nLive, JSON.stringify(L.haCalls.slice(nLive, nDemo).map((c) => c.url)).slice(0, 300));
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('iniqdash-demo test ran', false, e.stack);
} finally {
  if (browser) await browser.close();
  if (L) await L.close();
}
console.log('finished');
