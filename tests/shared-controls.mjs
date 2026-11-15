/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SHARED CONTROLS — one implementation per function, reachable by built-in and custom widgets through ONE public, versioned interface.
// FAKE Home Assistant (tests/lib/harness.mjs — not a real one).
//   IniqDashUI exposes the very modules the built-in widgets use (identical objects — never copies) · Light's and Climate's power buttons
//   are the same shared control (IniqControls.button) · Room / Scene (a custom package) reaches the shared components only through the public
//   interface · Popup hero information is the shared information item · IniqComponents.catalog(): JSON-safe element metadata for a future
//   Studio (identity, Properties, defaults, preview, bindings, actions, box, resize) for every composable component.
import fs from 'node:fs';
import path from 'node:path';
import { start, check } from './lib/harness.mjs';
import { ROOT } from './lib/live.mjs';

const T = await start([
  ['light.desk', 'on', { name: 'Desk', f: 0, br: 180, cm: 'brightness', scm: ['brightness'] }],
  ['climate.salon', 'heat', { name: 'Salon', f: 1, cur: 21.4, target: 22.5, min: 7, max: 30, step: 0.5, modes: ['heat', 'off'], action: 'heating' }],
]);
const page = await T.page();
const E = (fn, ...a) => page.evaluate(fn, ...a);

const pub = await E(() => { const U = window.IniqDashUI; return { version: U.version, same: ['controls', 'info', 'text', 'slider', 'dial', 'gauge', 'visuals', 'icons', 'flow', 'sunArc', 'components'].map((k) => [k, U[k] !== null && U[k] === window[{ controls: 'IniqControls', info: 'IniqInfo', text: 'IniqText', slider: 'IniqSlider', dial: 'IniqDial', gauge: 'IniqGauge', visuals: 'IniqVisuals', icons: 'IniqIcons', flow: 'IniqFlow', sunArc: 'IniqSunArc', components: 'IniqComponents' }[k]]]), frozen: Object.isFrozen(U), has: U.has('dial') }; });
check('PUBLIC INTERFACE IniqDashUI (version 1, frozen): controls, info, text, slider, dial, gauge, visuals, icons, flow, sun arc, registry — each the SAME module the built-in widgets use',
  pub.version === 1 && pub.frozen && pub.has && pub.same.every((x) => x[1]), JSON.stringify(pub));

await T.mount(page, 'light', { entity: 'light.desk', name: 'Desk' }, 360, 260, 'w1');
await T.mount(page, 'climate', { entity: 'climate.salon', name: 'Salon', controls: [{ type: 'dial' }, { type: 'mode' }, { type: 'power', show: true }, { type: 'minus' }, { type: 'plus' }] }, 360, 420, 'w2');
await page.waitForTimeout(600);
const btn = await E(() => { const pick = (id) => [...document.querySelectorAll(`#${id} .iqc-btn`)].map((b) => ({ api: typeof b.control?.update === 'function', role: b.getAttribute('role') || '' }));
  return { light: pick('w1'), climate: pick('w2') }; });
check('ONE BUTTON: the Light power button and the Climate power / − / + buttons are the same shared control (IniqControls.button — one renderer, one update API)',
  btn.light.length >= 1 && btn.climate.length >= 3 && [...btn.light, ...btn.climate].every((b) => b.api), JSON.stringify(btn));
const room = fs.readFileSync(path.join(ROOT, 'widgets/custom/room-scene/room-scene.js'), 'utf8');
check('ROOM / SCENE (a custom package) uses the shared information item and icons through the PUBLIC interface — no private global',
  /IniqDashUI/.test(room) && /UI\('info'\)\.render/.test(room) && !/global\.IniqInfo\.render/.test(room));
const cat = await E(() => window.IniqComponents.catalog());
const byId = Object.fromEntries(cat.map((c) => [c.id, c]));
const comp = await E(() => window.IniqComponents.composable().map((d) => d.id));
check('ELEMENT METADATA (IniqComponents.catalog): one JSON-safe entry per composable component, each with identity, category, Properties, defaults, preview data, box and resize',
  cat.length === comp.length && cat.every((c) => c.id && c.name && c.category && Array.isArray(c.properties) && (c.properties.length > 0 || c.id === 'spacer') && c.box && c.resize && typeof c.defaults === 'object'),
  JSON.stringify(cat.filter((c) => !(c.properties && c.properties.length)).map((c) => c.id)));   // the Spacer has no configuration
check('…bindings and actions where a component has them: Button reports a press; Dial takes a value (display); Flow connector takes a value; Sun arc its sun data',
  Object.keys(byId.button.actions).length > 0 && byId.dial && Object.keys(byId.dial.inputs).length > 0 && byId['flow-connector'].inputs.value && byId['sun-arc'].inputs.state,
  JSON.stringify({ b: byId.button.actions, d: [byId.dial?.inputs, byId.dial?.actions] }));
check('no page errors', page.errors.length === 0, page.errors.join(' | '));
await T.close();
