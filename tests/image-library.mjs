/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// IMAGE OWNERSHIP = WIDGET TYPE: an image uploaded while configuring one Light is offered to every Light (and never to a Room); the
// same for Rooms. The picker is the shared one (form type 'artwork'), its library scoped by the widget type (api/asset_library.php).
// Real editor (Add / Edit configuration dialogs), real PHP server (secure upload) + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ROOM = 'custom.room-scene';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  const model = async () => { await E(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'more').click()); await E(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'export').click()); await page.waitForSelector('textarea.ed-code'); const m = JSON.parse(await page.$eval('textarea.ed-code', (x) => x.value)); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return m.pages.flatMap((p) => p.items); };
  const ids0 = (await model()).map((i) => i.id);
  const openImages = () => E(() => document.querySelectorAll('dialog[open] details').forEach((d) => { d.open = true; }));
  // the picker as the owner sees it: the uploaded-image tiles (their image references, read from the DOM only) and what is selected
  const picker = () => E(() => { const f = document.querySelector('dialog[open] .ef-field[data-key="image"]');
    return { lib: [...f.querySelectorAll('[data-k=art-lib]')].map((t) => t.dataset.value), selected: (f.querySelector('.ef-art__t[aria-pressed="true"]') || {}).dataset?.value || null,
      labels: [...f.querySelectorAll('.ef-art__t:not([hidden]) .ef-art__l')].map((x) => x.textContent), text: f.innerText }; });
  const waitLib = (n) => page.waitForFunction((n) => document.querySelectorAll('dialog[open] .ef-field[data-key="image"] [data-k=art-lib]').length >= n, n, { timeout: 10000 });
  const upload = async (file) => { const before = (await picker()).lib.length; await page.setInputFiles('dialog[open] input[data-upload="image"]', file); await waitLib(before + 1); await page.waitForTimeout(200); return (await picker()).selected; };
  /** Add a widget through the real Add flow, doing `step` in its configuration step */
  const add = async (type, step) => {
    await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
    await page.waitForSelector(`.ecfg-tile[data-type="${type}"]`); await page.click(`.ecfg-tile[data-type="${type}"]`); await page.waitForTimeout(500);
    await openImages(); await page.waitForTimeout(400);
    const r = await step();
    await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(200);
    await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(500);
    const it = (await model()).filter((i) => i.type === type && !ids0.includes(i.id)).pop(); ids0.push(it.id);
    return { item: it, r };
  };
  const edit = async (id, step) => {
    await page.click(`[data-grid-id="${id}"]`, { force: true }); await page.waitForTimeout(150);
    await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef');
    await openImages(); await page.waitForTimeout(600);
    const r = await step();
    await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(400);
    return r;
  };
  const cfgOf = async (id) => (await model()).find((i) => i.id === id).config;

  // ---- LIGHT A uploads; LIGHT B sees it, uploads another; LIGHT A sees both
  const A = await add('light', async () => upload('assets/img/media/artwork-dusk.jpg'));
  const img1 = A.r;
  check('Light A: the upload is selected (an IniqDash asset reference)', /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(img1) && (await cfgOf(A.item.id)).image === img1, img1);
  const Bl = await add('light', async () => { await waitLib(1); const p = await picker(); await page.click(`dialog[open] .ef-field[data-key="image"] [data-k=art-lib][data-value="${img1}"]`); await page.waitForTimeout(200); return p; });
  check('Light B: Light A\'s upload is offered without uploading again', Bl.r.lib.includes(img1), JSON.stringify(Bl.r.lib));
  check('Light B: the same image selected in both', (await cfgOf(Bl.item.id)).image === img1 && (await cfgOf(A.item.id)).image === img1);
  check('no path, address or id is shown in the picker', !/api\/|asset|\.jpg|[0-9a-f]{32}|widgets\//.test(Bl.r.text), Bl.r.text);
  const img2 = await edit(Bl.item.id, async () => upload('assets/img/media/artwork-tide.jpg'));
  const seenA = await edit(A.item.id, async () => { await waitLib(2); const p = await picker(); await page.click('dialog[open] .ef-field[data-key="image"] [data-k=art-builtin]'); await page.waitForTimeout(200); return p; });
  check('Light A: both Light uploads are offered', seenA.lib.includes(img1) && seenA.lib.includes(img2), JSON.stringify(seenA.lib));
  check('changing Light A\'s image leaves Light B\'s as it was', (await cfgOf(A.item.id)).image === 'widgets/default/light/assets/pendant-dome.png' && (await cfgOf(Bl.item.id)).image === img2);
  check('the uploaded images stay available to Light (after the change)', (await edit(A.item.id, async () => (await waitLib(2), picker()))).lib.length >= 2);

  // ---- ROOM A uploads; ROOM B sees it — and no Light image, no Light built-in
  const RA = await add(ROOM, async () => { const p = await picker(); return { before: p, img: await upload('assets/img/media/artwork-dusk.jpg') }; });
  const rimg = RA.r.img;
  check('Room: before any Room upload, the picker offers no Light upload and no Light built-in', RA.r.before.lib.length === 0 && !RA.r.before.labels.some((l) => /Pendant|Dining room/.test(l)), JSON.stringify(RA.r.before));
  const RB = await add(ROOM, async () => { await waitLib(1); const p = await picker(); await page.click(`dialog[open] .ef-field[data-key="image"] [data-k=art-lib][data-value="${rimg}"]`); await page.waitForTimeout(200); return p; });
  check('Room B: Room A\'s upload is offered and reused', RB.r.lib.includes(rimg) && (await cfgOf(RB.item.id)).image === rimg, JSON.stringify(RB.r.lib));
  check('isolation: Room never lists the Light uploads', !RB.r.lib.includes(img1) && !RB.r.lib.includes(img2) && rimg !== img1);
  const lightNow = await edit(A.item.id, async () => (await waitLib(2), picker()));
  check('isolation: Light never lists the Room upload, nor the Room built-in', !lightNow.lib.includes(rimg) && !lightNow.labels.includes('Living room') && lightNow.labels.includes('Pendant'), JSON.stringify(lightNow));
  check('Room keeps its own built-in ("Living room"), not Light\'s', RB.r.labels.includes('Living room') && !RB.r.labels.includes('Pendant'));

  // ---- an image uploaded before libraries existed (no type): a widget already showing it brings it into its type's library
  const old = await E(async () => { const blob = await (await fetch('assets/img/media/artwork-dusk.jpg')).blob(); const fd = new FormData(); fd.append('file', new File([blob], 'x.jpg', { type: 'image/jpeg' }), 'upload');
    const r = await fetch('api/asset_upload.php', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': document.querySelector('meta[name="iniqdash-csrf"]').content } }); return (await r.json()).ref; });
  await E(({ old }) => { document.querySelectorAll('dialog').forEach((d) => d.remove()); window.MaisonConfigure.open({ mount: document.body, mode: 'edit', type: 'light', config: window.MaisonRegistry.fullConfig('light', { name: 'Old', image: old }), size: { w: 3, h: 4 }, onApply() {}, onCancel() {} }); }, { old });
  await openImages(); await page.waitForTimeout(800);
  let p = await picker();
  check('an older Light\'s uploaded image still loads, selected, without uploading again', p.selected === old && p.lib.includes(old), JSON.stringify(p));
  await E(() => document.querySelectorAll('dialog').forEach((d) => d.remove()));
  const libs = await E(async () => { const g = async (s) => (await (await fetch(`api/asset_library.php?scope=${s}`, { credentials: 'same-origin' })).json()).items.map((x) => x.ref); return { light: await g('light'), room: await g('custom.room-scene') }; });
  check('…and from then on it is in the Light library for every Light (not in Room\'s)', libs.light.includes(old) && !libs.room.includes(old), JSON.stringify(libs));
  check('library answers are references only (no path, no name)', [...libs.light, ...libs.room].every((r) => /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(r)));

  // ---- secure access unchanged
  const sec = await E(async () => ({ bad: (await fetch('api/asset_library.php?scope=../x', { credentials: 'same-origin' })).status,
    noCsrf: (await fetch('api/asset_library.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'light', ref: 'api/asset.php?id=' + '0'.repeat(32) }) })).status,
    unknown: await (await fetch('api/asset_library.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="iniqdash-csrf"]').content }, body: JSON.stringify({ scope: 'light', ref: 'api/asset.php?id=' + '0'.repeat(32) }) })).json() }));
  check('a malformed scope is refused; adopting needs CSRF; an unknown image is never recorded', sec.bad === 400 && sec.noCsrf === 403 && sec.unknown.ok === false, JSON.stringify(sec));
  const anon = await E(async () => (await fetch('api/asset_library.php?scope=light', { credentials: 'omit' })).status);
  check('signed out (no session): the library is not readable', anon === 401, String(anon));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
