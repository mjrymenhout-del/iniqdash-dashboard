/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WEATHER PRESETS — the existing Weather widget's presentations (the shared Variant system). Real editor, real PHP server, FAKE Home
// Assistant (tests/lib/live.mjs — not a real Home Assistant) serving a weather entity and its daily forecast (weather.get_forecasts).
//   Standard (unchanged) · Current conditions · Daily forecast (a LIST: glyph · day + Home Assistant's date · condition · rain chance ·
//   high / low; the first N rows, the shared Expandable List's arrow reveals the rest INSIDE the widget) · Compact (next 3 days) · Detailed
//   (details + the list). Nothing invented: values = Home Assistant's; a demo widget shows no dates. Configure: the presets and "rows
//   shown"; theme; mobile; save + reload.
import path from 'node:path';
import { live, liveBrowser, FORECASTS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
const DAY = 86400000, t0 = new Date(); t0.setHours(12, 0, 0, 0);
const iso = (d) => new Date(t0.getTime() + d * DAY).toISOString();
const COND = ['rainy', 'cloudy', 'partlycloudy', 'sunny', 'pouring', 'snowy', 'fog'];
FORECASTS['weather.home'] = { daily: COND.map((c, i) => ({ datetime: iso(i), condition: c, temperature: 12 + i, templow: 4 + i, precipitation_probability: [80, 30, 10, 0, 90, 60, 20][i] })) };
let L, B;
try {
  L = await live();
  L.setEntity('weather.home', 'partlycloudy', { name: 'Home weather', f: 1, wt: 14, wtu: '°C', wh: 72, ws: 14, wsu: 'km/h' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(1000);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y: y * 2 + x, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  await E((ls) => { const m = window.editor.getModel(); m.pages[0].items = [
    { id: 'w-std', type: 'weather', parent: null, config: { location: 'Home', entity: 'weather.home' }, layout: ls[0] },
    { id: 'w-cur', type: 'weather', parent: null, config: { location: 'Home', entity: 'weather.home', variant: 'current' }, layout: ls[1] },
    { id: 'w-day', type: 'weather', parent: null, config: { location: 'Home', entity: 'weather.home', variant: 'daily' }, layout: ls[2] },
    { id: 'w-cmp', type: 'weather', parent: null, config: { location: 'Home', entity: 'weather.home', variant: 'compact' }, layout: ls[3] },
    { id: 'w-det', type: 'weather', parent: null, config: { location: 'Home', entity: 'weather.home', variant: 'detailed', forecastRows: 4 }, layout: ls[4] },
    { id: 'w-demo', type: 'weather', parent: null, config: { location: 'Demo town', variant: 'daily' }, layout: ls[5] },
    { id: 'below', type: 'sensor', parent: null, config: { name: 'Neighbour' }, layout: ls[6] },
  ]; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); },
  [lay(1, 1, 8, 3), lay(9, 1, 4, 3), lay(1, 5, 4, 9), lay(5, 5, 8, 3), lay(5, 9, 4, 11), lay(9, 9, 4, 9), lay(1, 14, 4, 3)]);
  await page.waitForFunction(() => document.querySelectorAll('.ed-canvas [data-grid-id="w-day"] .wx__row').length >= 7, null, { timeout: 20000 }).catch(() => {});
  await wait(800);
  const read = (id) => E((id) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .wx`);
    const rows = [...w.querySelectorAll('.wx__row')].map((r) => ({ hidden: r.hidden, day: r.querySelector('.wx__row-d b').textContent, date: r.querySelector('.wx__row-d small').textContent, cond: r.querySelector('.wx__row-c').textContent,
      p: r.querySelector('.wx__row-p').textContent, hi: r.querySelector('.wx__row-t b').textContent, lo: r.querySelector('.wx__row-t small').textContent }));
    const btn = w.querySelector('.iqx'), vis = (s) => { const n = w.querySelector(s); return !!n && getComputedStyle(n).display !== 'none'; };
    return { variant: w.dataset.variant, rows, btn: btn && btn.getAttribute('aria-expanded'), strip: w.querySelectorAll('.wx__day').length, stripVisible: [...w.querySelectorAll('.wx__day')].filter((d) => getComputedStyle(d).display !== 'none').length,
      stats: vis('.wx__stats'), fc: vis('.wx__fc') }; }, id);
  const std = await read('w-std'), cur = await read('w-cur'), day = await read('w-day'), cmp = await read('w-cmp'), det = await read('w-det'), demo = await read('w-demo');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'weather-presets.png') });
  check('STANDARD (every existing Weather widget): the same strip as always — no list', std.variant === 'standard' && std.rows.length === 0 && std.strip >= 1, JSON.stringify(std));
  check('CURRENT CONDITIONS: details, no forecast', cur.variant === 'current' && cur.stats && !cur.fc && cur.strip === 0, JSON.stringify(cur));
  check('DAILY FORECAST: Home Assistant\'s 7 days as a list — 3 shown, the arrow (collapsed) reveals the rest', day.rows.length === 7 && day.rows.filter((r) => !r.hidden).length === 3 && day.btn === 'false', JSON.stringify(day));
  const r0 = day.rows[0], r1 = day.rows[1];
  check('…each row: day + Home Assistant\'s date, condition, rain chance and high / low exactly as reported (Today 12° / 4° 80 % Rain; next day 13° / 5° 30 % Cloudy)',
    r0.day === 'Today' && /\d/.test(r0.date) && r0.cond === 'Rain' && r0.p === '80%' && r0.hi === '12°' && r0.lo === '4°' && r1.hi === '13°' && r1.lo === '5°' && r1.cond === 'Cloudy' && r1.p === '30%', JSON.stringify([r0, r1]));
  // expand: inside the widget — the grid never moves, the neighbour stays where it is
  const geo = () => E(() => [...document.querySelectorAll('.ed-canvas [data-grid-id]')].map((n) => { const r = n.getBoundingClientRect(); return `${n.dataset.gridId}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`; }).join(' '));
  const g0 = await geo();
  await page.click('.ed-canvas [data-grid-id="w-day"] .iqx'); await wait(400);
  const open = await read('w-day');
  const inside = await E(() => { const w = document.querySelector('.ed-canvas [data-grid-id="w-day"]').getBoundingClientRect(), l = document.querySelector('.ed-canvas [data-grid-id="w-day"] .wx__fc').getBoundingClientRect(); return l.top >= w.top - 1 && l.bottom <= w.bottom + 1; });
  check('EXPAND: the arrow reveals all 7 rows (aria-expanded true); the list scrolls INSIDE the widget — no widget moves or grows (the neighbour stays put)', open.rows.every((r) => !r.hidden) && open.btn === 'true' && inside && (await geo()) === g0, JSON.stringify({ btn: open.btn, inside }));
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="w-day"]')).screenshot({ path: path.join(SHOTS, 'weather-daily-expanded.png') });
  await page.click('.ed-canvas [data-grid-id="w-day"] .iqx'); await wait(300);
  check('COLLAPSE: back to 3 rows', (await read('w-day')).rows.filter((r) => !r.hidden).length === 3);
  check('COMPACT FORECAST: the next three days only, no details', cmp.variant === 'compact' && cmp.stripVisible === 3 && !cmp.stats, JSON.stringify(cmp));
  check('DETAILED FORECAST: details + the list, 4 rows shown (its own setting)', det.variant === 'detailed' && det.stats && det.rows.length === 7 && det.rows.filter((r) => !r.hidden).length === 4, JSON.stringify({ stats: det.stats, rows: det.rows.length, shown: det.rows.filter((r) => !r.hidden).length }));
  check('DEMO (not linked): the demo days as a list — and NO dates (never invented)', demo.rows.length === 4 && demo.rows.every((r) => r.date === ''), JSON.stringify(demo.rows));
  // ---------------------------------------------------------------- Configure: the shared editor
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="w-day"]', { position: { x: 10, y: 10 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(600);
  const cfg = await E(() => { const d = document.querySelector('dialog[open]'); const v = d.querySelector('.ef-field[data-key="variant"] select');
    return { presets: v ? [...v.options].map((o) => o.textContent) : [], rows: !!d.querySelector('.ef-field[data-key="forecastRows"]'), pvRows: d.querySelectorAll('.ecfg-pv .wx__row').length }; });
  check('CONFIGURE (the shared widget editor): the presets Standard · Current conditions · Daily forecast · Compact forecast · Detailed forecast, "Forecast rows shown", the Live preview draws the list',
    JSON.stringify(cfg.presets) === JSON.stringify(['Standard', 'Current conditions', 'Daily forecast', 'Compact forecast', 'Detailed forecast']) && cfg.rows && cfg.pvRows >= 4, JSON.stringify(cfg));
  await E(() => { const n = document.querySelector('dialog[open] .ef-field[data-key="forecastRows"] input[type=number]'); n.value = '5'; n.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await wait(800);
  check('ROWS SHOWN = 5 (Apply): five rows before the arrow', (await read('w-day')).rows.filter((r) => !r.hidden).length === 5);
  await E(() => window.editor.setEditing(false)); await wait(300);
  // ---------------------------------------------------------------- theme · mobile
  const rowBg = () => E(() => getComputedStyle(document.querySelector('.ed-canvas [data-grid-id="w-day"] .wx__row')).backgroundColor);
  const b0 = await rowBg();
  await E(() => window.editor.themeStudio().apply('azure-home')); await wait(200);
  const b1 = await rowBg();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'weather-presets-azure.png') });
  check('THEME: the rows follow the theme at once (Azure Home)', b0 !== b1, JSON.stringify([b0, b1]));
  await E(() => window.editor.themeStudio().apply('iniqdash')); await wait(200);
  await page.setViewportSize({ width: 420, height: 900 }); await wait(1200);
  const mob = await E(() => { const w = document.querySelector('.ed-canvas [data-grid-id="w-day"]'), W = w.getBoundingClientRect();
    const out = [...w.querySelectorAll('.wx__row:not([hidden])')].filter((r) => { const b = r.getBoundingClientRect(); return b.right > W.right + 1 || b.left < W.left - 1; }).length;
    return { out, rows: w.querySelectorAll('.wx__row:not([hidden])').length }; });
  check('MOBILE: the list fits the narrow widget (no row overflows it)', mob.out === 0 && mob.rows === 5, JSON.stringify(mob));
  await page.setViewportSize({ width: 1500, height: 1100 }); await wait(800);
  // ---------------------------------------------------------------- save + reload
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const saved = await E(() => window.editor.getModel().pages[0].items.filter((i) => i.type === 'weather').map((i) => [i.id, i.config.variant || 'standard', i.config.forecastRows ?? null]));
  check('RELOAD: every preset and its rows kept (Standard stores nothing new)', JSON.stringify(saved) === JSON.stringify([['w-std', 'standard', null], ['w-cur', 'current', null], ['w-day', 'daily', 5], ['w-cmp', 'compact', null], ['w-det', 'detailed', 4], ['w-demo', 'daily', null]]), JSON.stringify(saved));
  check('no Home Assistant service call other than the read-only weather.get_forecasts', !L.haCalls.some((x) => /\/api\/services\//.test(x.url) && !/weather\/get_forecasts/.test(x.url)));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
