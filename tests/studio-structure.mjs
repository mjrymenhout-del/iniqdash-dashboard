/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — STRUCTURE (C4), driven through the VISIBLE UI only: parametric outlines (a card with a tab, a notch, a speech bubble
// with a pointer), clipping one element to another's outline (follows a move), rich text pieces (colour, weight, superscript), italic;
// save → reopen (server-validated) and the dashboard renderer drawing the same.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live({ configureHa: false });
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  const S = 'dialog.wst[open]', P = `${S} .wst__props`;
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const wait = (ms = 250) => page.waitForTimeout(ms);
  const num = async (k, v) => { await page.fill(`${P} [data-k=${k}]`, String(v)); await page.press(`${P} [data-k=${k}]`, 'Tab'); await wait(300); };
  const F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const rng = async (k, v, root = P) => { await page.fill(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, String(v)); await page.press(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, 'Enter'); await wait(250); };
  const ED = '[data-k=item-editor][open]';
  const addItem = async (col, fill) => { await page.click(`${P} [data-col="${col}"] [data-k=col-add]`); await page.waitForSelector(ED, { timeout: 8000 }); await fill(); await page.click(`${ED} [data-k=sub-save]`); await wait(300); };
  const node = (id) => E(({ S, id }) => { const b = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`), s0 = b && b.querySelector('.iqel-shape__s'), o = b && b.querySelector('svg.iqel-shape__o path');
    return b && { clip: b.style.clipPath, sclip: s0 ? s0.style.clipPath : '', stroke: o ? o.getAttribute('stroke-width') : null, filter: b.firstElementChild ? b.firstElementChild.style.filter : '' }; }, { S, id });
  const add = async (type) => { await page.click(`${S} [data-k=wst-add][data-type=${type}]`); await wait(300); return (await state()).sel; };

  await E(() => window.IniqStudioLibrary.createCollection('Structure'));
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await wait(300);
  await num('wst-canvas-w', 480); await num('wst-canvas-h', 320);

  // ---- A CARD WITH A TAB (reference A's weather card): the Shape menu, the tab's edge, position, width, depth, slope; a border; a shadow
  const card = await add('shape');
  await num('wst-x', 40); await num('wst-y', 40); await num('wst-w', 240); await num('wst-h', 200);
  await page.selectOption(`${F('shape')} select`, 'tab'); await wait(300);
  await page.selectOption(`${F('featureSide')} select`, 'top'); await wait(200);
  await rng('featureAt', 25); await rng('featureWidth', 110); await rng('featureDepth', 28); await rng('featureSlope', 14); await rng('radius', 22);
  await rng('borderWidth', 2);
  await page.selectOption(`${F('shadow')} select`, 'custom'); await wait(300);
  let st = await state(), n1 = await node(card);
  const cfg = st.def.components.find((x) => x.id === card).config;
  check('CARD WITH A TAB: chosen in the Shape menu; edge, position, width, depth and slope set by their fields', cfg.shape === 'tab' && cfg.featureAt === 25 && cfg.featureWidth === 110 && cfg.featureDepth === 28 && cfg.featureSlope === 14, JSON.stringify(cfg));
  check('…the fill is cut to the outline (a path), the border follows it (SVG, 2 px inside), the shadow follows it (drop-shadow)', /^path\(/.test(n1.sclip) && n1.stroke === '4' && /drop-shadow/.test(n1.filter), JSON.stringify(n1));

  // ---- A NOTCH and a SPEECH BUBBLE (reference B's device frame and the vacuum's bubble)
  const notch = await add('shape');
  await page.selectOption(`${F('shape')} select`, 'notch'); await wait(300);
  await rng('featureWidth', 60); await rng('featureDepth', 14);
  const bub = await add('shape');
  await page.selectOption(`${F('shape')} select`, 'callout'); await wait(300);
  await page.selectOption(`${F('featureSide')} select`, 'left'); await wait(200);
  await rng('featureAt', 70);
  const [n2, n3] = [await node(notch), await node(bub)];
  st = await state();
  check('CARD WITH A NOTCH and SPEECH BUBBLE (pointer on the left, at 70 %): their own outlines', /^path\(/.test(n2.sclip) && /^path\(/.test(n3.sclip) && n2.sclip !== n3.sclip
    && st.def.components.find((x) => x.id === bub).config.featureSide === 'left', JSON.stringify({ n2: n2.sclip.slice(0, 60), n3: n3.sclip.slice(0, 60) }));

  // ---- CLIP TO ANOTHER ELEMENT: a gradient "photo" cut to the tab card's outline; it follows when the card moves
  const photo = await add('shape');
  await num('wst-x', 20); await num('wst-y', 20); await num('wst-w', 300); await num('wst-h', 160);
  await page.selectOption(`${F('shape')} select`, 'rectangle'); await wait(200);
  await page.selectOption(`${F('style.clipTo')} select`, card); await wait(300);
  const c1 = (await node(photo)).clip;
  st = await state();
  check('CLIP TO (Element style): the photo is cut to the card\'s tab outline, offset to the card\'s place', st.def.components.find((x) => x.id === photo).style.clipTo === card && /^path\(["']M/.test(c1), c1.slice(0, 90));
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: card }); await wait(200);
  await num('wst-x', 60);
  const c2 = (await node(photo)).clip;
  check('…moving the card (Layout X 40 → 60) moves the cut with it', c2 !== c1 && /^path\(/.test(c2), `${c1.slice(0, 50)} → ${c2.slice(0, 50)}`);

  // ---- RICH TEXT: "69" + "m²" (superscript, smaller) + " First floor" (another colour, lighter)
  const tx = await add('text');
  await page.fill(`${F('text')} input`, '69'); await page.press(`${F('text')} input`, 'Tab'); await wait(250);
  await addItem('runs', async () => { await page.fill(`${ED} .ef-field[data-key="text"] input`, 'm2'); await page.selectOption(`${ED} .ef-field[data-key="baseline"] select`, 'super'); await wait(150); });
  await addItem('runs', async () => { await page.fill(`${ED} .ef-field[data-key="text"] input`, ' First floor'); await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="warning"]`);
    await page.selectOption(`${ED} .ef-field[data-key="weight"] select`, '300'); await wait(150); });
  await page.click(`${F('italic')} button[role=switch]`); await wait(250);
  const rich = await E(({ S, id }) => { const b = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`), r = [...b.querySelectorAll('.iqtx__r')];
    return { text: b.textContent, runs: r.map((x) => ({ t: x.textContent, va: x.style.verticalAlign, fs: x.style.fontSize, c: x.style.color, w: x.style.fontWeight })), italic: b.querySelector('.iqtx').style.fontStyle }; }, { S, id: tx });
  check('RICH TEXT: "69" + superscript "m2" (60 %) + " First floor" in the warning colour, light — one text element; italic by its switch',
    rich.text === '69m2 First floor' && rich.runs[0].va === 'super' && rich.runs[0].fs === '60%' && /warning/.test(rich.runs[1].c) && rich.runs[1].w === '300' && rich.italic === 'italic', JSON.stringify(rich));

  // ---- SAVE → REOPEN (server-validated) and the DASHBOARD renderer
  await page.fill(`${S} [data-k=wst-name]`, 'Structure test'); await page.click(`${S} [data-k=wst-save]`); await wait(1500);
  st = await state();
  const savedId = st.defId;
  check('SAVE: accepted by the server (outline fields, clip-to, text pieces)', !!savedId && !st.dirty, JSON.stringify({ id: savedId, msg: await page.textContent(`${S} [data-k=wst-status]`).catch(() => '') }));
  await page.click(`${S} [data-k=wst-close]`); await wait(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await wait(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${savedId}`); await wait(600);
  st = await state();
  const re = await node(photo);
  check('REOPEN: the same outlines, clip and text pieces', st.def.components.length === 5 && st.def.components.find((x) => x.id === tx).config.runs.length === 2 && /^path\(/.test(re.clip), JSON.stringify({ n: st.def.components.length, clip: re.clip.slice(0, 40) }));
  await page.click(`${S} [data-k=wst-close]`); await wait(300);
  const dash = await E((id) => { const w = window.MaisonStudioWidget.create({ definition: id, entities: {} }); document.body.append(w);
    const b = w.querySelector('.stw__c[data-cid="shape-4"]'), s0 = w.querySelector('.stw__c[data-cid="shape-1"] .iqel-shape__s'), t = w.querySelector('.stw__c[data-cid="text-1"]');
    const out = { clip: b ? b.style.clipPath : '', tab: s0 ? s0.style.clipPath : '', text: t ? t.textContent : '' }; w.remove(); return out; }, savedId);
  check('DASHBOARD renderer (a placed copy): the same clip, tab outline and rich text', /^path\(/.test(dash.clip) && /^path\(/.test(dash.tab) && dash.text === '69m2 First floor', JSON.stringify(dash).slice(0, 200));
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('studio-structure test ran', false, e.stack);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
