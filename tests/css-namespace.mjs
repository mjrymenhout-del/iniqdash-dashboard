/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CSS NAMESPACES — every widget / component package owns its class names (docs/COMPONENT-FOUNDATION.md, "Namespaces"). A package OWNS a
// class block (the class without its __element / --modifier) when its JavaScript CREATES elements with it. The Widget Studio POC once
// created `.sw` — the Sensor widget's block — and the Studio's card background leaked onto every Sensor; this guards against it:
//   1. no class block a WIDGET creates is created by another package (the application's own components — the editor reusing the popup's
//      or a container's chrome, an editor button in the Studio — share theirs deliberately; state classes is-… / has-… are not namespaces);
//   2. a WIDGET's stylesheet styles only its own blocks or a SHARED component's (components/…) — never another widget's;
//   3. the detector itself catches the original `.sw` collision (a synthetic package).
// Static analysis of the source (no browser).
import fs from 'node:fs';
import path from 'node:path';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
/** every package: widgets/default/<id>, widgets/custom/<id>, components/<id> */
const packages = [];
for (const base of ['widgets/default', 'widgets/custom', 'components']) {
  const dir = path.join(ROOT, base);
  if (!fs.existsSync(dir)) continue;
  fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).forEach((e) => packages.push({ id: `${base}/${e.name}`, dir: path.join(dir, e.name), widget: base.startsWith('widgets') }));
}
const filesOf = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
const block = (c) => c.replace(/__.*$/, '').replace(/--.*$/, '');
/** the class blocks a script CREATES: className = '…', class: '…', classList.add('…'), class="…" in markup; the root of each class list */
function created(js) {
  const out = new Set(), add = (list) => list.split(/\s+/).filter((c) => /^[a-z][a-z0-9_-]*$/i.test(c) && !c.includes('${')).forEach((c) => out.add(block(c)));
  for (const m of js.matchAll(/className\s*=\s*['"`]([^'"`]+)['"`]/g)) add(m[1]);
  for (const m of js.matchAll(/class:\s*['"`]([^'"`]+)['"`]/g)) add(m[1]);
  for (const m of js.matchAll(/classList\.add\(\s*['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of js.matchAll(/class="([^"$]+)"/g)) add(m[1]);
  return out;
}
/** the class blocks a stylesheet LEADS a selector with */
function led(css) {
  const t = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{([^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const out = new Set();
  for (const m of t.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim(); if (!sel || sel.startsWith('@')) continue;
    sel.split(',').forEach((p) => { const x = p.trim().match(/^\.([A-Za-z][\w-]*)/); if (x) out.add(block(x[1])); });
  }
  return out;
}
function analyse(pkgs) {
  const owners = new Map();
  pkgs.forEach((p) => p.created.forEach((b) => { if (/^(is|has)-/.test(b)) return; if (!owners.has(b)) owners.set(b, new Set()); owners.get(b).add(p.id); }));
  const shared = [...owners.entries()].filter(([, s]) => s.size > 1 && [...s].some((id) => id.startsWith('widgets/'))).map(([b, s]) => `${b}: ${[...s].join(' + ')}`);
  const leaks = [];
  pkgs.filter((p) => p.widget).forEach((p) => p.led.forEach((b) => {
    const o = owners.get(b); if (!o || o.has(p.id)) return;                         // its own, or a block nobody creates
    if ([...o].every((id) => id.startsWith('components/'))) return;                // a SHARED component's block (styled in its context)
    leaks.push(`${p.id} styles .${b} (owned by ${[...o].join(', ')})`);
  }));
  return { owners, shared, leaks };
}
const pkgs = packages.map((p) => ({ ...p, created: new Set(filesOf(p.dir, '.js').flatMap((f) => [...created(fs.readFileSync(f, 'utf8'))])), led: new Set(filesOf(p.dir, '.css').flatMap((f) => [...led(fs.readFileSync(f, 'utf8'))])) }));
const A = analyse(pkgs);
check(`ownership read from ${pkgs.length} packages (${A.owners.size} class blocks)`, pkgs.length > 30 && A.owners.size > 100, `${pkgs.length} / ${A.owners.size}`);
check('no widget\'s class block is created by another package (each widget owns its namespace)', A.shared.length === 0, A.shared.join(' | '));
check('no widget stylesheet styles another widget\'s classes (only its own, or a shared component\'s)', A.leaks.length === 0, A.leaks.join(' | '));
check('the Studio widget owns .stw, the Studio host .wst, the Sensor widget .sw — three different packages', ['stw', 'wst', 'sw'].every((b) => A.owners.get(b) && A.owners.get(b).size === 1)
  && A.owners.get('sw').has('widgets/default/sensor') && A.owners.get('stw').has('widgets/default/studio') && A.owners.get('wst').has('components/studio'), JSON.stringify(['stw', 'wst', 'sw'].map((b) => [b, [...(A.owners.get(b) || [])]])));
// the shared DIAL (.iqdl) and SLIDER (.iqsl): each owned by its own component package alone; Climate and Light only style them in their
// context (never create them), and no stylesheet defines a generic .dial / .slider / .ring / .track / .knob / .thumb block
check('the Dial owns .iqdl and the Slider .iqsl — each created by its own component package only (Climate and Light consume them)',
  A.owners.get('iqdl') && A.owners.get('iqdl').size === 1 && A.owners.get('iqdl').has('components/dial') && A.owners.get('iqsl') && A.owners.get('iqsl').size === 1 && A.owners.get('iqsl').has('components/slider')
    && !A.owners.get('iqdl').has('widgets/default/climate') && !A.owners.get('cw__dial'), JSON.stringify(['iqdl', 'iqsl'].map((b) => [b, [...(A.owners.get(b) || [])]])));
const GENERIC = ['dial', 'slider', 'ring', 'track', 'knob', 'thumb'];
const generic = pkgs.flatMap((p) => GENERIC.filter((g) => p.led.has(g) || p.created.has(g)).map((g) => `${p.id}: .${g}`));
check('no package creates or styles a generic .dial / .slider / .ring / .track / .knob / .thumb class', generic.length === 0, generic.join(' | '));
// the detector catches the original collision: a package that creates `.sw` again, and styles it
const bad = [...pkgs, { id: 'widgets/default/demo-collision', widget: true, created: new Set(['sw']), led: new Set(['sw']) }];
const X = analyse(bad);
check('…and it catches the original collision: a new package creating .sw (the Sensor\'s) is reported', X.shared.some((x) => x.startsWith('sw:') && x.includes('demo-collision')), X.shared.join(' | '));
const Y = analyse([...pkgs, { id: 'widgets/default/demo-leak', widget: true, created: new Set(['dl']), led: new Set(['dl', 'sw']) }]);
check('…as is a widget stylesheet reaching into another widget (.sw from a new package)', Y.leaks.some((x) => x.includes('demo-leak') && x.includes('.sw')), Y.leaks.join(' | '));
