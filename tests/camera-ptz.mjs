/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CAMERA PTZ — the existing Camera widget's PTZ presentation. Real editor, real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real
// Home Assistant). Home Assistant has no universal PTZ service: every control is an EXPLICITLY MAPPED entity of the camera's integration.
//   only mapped controls exist · a move / zoom → button.press on THAT button entity · a preset → select.select_option with a real option ·
//   spotlight → light.turn_on / turn_off · privacy on needs a second press → switch.turn_on · motion is an indicator (never an action) ·
//   toggles show Home Assistant's state (never optimistic) · demo (not linked): every control, labelled Demo, nothing sent · the existing
//   Picture and Doorbell presentations unchanged · the picture still refreshes through IniqDash's own snapshot endpoint · save + reload.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  L.setEntity('camera.gate', 'idle', { name: 'Gate camera', f: 2, cst: 'hls' });
  for (const [id, n] of [['up', 'Tilt up'], ['down', 'Tilt down'], ['left', 'Pan left'], ['right', 'Pan right'], ['zin', 'Zoom in'], ['zout', 'Zoom out']]) L.setEntity(`button.gate_${id}`, '2026-10-23T10:00:00+00:00', { name: n });
  L.setEntity('select.gate_preset', 'Gate', { name: 'Gate preset', opts: ['Gate', 'Driveway', 'Garden'] });
  L.setEntity('light.gate_spot', 'off', { name: 'Gate spotlight', f: 0, br: 0, cm: 'onoff', scm: ['onoff'] });
  L.setEntity('switch.gate_privacy', 'off', { name: 'Gate privacy' });
  L.setEntity('binary_sensor.gate_motion', 'on', { name: 'Gate motion', dc: 'motion' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  let snaps = 0;
  await page.route('**/api/ha_cam.php*', (r) => { snaps++; r.fulfill({ body: PNG, contentType: 'image/png' }); });
  await page.waitForTimeout(1000);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const posts = () => L.haCalls.filter((x) => x.method === 'POST' && /\/api\/services\//.test(x.url));
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y: y * 2 + x, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  const MAP = { tiltUp: 'button.gate_up', tiltDown: 'button.gate_down', panLeft: 'button.gate_left', panRight: 'button.gate_right', zoomIn: 'button.gate_zin', zoomOut: 'button.gate_zout',
    preset: 'select.gate_preset', spotlight: 'light.gate_spot', privacy: 'switch.gate_privacy', motion: 'binary_sensor.gate_motion' };
  await E(({ ls, MAP }) => { const m = window.editor.getModel(); m.pages[0].items = [
    { id: 'c-ptz', type: 'camera', parent: null, config: { name: 'Gate', entity: 'camera.gate', variant: 'ptz', mappings: MAP }, layout: ls[0] },
    { id: 'c-part', type: 'camera', parent: null, config: { name: 'Partly mapped', entity: 'camera.gate', variant: 'ptz', mappings: { panLeft: MAP.panLeft, panRight: MAP.panRight } }, layout: ls[1] },
    { id: 'c-demo', type: 'camera', parent: null, config: { name: 'Demo PTZ', variant: 'ptz' }, layout: ls[2] },
    { id: 'c-pic', type: 'camera', parent: null, config: { name: 'Picture', entity: 'camera.gate' }, layout: ls[3] },
  ]; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, { ls: [lay(1, 1, 6, 8), lay(7, 1, 6, 8), lay(1, 9, 6, 8), lay(7, 9, 6, 8)], MAP });
  const P = '.ed-canvas [data-grid-id="c-ptz"]';
  await page.waitForFunction((P) => !!document.querySelector(`${P} .cam__preset option[value="Driveway"]`), P, { timeout: 15000 }).catch(() => {});
  await wait(1000);
  const view = (id) => E((id) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .cam`), q = (s) => w.querySelector(s);
    return { variant: w.dataset.variant, roles: [...w.querySelectorAll('.cam__ptzb')].map((b) => b.dataset.role), preset: q('.cam__preset') && !q('.cam__preset').hidden ? [...q('.cam__preset').options].map((o) => o.value).filter(Boolean) : [],
      presetValue: q('.cam__preset')?.value, ind: [...w.querySelectorAll('.cam__ind .cam__chip')].map((c) => c.textContent), spot: q('.cam__ptzb[data-role="spotlight"]')?.dataset.state, priv: q('.cam__ptzb[data-role="privacy"]')?.dataset.state, img: w.dataset.img }; }, id);
  let v = await view('c-ptz');
  if (SHOTS) await (await page.$(P)).screenshot({ path: path.join(SHOTS, 'camera-ptz.png') });
  check('PTZ (all mapped): tilt up / down, pan left / right, zoom in / out, spotlight, privacy, the presets from Home Assistant (Gate · Driveway · Garden, current Gate), motion "Motion", the picture through IniqDash',
    ['tiltUp', 'panLeft', 'panRight', 'tiltDown', 'zoomIn', 'zoomOut', 'spotlight', 'privacy'].every((r) => v.roles.includes(r)) && JSON.stringify(v.preset) === JSON.stringify(['Gate', 'Driveway', 'Garden']) && v.presetValue === 'Gate'
      && v.ind.includes('Motion') && v.spot === 'off' && v.priv === 'off' && v.img === 'ok', JSON.stringify(v));
  const part = await view('c-part');
  check('ONLY MAPPED CONTROLS: a camera with only pan left / right mapped shows just those two (no tilt, zoom, presets, toggles)', JSON.stringify(part.roles.sort()) === JSON.stringify(['panLeft', 'panRight']) && part.preset.length === 0, JSON.stringify(part));
  const p0 = posts().length;
  const press = async (role) => { await page.click(`${P} .cam__ptzb[data-role="${role}"]`); await wait(700); if (process.env.DIAG) console.log('DIAG', role, await E((P) => document.querySelector(`${P} .cam__ptz-msg`).textContent, P)); };
  await press('tiltUp'); await press('zoomIn');
  let sent = posts().slice(p0).map((x) => [x.url.replace(/^.*\/api\/services\//, ''), JSON.parse(x.body).entity_id]);
  check('A MOVE / ZOOM: button.press on exactly the mapped button entity (no invented PTZ service)', JSON.stringify(sent) === JSON.stringify([['button/press', 'button.gate_up'], ['button/press', 'button.gate_zin']]), JSON.stringify(sent));
  await page.selectOption(`${P} .cam__preset`, 'Driveway'); await wait(800);
  sent = posts().slice(p0 + 2).map((x) => [x.url.replace(/^.*\/api\/services\//, ''), JSON.parse(x.body)]);
  check('A PRESET: select.select_option on the mapped select with that option', sent.length === 1 && sent[0][0] === 'select/select_option' && sent[0][1].entity_id === 'select.gate_preset' && sent[0][1].option === 'Driveway', JSON.stringify(sent));
  await press('spotlight');
  sent = posts().slice(p0 + 3).map((x) => [x.url.replace(/^.*\/api\/services\//, ''), JSON.parse(x.body).entity_id]);
  v = await view('c-ptz');
  check('SPOTLIGHT: light.turn_on on the mapped light — and the control still shows OFF until Home Assistant reports it (never optimistic)', JSON.stringify(sent) === JSON.stringify([['light/turn_on', 'light.gate_spot']]) && v.spot === 'off', JSON.stringify({ sent, spot: v.spot }));
  L.setEntity('light.gate_spot', 'on');
  await page.waitForFunction((P) => document.querySelector(`${P} .cam__ptzb[data-role="spotlight"]`)?.dataset.state === 'on', P, { timeout: 15000 }).catch(() => {});
  check('…ON once Home Assistant reports it', (await view('c-ptz')).spot === 'on');
  const n1 = posts().length;
  await press('privacy');
  const armed = posts().length === n1 && /Press again/.test(await E((P) => document.querySelector(`${P} .cam__ptz-msg`).textContent, P));
  await press('privacy');
  sent = posts().slice(n1).map((x) => [x.url.replace(/^.*\/api\/services\//, ''), JSON.parse(x.body).entity_id]);
  check('PRIVACY ON is sensitive: the first press only asks to press again (nothing sent); the second sends switch.turn_on on the mapped switch', armed && JSON.stringify(sent) === JSON.stringify([['switch/turn_on', 'switch.gate_privacy']]), JSON.stringify({ armed, sent }));
  // demo
  const d0 = posts().length;
  const demo = await view('c-demo');
  await page.click('.ed-canvas [data-grid-id="c-demo"] .cam__ptzb[data-role="panLeft"]'); await wait(300);
  const demoMsg = await E(() => document.querySelector('.ed-canvas [data-grid-id="c-demo"] .cam__ptz-msg').textContent);
  check('DEMO (not linked): every control, labelled Demo — a press says "Demo — nothing sent" and sends nothing', demo.roles.length === 8 && demo.ind.includes('Demo') && /Demo — nothing sent/.test(demoMsg) && posts().length === d0, JSON.stringify({ demo, demoMsg }));
  const pic = await view('c-pic');
  check('PICTURE (the existing presentation) unchanged: no PTZ controls', pic.variant === 'picture' && pic.roles.length === 0, JSON.stringify(pic));
  check('THE PICTURE refreshes through IniqDash\'s own snapshot endpoint (no stream, no Home Assistant address in the page)', snaps > 0 && !(await E(() => /:\/\/[^/]*8123|access_token/.test(document.body.innerHTML))));
  // configure: the PTZ section
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click(P, { position: { x: 30, y: 200 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(600);
  const cfg = await E(() => { const d = document.querySelector('dialog[open]'); return { variants: [...d.querySelectorAll('.ef-field[data-key="variant"] option')].map((o) => o.textContent), ptz: !!d.querySelector('details[data-group="ptz"]'),
    roles: [...d.querySelectorAll('details[data-group="ptz"] .ef-field')].map((f) => f.dataset.key) }; });
  check('CONFIGURE (the shared editor): Picture · Doorbell · PTZ camera; a "PTZ controls" section with one entity field per control', JSON.stringify(cfg.variants) === JSON.stringify(['Picture', 'Doorbell', 'PTZ camera']) && cfg.ptz && cfg.roles.length === 10, JSON.stringify(cfg));
  await page.click('dialog[open] .ecfg-foot button:has-text("Cancel")'); await wait(300);
  await E(() => window.editor.setEditing(false));
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const saved = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'c-ptz').config);
  check('RELOAD: the PTZ presentation and its mappings kept', saved.variant === 'ptz' && Object.keys(saved.mappings).length === 10, JSON.stringify(saved));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
