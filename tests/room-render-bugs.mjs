/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM rendering: (1) an Information icon keeps its glyph size whatever its background (none · subtle · accent) — measured through
// the REAL Room editor's live preview at several Icon sizes; (2) the Room title never clips descenders (g y p q j) — every variant ×
// MaisonFit size × title size: the title may clip only sideways (its ellipsis) and nothing inside the card cuts below its glyphs.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]', ED = `${CFG} [data-k=item-editor]`, PV = `${CFG} .ecfg-pv .iq-room`;
let L, B;
try {
  L = await live();
  L.setEntity('sensor.salon_temp', '21.4', { name: 'Salon temperature', unit: '°C', dc: 'temperature' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const cfg = { name: 'Living Room', image: 'widgets/custom/room-scene/assets/demo-living-room.svg', info: [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state', label: 'Temp', icon: 'mdi:thermometer', color: 'accent-hot' }] };
  await E((c) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'rb', type: 'custom.room-scene', parent: null, config: c, layout: { desktop: { x: 1, y: 60, w: 7, h: 7 }, tablet: { x: 1, y: 60, w: 6, h: 6 }, mobile: { w: 4, h: 5 } } }); window.editor.setModel(m); }, cfg);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('.ed-canvas [data-grid-id="rb"]', { position: { x: 14, y: 14 }, force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`);
  await E((CFG) => { const d = document.querySelector(`${CFG} details[data-group="information"]`); d.open = true; }, CFG);
  await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-index="0"] [data-k=col-edit]`).click(), CFG); await page.waitForSelector(ED);

  // ---- (1) the glyph keeps its size with every background
  const glyph = () => E((PV) => { const ic = document.querySelector(`${PV} .iq-room__stat[data-info="i1"] .iq-room__sicon`), svg = ic.querySelector('svg'), r = svg.getBoundingClientRect(), b = ic.getBoundingClientRect();
    return { g: Math.round(r.width * 10) / 10, box: Math.round(b.width * 10) / 10, bg: ic.dataset.iqiBg || 'none' }; }, PV);
  const setBg = async (v) => { await page.selectOption(`${ED} .ef-field[data-key="iconBg"] select`, v); await page.waitForTimeout(150); };
  const rows = [];
  for (const size of [null, 20, 32, 48]) {
    if (size) { await page.fill(`${ED} .ef-field[data-key="iconSize"] input.ef-range__n`, String(size)); await page.press(`${ED} .ef-field[data-key="iconSize"] input.ef-range__n`, 'Enter'); await page.waitForTimeout(150); }
    const r = {};
    for (const bg of ['none', 'subtle', 'accent']) { await setBg(bg); r[bg] = await glyph(); }
    rows.push({ size: size || 'auto', ...r });
  }
  // the preview is shown scaled: compare the glyph with the glyph (same scale), and the box with the glyph
  check('1 the glyph is the same size with no background, Subtle and Accent — at Automatic, 20, 32 and 48 px', rows.every((r) => Math.abs(r.subtle.g - r.none.g) < 0.6 && Math.abs(r.accent.g - r.none.g) < 0.6), JSON.stringify(rows));
  check('1 with a background the surface sizes itself AROUND the glyph (larger than it); without one the element is the glyph', rows.every((r) => r.subtle.box > r.subtle.g + 2 && r.accent.box > r.accent.g + 2 && Math.abs(r.none.box - r.none.g) < 0.6), JSON.stringify(rows));
  const ratio = rows.filter((r) => r.size !== 'auto').map((r) => r.none.g / r.size);
  check('1 the configured Icon size drives the glyph (20 → 32 → 48 px grow in proportion)', ratio.every((x) => Math.abs(x - ratio[0]) < 0.02), JSON.stringify(ratio));
  await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(200);
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(300);
  const dash = await E(() => { const ic = document.querySelector('.ed-canvas [data-grid-id="rb"] .iq-room__stat .iq-room__sicon'); return { g: ic.querySelector('svg').getBoundingClientRect().width, cs: getComputedStyle(ic).width, bg: ic.dataset.iqiBg }; });
  check('1 on the dashboard (Applied: 48 px, Accent): the glyph is 48 px inside its accent surface', dash.bg === 'accent' && dash.cs === '48px', JSON.stringify(dash));

  // ---- (2) titles with descenders — every variant × size × title size
  const res = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:10px;width:2600px';
    const sizes = [[200, 130], [340, 200], [460, 300], [760, 440]], out = [];
    const names = ['Living Room', 'Gym', 'Playing', 'Typography gypqj'];
    ['scene', 'card', 'status', 'minimal'].forEach((v) => sizes.forEach(([w, h], si) => [undefined, 80, 150].forEach((ts) => {
      const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`;
      const name = names[(si + (ts || 0)) % names.length];
      b.append(window.MaisonRegistry.build('custom.room-scene', { name, variant: v, ...(ts ? { titleSize: ts } : {}), image: 'widgets/custom/room-scene/assets/demo-living-room.svg' })); host.append(b);
    })));
    document.body.append(host);
    return new Promise((res) => setTimeout(() => {
      host.querySelectorAll('.iq-room').forEach((r) => {
        const n = r.querySelector('.iq-room__name'), cs = getComputedStyle(n), fs = parseFloat(cs.fontSize), nb = n.getBoundingClientRect();
        // the deepest descender of the font ≈ .26 em below the baseline; the baseline sits ≈ .8 em from the top of a 1.04 line box
        const need = nb.top + fs * (0.8 + 0.26);
        let clipper = null;
        for (let a = n; a && a !== r.parentElement; a = a.parentElement) {
          const s = getComputedStyle(a), clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowY);
          if (clipsY && a.getBoundingClientRect().bottom < need - 0.5) { clipper = a.className || a.tagName; break; }
        }
        out.push({ v: r.dataset.variant, arr: r.dataset.fitArr, ts: r.style.getPropertyValue('--iq-room-ts') || '1', name: n.textContent, ellipsis: cs.textOverflow, oy: cs.overflowY, clipper, shown: n.offsetParent !== null });
      });
      host.remove(); res(out);
    }, 1500));
  });
  const bad = res.filter((x) => x.shown && x.clipper);
  check('2 no title descender is clipped — 4 variants × 4 sizes × 3 title sizes (Living Room, Gym, Playing, Typography gypqj)', res.length === 48 && bad.length === 0, JSON.stringify(bad));
  check('2 the title still ends with an ellipsis sideways (clip only on the inline axis)', res.every((x) => x.ellipsis === 'ellipsis' && x.oy === 'visible'), JSON.stringify(res.slice(0, 2)));
  check('2 every MaisonFit size was met (micro · compact · normal · large)', ['micro', 'compact', 'normal', 'large'].every((a) => res.some((x) => x.arr === a)), JSON.stringify([...new Set(res.map((x) => x.arr))]));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
