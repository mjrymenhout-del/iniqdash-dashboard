/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SUN ARC — the reusable sun arc (components/sunarc: IniqSunArc), its Sun & Moon preset ("Sun arc") and its Widget Studio element.
// FAKE Home Assistant (tests/lib/harness.mjs — not a real one): sun.sun with Home Assistant's own attributes.
//   the sun is placed by TIME between today's sunrise and sunset: HA's next_setting, and today's sunrise seen happen or derived from HA's
//   solar noon (marked ≈) — never "noon = the middle of the arc" from the clock · morning / afternoon (HA then reports tomorrow's noon) ·
//   below the horizon: before sunrise on the left, after sunset on the right (HA's next midnight decides), HA's next times shown ·
//   unavailable / missing times → no sun, "—" (nothing invented) · the widget keeps the other presets · the Studio element renders it.
import { start, check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
const H = 3600000, iso = (h) => new Date(Date.now() + h * H).toISOString();
const T = await start([
  // afternoon: sunset in 5 h, HA's next noon is TOMORROW (in 23 h → today's noon was 1 h ago), next midnight in 11 h, next sunrise in 14 h
  ['sun.sun', 'above_horizon', { name: 'Sun', el: 33.4, az: 191.2, ns: iso(5), nr: iso(14), nn: iso(23), nm: iso(11), ri: false }],
  // morning: noon still ahead today (in 3 h), sunset in 9 h
  ['sun.morning', 'above_horizon', { name: 'Morning', el: 14, az: 110, ns: iso(9), nr: iso(21), nn: iso(3), nm: iso(15), ri: true }],
  // after sunset (evening): next midnight (in 3 h) comes BEFORE the next sunrise (in 10 h)
  ['sun.evening', 'below_horizon', { name: 'Evening', el: -8, az: 290, ns: iso(22), nr: iso(10), nn: iso(16), nm: iso(3), ri: true }],
  // before sunrise (after midnight): next sunrise in 2 h comes before the next midnight (in 22 h)
  ['sun.early', 'below_horizon', { name: 'Early', el: -10, az: 60, ns: iso(14), nr: iso(2), nn: iso(8), nm: iso(22), ri: true }],
  ['sun.broken', 'unavailable', { name: 'Broken' }],
]);
const page = await T.page();
await page.waitForTimeout(300);

// ---------------------------------------------------------------- the rule itself (pure)
const rule = await page.evaluate(() => {
  const P = window.IniqSunArc.position, now = Date.UTC(2026, 5, 21, 12, 0), h = 3600000;
  const sun = (state, ev, extra = {}) => ({ state, events: ev, ...extra });
  // solar noon at 13:40, sunset 21:30 → sunrise 05:50: at 12:00 the day is LESS than half gone (the clock's noon is not the middle)
  const a = P(sun('above_horizon', { setting: now + 9.5 * h, noon: now + (5 / 3) * h }), now);
  const atNoon = P(sun('above_horizon', { setting: now + 9.5 * h, noon: now + (5 / 3) * h }), now + (5 / 3) * h);
  // afternoon: HA's next noon is tomorrow's
  const pm = P(sun('above_horizon', { setting: now + 3 * h, noon: now + 21 * h }), now);
  // a sunrise seen happen wins over the derived one
  const seen = P(sun('above_horizon', { setting: now + 6 * h, noon: now + 20 * h }, { lastRising: now - 6 * h }), now);
  const before = P(sun('below_horizon', { rising: now + 2 * h, setting: now + 14 * h, midnight: now + 22 * h }), now);
  const after = P(sun('below_horizon', { rising: now + 9 * h, setting: now + 21 * h, midnight: now + 2 * h }), now);
  const na = P(sun('unavailable', {}), now), noTimes = P(sun('above_horizon', {}), now);
  return { a, atNoon, pm, seen, before, after, na, noTimes, now, h };
});
check('BY TIME, NOT BY THE CLOCK: solar noon at 13:40 and sunset at 21:30 put sunrise at 05:50 (≈, derived) — at 12:00 the sun is 39 % along, exactly half-way only at solar noon',
  rule.a.phase === 'day' && rule.a.riseEstimated && Math.abs(rule.a.rise - (rule.now - (6 + 1 / 6) * rule.h)) < 1000 && Math.abs(rule.a.f - 0.3936) < 0.002 && Math.abs(rule.atNoon.f - 0.5) < 0.001, JSON.stringify({ a: rule.a, atNoon: rule.atNoon.f }));
check('…AFTERNOON: Home Assistant already reports tomorrow\'s noon — today\'s is 24 h earlier (sunset in 3 h, today\'s noon 3 h ago → 50 % … here 0.5 at noon, 0.75 now)',
  rule.pm.phase === 'day' && Math.abs(rule.pm.f - 0.75) < 0.002, JSON.stringify(rule.pm));
check('…a sunrise SEEN happen (Home Assistant\'s next_rising moving on) is used as is — not marked ≈', rule.seen.riseEstimated === false && Math.abs(rule.seen.f - 0.5) < 0.001, JSON.stringify(rule.seen));
check('NIGHT: before sunrise → the sun waits on the LEFT (f 0); after sunset → on the RIGHT (f 1) — decided by Home Assistant\'s next midnight',
  rule.before.phase === 'before' && rule.before.f === 0 && rule.after.phase === 'after' && rule.after.f === 1, JSON.stringify({ b: rule.before, a: rule.after }));
check('UNAVAILABLE / NO TIMES: no position at all (nothing invented)', rule.na.phase === 'na' && rule.na.f === null && rule.noTimes.phase === 'na' && rule.noTimes.f === null);

// ---------------------------------------------------------------- the Sun & Moon preset
const view = () => page.evaluate(() => { const r = document.querySelector('#w .iq-sun'), a = r && r.querySelector('.iqsa');
  if (!a) return null; const sun = a.querySelector('.iqsa__sun'), svg = a.querySelector('.iqsa__svg'), W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height, t = [...a.querySelectorAll('.iqsa__time')].map((x) => x.textContent);
  const arc = a.querySelector('.iqsa__arc'), g = a.querySelector('.iqsa__hz');
  return { variant: r.dataset.variant, phase: a.dataset.phase, cx: Number(sun.getAttribute('cx')) / W, cy: Number(sun.getAttribute('cy')), base: Number(g.getAttribute('y1')), W, H, sunShown: getComputedStyle(sun).display !== 'none',
    glow: getComputedStyle(a.querySelector('.iqsa__glow')).display !== 'none', rise: t[0], set: t[1], el: a.querySelector('.iqsa__elev').textContent, now: a.querySelector('.iqsa__now').textContent,
    arcW: Number(getComputedStyle(arc).strokeWidth.replace('px', '')), d: arc.getAttribute('d'), state: r.querySelector('.iq-sun__state').textContent, arc: r.sunmoon.getState().arc, oldPath: !!r.querySelector('.iq-sun__arc') }; });
const res = {};
for (const [k, ent] of [['pm', 'sun.sun'], ['am', 'sun.morning'], ['eve', 'sun.evening'], ['early', 'sun.early'], ['na', 'sun.broken']]) {
  await T.mount(page, 'sunmoon', { entity: ent, variant: 'arc', showElevation: true }, 380, 260); await page.waitForTimeout(350);
  res[k] = await view();
  if (SHOTS) await (await page.$('#w')).screenshot({ path: `${SHOTS}/sun-arc-${k}.png` });
}
check('SUN ARC preset (afternoon): a THIN golden arc (2 px, the reference), the luminous sun 7/12 of the way along it with its glow, sunrise ≈ derived from HA\'s noon, HA\'s sunset, the current time under the sun, elevation 33° when asked',
  res.pm && res.pm.variant === 'arc' && res.pm.phase === 'day' && Math.abs(res.pm.arc.f - 7 / 12) < 0.01 && res.pm.cx > 0.5 && res.pm.cy < res.pm.base - 10 && res.pm.sunShown && res.pm.glow && res.pm.arcW <= 2.5
    && /^≈ /.test(res.pm.rise) && /\d/.test(res.pm.set) && /\d\d:\d\d/.test(res.pm.now) && res.pm.el === '33°' && !res.pm.oldPath, JSON.stringify(res.pm));
check('…SHALLOW and WIDE, not a gauge: the arc spans most of the width and rises at most about a fifth of it', (() => { const n = res.pm.d.match(/-?[\d.]+/g).map(Number); const span = n[6] - n[0], rise = res.pm.base - Math.min(n[3], n[5]) * 0.75 - res.pm.base * 0.25; return span > res.pm.W * 0.8 && rise <= span * 0.22; })(), res.pm.d);
check('…MORNING: noon still ahead — the sun left of the middle (f < 0.5)', res.am.phase === 'day' && res.am.arc.f < 0.5 && res.am.cx < 0.5, JSON.stringify(res.am));
check('…EVENING (after sunset): no glowing sun on the arc — a quiet sun waits on the horizon at the RIGHT, HA\'s next times shown; BEFORE SUNRISE: on the LEFT',
  res.eve.phase === 'after' && res.eve.cx > 0.85 && Math.abs(res.eve.cy - res.eve.base) < 1 && !res.eve.glow && /\d/.test(res.eve.rise) && res.early.phase === 'before' && res.early.cx < 0.15, JSON.stringify({ eve: res.eve, early: res.early }));
check('…UNAVAILABLE: no sun, the times "—", the state "Unavailable" — nothing invented', res.na.phase === 'na' && !res.na.sunShown && res.na.rise === '—' && res.na.set === '—' && res.na.state === 'Unavailable', JSON.stringify(res.na));
// responsive: the widget's own box (MaisonFit)
const sizes = [];
for (const [w, h] of [[160, 110], [260, 170], [380, 260], [620, 300]]) {
  await T.mount(page, 'sunmoon', { entity: 'sun.sun', variant: 'arc' }, w, h); await page.waitForTimeout(300);
  sizes.push(await page.evaluate(() => { const r = document.querySelector('#w .iq-sun'), b = r.getBoundingClientRect(), a = r.querySelector('.iqsa__arc').getBoundingClientRect(), s = r.querySelector('.iqsa__sun').getBoundingClientRect();
    const t = [...r.querySelectorAll('.iqsa__time')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.getBoundingClientRect());
    return { w: Math.round(b.width), h: Math.round(b.height), arcIn: a.width > 20 && a.left >= b.left - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1, sunIn: s.left >= b.left - 1 && s.right <= b.right + 1 && s.top >= b.top - 1 && s.bottom <= b.bottom + 1,
      timesIn: t.every((x) => x.left >= b.left - 1 && x.right <= b.right + 1 && x.bottom <= b.bottom + 1) }; }));
}
check('RESPONSIVE: 160 × 110 · 260 × 170 · 380 × 260 · 620 × 300 — the arc, the sun and the times stay inside the widget', sizes.every((x) => x.arcIn && x.sunIn && x.timesIn), JSON.stringify(sizes));
// the other presets unchanged (still the azimuth sun path)
await T.mount(page, 'sunmoon', { entity: 'sun.sun', variant: 'minimal' }, 360, 300); await page.waitForTimeout(250);
check('THE OTHER PRESETS unchanged (Minimal still draws its own sun path, no Sun arc)', await page.evaluate(() => !!document.querySelector('#w .iq-sun__arc') && !document.querySelector('#w .iqsa')));
// the Studio element (the same component)
const el = await page.evaluate(() => {
  const d = window.IniqComponents.get('sun-arc'); if (!d) return null;
  const e = d.compose.render({ glow: true, showElevation: true }, { state: 'above_horizon', elevation: 21, rising: '06:00', setting: '20:00', noon: '13:00' }, { box: { w: 240, h: 130 } });
  document.body.append(e); e.style.cssText = 'position:fixed;left:0;top:0;width:240px;height:130px'; d.compose.update(e, { glow: true, showElevation: true }, { state: 'above_horizon', elevation: 21, rising: '06:00', setting: '20:00', noon: '13:00' }, { box: { w: 240, h: 130 } });
  const a = e.querySelector('.iqsa'), out = { ok: !!a, phase: a && a.dataset.phase, el: e.querySelector('.iqsa__elev').textContent, palette: window.IniqComponents.composable().some((x) => x.id === 'sun-arc'), editor: !!window.IniqComponents.editor('sun-arc') };
  d.compose.update(e, { glow: true }, { state: 'below_horizon', rising: '06:00', setting: '20:00' }, { box: { w: 240, h: 130 } }); out.night = e.querySelector('.iqsa').dataset.phase;
  e.remove(); return out;
});
check('STUDIO ELEMENT "Sun arc": the same IniqSunArc in a box (palette + Properties); the preview sun is up (21°), then below the horizon', el && el.ok && el.phase === 'day' && el.el === '21°' && el.palette && el.editor && ['before', 'after'].includes(el.night), JSON.stringify(el));
check('no page errors', page.errors.length === 0, page.errors.join(' | '));
await T.close();
