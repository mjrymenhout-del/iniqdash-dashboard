/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The GENERIC Home Assistant values inspector (components/ha/inspector.js + api/ha_entity.php): every attribute HA reports for the
// selected entity, in the shared configuration form, for any entity field. Real PHP server + fake Home Assistant (raw state objects).
import { live, liveBrowser, RAW, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

// a vacuum with HA's usual attributes, an integration-specific one, every JSON value kind, and credentials that must never leave the server
const VAC = { entity_id: 'vacuum.maid', state: 'docked', last_changed: '2026-10-28T08:00:00+00:00', last_updated: '2026-10-28T08:05:00+00:00', attributes: {
  battery_level: 87, battery_icon: 'mdi:battery-charging-80', fan_speed: 'Standard', fan_speed_list: ['Quiet', 'Standard', 'Strong'], status: 'Charging',
  x_maid_mop_route: 'zigzag', cleaned_area: 12.5, is_mopping: false, error: null, empty: '',
  map_meta: { rooms: { 16: 'Kitchen', 17: 'Hall' }, api_key: 'NESTED-SECRET-KEY' },
  access_token: 'CAMERA-ACCESS-TOKEN-XYZ', entity_picture: '/api/vacuum_proxy/vacuum.maid?token=URL-TOKEN-ABC&v=2',
  friendly_name: 'My Maid', supported_features: 12924 } };
const BARE = { entity_id: 'sensor.bare', state: '42', attributes: {} };
// a phone tracker: precise location (the Entity Details policy never passes it on) next to ordinary attributes
const PHONE = { entity_id: 'device_tracker.phone', state: 'not_home', attributes: { source_type: 'gps', battery_level: 64, friendly_name: 'Phone',
  latitude: 52.3731234, longitude: 4.8925678, gps_accuracy: 12, altitude: 3.4, vertical_accuracy: 5, speed: 1.2, course: 270,
  last_fix: { latitude: 52.3739999, longitude: 4.8929999, label: 'fix-label' } } };

let L, B;
try {
  L = await live();
  L.setEntity('vacuum.maid', 'docked', { name: 'My Maid', f: 12924, bat: 87, fs: 'Standard', fsl: ['Quiet', 'Standard', 'Strong'] });
  L.setEntity('vacuum.other', 'cleaning', { name: 'Upstairs', f: 12924, bat: 40 });
  L.setEntity('sensor.bare', '42', { name: 'Bare' });
  RAW['vacuum.maid'] = structuredClone(VAC);
  RAW['vacuum.other'] = { entity_id: 'vacuum.other', state: 'cleaning', attributes: { friendly_name: 'Upstairs', battery_level: 40, other_only: 'yes' } };
  RAW['sensor.bare'] = BARE;
  RAW['device_tracker.phone'] = PHONE;

  // ---- the endpoint: signed-in only, complete, in HA's order, credentials withheld
  const anon = L.client();
  check('signed out: the endpoint answers 401', (await anon.send('GET', '/api/ha_entity.php?entity=vacuum.maid')).status === 401);
  const me = L.client(); await me.login();
  const get = async (id) => { const r = await me.send('GET', `/api/ha_entity.php?entity=${encodeURIComponent(id)}`); const t = await r.text(); return { t, j: JSON.parse(t) }; };
  let { t, j } = await get('vacuum.maid');
  const e = j.entity, names = e.attributes.map((p) => p[0]), val = (n) => e.attributes.find((p) => p[0] === n)?.[1];
  const expect = Object.keys(VAC.attributes).filter((n) => n !== 'access_token');
  check('1 entity: id, domain and state as HA reports them', e.id === 'vacuum.maid' && e.domain === 'vacuum' && e.state === 'docked' && e.last_updated === VAC.last_updated);
  check('1 every attribute HA reports, in HA order (all but the credential)', names.join() === expect.join(), names.join());
  check('2 an integration-specific attribute is kept', val('x_maid_mop_route') === 'zigzag');
  check('3/4/5 values keep their JSON kind (list, object, number, boolean, null, empty string)',
    Array.isArray(val('fan_speed_list')) && val('fan_speed_list').length === 3 && val('map_meta').rooms[16] === 'Kitchen' && val('cleaned_area') === 12.5
    && val('is_mopping') === false && val('error') === null && val('empty') === '' && val('battery_level') === 87);
  check('6 supported_features: the raw number', val('supported_features') === 12924);
  check('7 credentials: the access_token value, a nested api_key and a URL token never reach the browser',
    !t.includes('CAMERA-ACCESS-TOKEN-XYZ') && !t.includes('NESTED-SECRET-KEY') && !t.includes('URL-TOKEN-ABC') && !t.includes(FAKE_TOKEN)
    && [...e.redacted].sort().join() === 'access_token,map_meta.api_key' && val('entity_picture') === '/api/vacuum_proxy/vacuum.maid?token=[hidden]&v=2', t);
  ({ j } = await get('sensor.bare'));
  check('8 an entity without attributes: state, an empty list', j.entity.state === '42' && j.entity.attributes.length === 0 && j.entity.count === 0);
  let pt; ({ t: pt, j } = await get('device_tracker.phone'));
  const pn = j.entity.attributes.map((p) => p[0]);
  check('L1/L2 latitude and longitude are not exposed (values never in the answer)', !pn.includes('latitude') && !pn.includes('longitude') && !/52\.373|4\.892/.test(pt), pt);
  check('L3 GPS accuracy and the other precise-location attributes are not exposed (top level and nested)', ['gps_accuracy', 'altitude', 'vertical_accuracy', 'speed', 'course'].every((n) => !pn.includes(n))
    && [...j.entity.location].sort().join() === ['altitude', 'course', 'gps_accuracy', 'last_fix.latitude', 'last_fix.longitude', 'latitude', 'longitude', 'speed', 'vertical_accuracy'].join(), JSON.stringify(j.entity.location));
  check('L4 ordinary attributes stay visible', pn.join() === 'source_type,battery_level,friendly_name,last_fix' && j.entity.attributes.find((p) => p[0] === 'last_fix')[1].label === 'fix-label', pn.join());
  ({ j } = await get('sensor.nope'));
  check('an unknown entity: connected, no entity (nothing invented)', j.ok && j.connected && j.entity === null && !j.error);
  ({ j } = await get('../etc'));
  check('a malformed id is refused', j.error === 'bad_entity' && j.entity === null);
  delete RAW['vacuum.maid'].attributes.status;
  ({ j } = await get('vacuum.maid'));
  check('an attribute HA drops is gone on the next read', !j.entity.attributes.some((p) => p[0] === 'status'));
  RAW['vacuum.maid'] = structuredClone(VAC);

  // ---- the shared form: every entity field gets the (collapsed) inspector; the existing capability summary keeps working
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const f = window.MaisonForm.create({ type: 'robot', config: { entity: 'vacuum.maid' }, onChange: (c) => { window.__cfg = c; } });
    f.el.id = 'probe-form'; document.body.prepend(f.el); window.__form = f;
  });
  const main = '#probe-form .ef-field[data-key="entity"]';
  await page.waitForSelector(`${main} [data-k=ha-caps]:not([hidden])`, { timeout: 8000 });
  await page.waitForFunction((s) => /This entity supports/.test(document.querySelector(`${s} [data-k=ha-caps]`).textContent), main, { timeout: 8000 });
  check('10 the existing capability summary still works', true);
  const insp = `${main} [data-k=ha-values]`;
  check('the inspector is there, collapsed, nothing fetched yet', await page.$eval(insp, (d) => !d.open && !d.hidden && !d.querySelector('.iq-insp__row')));
  const other = await page.$$eval('#probe-form .ef-field--entity', (l) => l.filter((w) => w.dataset.key !== 'entity').map((w) => [w.dataset.key, !!w.querySelector('[data-k=ha-values]')]));
  check('every other entity field of the widget has the same shared inspector', other.length > 0 && other.every((x) => x[1]), JSON.stringify(other));
  await page.click(`${insp} > summary`);
  await page.waitForSelector(`${insp} .iq-insp__row[data-attr="battery_level"]`, { timeout: 8000 });
  const rows = await page.$$eval(`${insp} .iq-insp__s:nth-of-type(2) .iq-insp__row`, (l) => l.map((r) => [r.dataset.attr, r.querySelector('[data-k=insp-value]').textContent]));
  const R = Object.fromEntries(rows);
  check('UI: every attribute row (and the withheld credential by name only)', rows.map((r) => r[0]).join() === [...expect, 'access_token'].join(), rows.map((r) => r[0]).join());
  check('UI: entity section shows entity_id, domain, state', await page.$eval(insp, (d) => { const s = d.querySelector('.iq-insp__s'); const v = (n) => s.querySelector(`[data-attr="${n}"] [data-k=insp-value]`)?.textContent; return v('entity_id') === 'vacuum.maid' && v('domain') === 'vacuum' && v('state') === 'docked'; }));
  check('UI: readable values (list joined, number, boolean, null, empty string)', R.fan_speed_list === 'Quiet, Standard, Strong' && R.battery_level === '87' && R.is_mopping === 'false' && R.error === 'null' && R.empty === '""' && R.x_maid_mop_route === 'zigzag', JSON.stringify(R));
  check('UI: an object is readable compactly and in full (View)', /Kitchen/.test(R.map_meta) && await page.$eval(`${insp} [data-attr="map_meta"] [data-k=insp-full]`, (p) => JSON.parse(p.textContent).rooms['17'] === 'Hall'));
  check('UI: supported_features raw value with its note', R.supported_features === '12924' && await page.$eval(`${insp} [data-attr="supported_features"]`, (r) => /bit flags/.test(r.textContent)));
  check('UI: the credential is named but its value is never in the page', /Hidden/.test(R.access_token) && !(await page.content()).includes('CAMERA-ACCESS-TOKEN-XYZ'));
  check('UI: the count and the source are shown', await page.$eval(insp, (d) => /Attributes \(15\)/.test(d.querySelector('summary').textContent) && /Live from Home Assistant/.test(d.querySelector('[data-k=insp-source]').textContent)));
  // live: an attribute disappears in HA → disappears here (re-read while open)
  delete RAW['vacuum.maid'].attributes.x_maid_mop_route;
  await page.waitForFunction((s) => !document.querySelector(`${s} [data-attr="x_maid_mop_route"]`), insp, { timeout: 9000 });
  check('UI: an attribute HA drops disappears while the inspector is open', true);
  // 9 changing the selected entity re-reads for the new one (through the real picker)
  await page.click(`${main} [data-k=iqp-choose]`);
  await page.click(`${main} button[data-entity="vacuum.other"]`);
  await page.waitForSelector(`${insp} [data-attr="other_only"]`, { timeout: 8000 });
  check('9 picking another entity refreshes the inspector (old attributes gone)', await page.$eval(insp, (d) => !d.querySelector('[data-attr="fan_speed_list"]') && d.querySelector('.iq-insp__s [data-attr="entity_id"] [data-k=insp-value]').textContent === 'vacuum.other'));
  // live values are never configuration
  const cfg = await page.evaluate(() => JSON.stringify(window.__form.value()));
  check('10 the widget configuration holds the entity id only — no live state or attributes', JSON.parse(cfg).entity === 'vacuum.other' && !/other_only|battery_level|Charging|attributes/.test(cfg), cfg);
  check('10 the configuration still validates', (await page.evaluate(() => window.__form.errors().length)) === 0);
  // 8 an entity with no attributes, through the UI
  await page.click(`${main} [data-k=iqp-choose]`);
  const pickable = await page.$(`${main} button[data-entity="sensor.bare"]`);
  if (pickable) {
    await pickable.click();
    await page.waitForSelector(`${insp} [data-k=insp-none]`, { timeout: 8000 });
    check('8 UI: no attributes → a plain sentence, no rows', await page.$eval(insp, (d) => d.querySelectorAll('.iq-insp__s:nth-of-type(2) .iq-insp__row').length === 0));
  } else {
    // the robot picker lists vacuum / mower only: prove the empty case through the shared component itself
    const ok = await page.evaluate(async () => { const el = window.IniqHA.inspector({ entity: 'sensor.bare' }); document.body.append(el); el.open = true; for (let i = 0; i < 40 && !el.querySelector('[data-k=insp-none]'); i++) await new Promise((r) => setTimeout(r, 200)); const r = !!el.querySelector('[data-k=insp-none]') && /Attributes \(0\)/.test(el.textContent); el.remove(); return r; });
    check('8 UI: no attributes → a plain sentence, no rows (shared component)', ok);
  }
  const loc = await page.evaluate(async () => {
    const el = window.IniqHA.inspector({ entity: 'device_tracker.phone' }); document.body.append(el); el.open = true;
    for (let i = 0; i < 40 && !el.querySelector('[data-attr="source_type"]'); i++) await new Promise((r) => setTimeout(r, 200));
    const v = (n) => el.querySelector(`[data-attr="${n}"] [data-k=insp-value]`)?.textContent;
    const r = { lat: v('latitude'), acc: v('gps_accuracy'), src: v('source_type'), bat: v('battery_level'), text: el.textContent };
    el.remove(); return r;
  });
  check('L UI: location named as hidden, no coordinate in the page; ordinary attributes shown', /precise location/.test(loc.lat) && /precise location/.test(loc.acc)
    && !/52\.373|4\.892/.test(loc.text) && loc.src === 'gps' && loc.bat === '64', JSON.stringify(loc));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
