/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// GENERATOR QUALITY on a REALISTIC home (tests/fixtures/ha-realistic-home.json in the fake Home Assistant: 18 areas, 330 entities,
// 70 devices — a pellet stove and a solar inverter of dozens of entities each in the dining room, light groups, a hidden duplicate
// player, robot-vacuum maps, unavailable devices), through the real server path (discovery template + registry over WebSocket):
//   1  discovery carries the registry (device, category, hidden) for every entity
//   2  no technical / diagnostic / configuration entity anywhere in the dashboard (signal, firmware, IP, voltage, child lock…)
//   3  the dining room: a handful of DEVICES (not 73 entities); its popup holds lights, the stove, the speaker, motion and room readings
//      only — no inverter readings, no cloud status; the stove's own "open window" detector is not a window contact
//   4  groups whose members are shown are left out; the user-hidden duplicate player is not used; vacuum maps are not cameras;
//      scenes are kept; an important unavailable device (the stove) is still shown, unavailable garden lights are not
//   5  room popups: only tabs that hold something, fine popup rows (app.grid.popups), rendered compact: a 34 px tab bar, the header
//      under 230 px, tiles under 100 px, nothing below the popup's edge; a phone shows it too
//   6  Energy: the house design with solar + grid (import positive), no gas / water flow made from meter totals
//   7  without the registry (an older Home Assistant) the name / class rules still keep the technical entities out
//   8  a dashboard made before app.grid.popups keeps its popup rows (legacy 40 px rows) — saved, reloaded, unchanged
import { live, liveBrowser, REGISTRY } from './lib/live.mjs';
import { loadRealHome } from './lib/realhome.mjs';
import { check } from './lib/harness.mjs';

const TECH = /rssi|lqi|signal|firmware|_version|ip_address|status_code|error_code|cloud|_voltage|_current\b|frequency|child_lock|_led\b|identify|processor|memory|overheating|tamper|restart|update\./;
const gen = async (p) => p.evaluate(async () => {
  const d = await (await fetch('api/ha_entities.php?fresh=1', { headers: { Accept: 'application/json' } })).json();
  const tpl = await (await fetch('assets/demo/iniqdash-demo.json')).json();
  const R = window.MaisonRegistry, areas = window.IniqGenerate.summary(d).areas.filter((a) => a.count).map((a) => a.id);
  const g = window.IniqGenerateDemo.build(d, R, { areas, template: tpl });
  const v = window.MaisonModel.validate(g.dashboard, R);
  const ids = (list) => list.flatMap((it) => JSON.stringify(it.config).match(/"[a-z_]+\.[a-z0-9_]+"/g) || []).map((x) => x.slice(1, -1));
  const all = [...g.dashboard.pages.flatMap((pg) => ids(pg.items)), ...(g.dashboard.popups || []).flatMap((pp) => ids(pp.items))];
  const sam = (g.dashboard.popups || []).find((pp) => pp.name === 'Salle à manger');
  return { ok: v.ok, errors: v.ok ? [] : v.errors.slice(0, 3), model: v.model, n: d.entities.length, reg: d.entities.filter((e) => e.reg).length, withDevice: d.entities.filter((e) => e.device).length,
    all, sam: sam && { tabs: sam.items.find((x) => x.type === 'tabs').config.tabs.map((t) => t.id), ids: ids(sam.items), w: sam.config.custom.desktop.w, h: sam.config.custom.desktop.h },
    rooms: g.summary.rooms, popupsGrid: g.dashboard.app.grid.popups, energy: (g.dashboard.pages.find((pg) => pg.id === 'energy') || { items: [] }).items.find((x) => x.type === 'energy'),
    security: ids((g.dashboard.pages.find((pg) => pg.id === 'security') || { items: [] }).items), scenes: ids((g.dashboard.pages.find((pg) => pg.id === 'home') || { items: [] }).items).filter((x) => x.startsWith('scene.')) };
});

let L, B;
try {
  loadRealHome({ registry: true });
  L = await live({ configureHa: true });
  B = await liveBrowser(L, { viewport: { width: 1440, height: 900 } });
  const p = B.page;
  const g = await gen(p);
  check('1 · discovery carries Home Assistant\'s registry (device / category / hidden / integration) for the realistic home', g.n === 330 && g.reg === 330 && g.withDevice >= 280, JSON.stringify({ n: g.n, reg: g.reg, dev: g.withDevice }));
  const leaks = [...new Set(g.all.filter((x) => TECH.test(x)))];
  check('2 · no technical, diagnostic or configuration entity anywhere in the generated dashboard', g.ok && leaks.length === 0, JSON.stringify({ ok: g.ok, errors: g.errors, leaks }));
  const samRoom = g.rooms.find((r) => r.name === 'Salle à manger');
  const samIds = [...new Set(g.sam.ids)];
  check('3 · the dining room: a handful of devices (not its 73 entities); its popup holds lights, the stove, the speaker, motion and room readings — no inverter, no cloud status, no stove window detector',
    samRoom.entities === 73 && samRoom.devices >= 5 && samRoom.devices <= 8 && samIds.length <= 12 && samIds.includes('climate.poele_a_pellets') && samIds.includes('media_player.enceinte_sam')
      && samIds.includes('light.sam_suspension') && samIds.includes('sensor.salle_a_manger_temperature') && !samIds.some((x) => /inverter|speaker_cloud|poele_(exhaust|smoke|board|status|wifi)/.test(x)),
    JSON.stringify({ room: samRoom, ids: samIds }));
  check('4 · groups with shown members left out; the hidden duplicate player unused; vacuum maps not cameras; scenes kept; the unavailable stove shown, unavailable garden lights not',
    !g.all.includes('light.salon_toutes') && !g.all.includes('light.salle_a_manger_groupe') && !g.all.includes('media_player.kitchen_speaker_dlna') && !g.all.some((x) => /robot_(current|saved)_map|image\.robot/.test(x))
      && g.security.includes('camera.jardin') && g.scenes.length === 4 && g.all.includes('climate.poele_a_pellets') && !g.all.some((x) => /light\.jardin_/.test(x)),
    JSON.stringify({ scenes: g.scenes, sec: g.security.filter((x) => x.startsWith('camera.')) }));
  // ---- 5 · the popup, rendered
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Quality', dashboard: g.model })).json()).entry.id;
  const open = async (page, room, dash = id) => {
    await page.goto(`${L.base}/?d=${dash}`); await page.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 25000 }); await page.waitForTimeout(1500);
    await page.evaluate(() => window.editor.go('rooms')); await page.waitForTimeout(1500);
    const pt = await page.evaluate((room) => { const t = [...document.querySelectorAll('[data-grid-id^="r-"]')].find((x) => x.textContent.includes(room)); t.scrollIntoView({ block: 'center' }); const b = t.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 3]; }, room);
    await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(1800);
    const out = [];
    const n = await page.evaluate(() => [...document.querySelectorAll('.mpop [role=tab]')].filter((x) => x.offsetParent).length);
    for (let i = 0; i < n; i++) {
      await page.evaluate((i) => [...document.querySelectorAll('.mpop [role=tab]')].filter((x) => x.offsetParent)[i].click(), i); await page.waitForTimeout(700);
      out.push(await page.evaluate(() => { const pn = document.querySelector('.mpop__panel').getBoundingClientRect(), tab = document.querySelector('.mpop [role=tab]').getBoundingClientRect();
        const kids = [...document.querySelectorAll('.mpop .mg--nested .mg__item')].filter((x) => x.offsetParent).map((k) => k.getBoundingClientRect());
        const body = document.querySelector('.mpop__body');
        return { tabH: Math.round(tab.height), head: Math.round(tab.top - pn.top), maxTile: Math.max(0, ...kids.filter((k) => k.width < pn.width * 0.5).map((k) => Math.round(k.height))),
          over: kids.some((k) => k.right > pn.right + 1), below: kids.some((k) => k.bottom > pn.bottom + 1) && !(body.scrollHeight > body.clientHeight + 2), w: Math.round(pn.width) }; }));
    }
    return out;
  };
  const desk = await open(p, 'Salle à manger');
  check('5a · the dining-room popup: six tabs that all hold something, fine rows (app.grid.popups), 900 px wide; rendered with a ≤ 36 px tab bar, the header ≤ 230 px, tiles ≤ 100 px (a compact thermostat ≤ 190 px), nothing past its edges',
    g.sam.tabs.join() === 'active,lights,heating,media,security,sensors' && g.popupsGrid === 'page' && g.sam.w === 900 && desk.length === 6
      && desk.every((t, i) => t.tabH <= 36 && t.head <= 230 && t.maxTile <= (i === 2 ? 190 : 100) && !t.over && !t.below), JSON.stringify(desk));
  const ctx = await B.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' }, storageState: await B.ctx.storageState() });
  const ph = await ctx.newPage();
  const phone = await open(ph, 'Salle à manger');
  check('5b · on a phone the same popup opens full width with its tabs; no card wider than the screen', phone.length === 6 && phone.every((t) => t.w <= 390 && !t.over), JSON.stringify(phone));
  await ctx.close();
  // ---- 6 · energy
  const en = g.energy;
  check('6 · Energy: the house design (picture + utility cards), solar and grid (import positive), no gas / water flow made from meter totals',
    en && en.config.variant === 'house' && en.config.nodes.map((x) => x.type).join() === 'solar,grid' && en.config.nodes[1].positive === 'toward' && en.config.entity === 'sensor.house_consumption', JSON.stringify(en && en.config));
  // ---- 7 · without the registry
  REGISTRY.refuse = true; loadRealHome({ registry: false });
  const g2 = await gen(p);
  const leaks2 = [...new Set(g2.all.filter((x) => TECH.test(x)))];
  const sam2 = [...new Set(g2.sam.ids)];
  check('7 · without the registry (an older Home Assistant): still no technical entity; the dining-room popup stays small', g2.ok && leaks2.length === 0 && sam2.length <= 12, JSON.stringify({ leaks2, sam2 }));
  // ---- 8 · a dashboard made before app.grid.popups keeps its popup rows
  const legacy = structuredClone(g.model); delete legacy.app.grid.popups;
  const lid = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Legacy', dashboard: legacy })).json()).entry.id;
  await open(p, 'Salle à manger', lid);
  const back = null;
  const saved = await (await me.send('GET', `/api/dashboards.php?id=${lid}`)).json();
  const pop = await p.evaluate(() => { const g = document.querySelector('.mpop .mg--nested'); return g ? { pagerows: g.classList.contains('mg--pagerows'), row: getComputedStyle(g.querySelector('.mg__grid')).gridAutoRows } : null; });
  check('8 · a dashboard without app.grid.popups keeps its popups on the legacy rows (saved and reloaded unchanged)', !!pop && pop.pagerows === false && pop.row === '40px' && saved.dashboard && saved.dashboard.app.grid.popups === undefined && back === null,
    JSON.stringify({ pop, popups: saved.dashboard && saved.dashboard.app.grid.popups }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('generator-quality test ran', false, e.stack || e.message);
} finally {
  REGISTRY.refuse = false;
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
