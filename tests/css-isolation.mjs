/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CSS / DOM ISOLATION (the Energy Flow `.ef` regression): no class a widget stylesheet defines may also be a class the editor / app
// framework stylesheets or scripts own, the new widgets use only iq-* names, container names are unique, and CSS custom properties
// declared by a widget are namespaced to it. Static: runs without a browser.
import fs from 'node:fs';
import path from 'node:path';
const fail = []; let ok = 0;
const check = (label, pass, extra = '') => { console.log(`${pass ? 'ok   ' : 'FAIL '}${label}${pass ? '' : ' ' + extra}`); if (!pass) process.exitCode = 1; };
const read = (p) => fs.readFileSync(p, 'utf8');
const classesIn = (css) => new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
// the framework: editor + app shell + shared components (everything that is not a widget package)
const FRAME = ['components/editor', 'components/app', 'components/app-header', 'components/container', 'components/tabs', 'components/grid', 'components/floating', 'components/popup', 'components/notify', 'components/widget-kit', 'components/widget-visuals', 'components/ha', 'components/fit', 'assets/css'];
const frameClasses = new Set();
FRAME.forEach((d) => fs.readdirSync(d).filter((f) => f.endsWith('.css')).forEach((f) => classesIn(read(path.join(d, f))).forEach((c) => frameClasses.add(c))));
// classes the editor builds in JS (form / configure / editor): class: 'x y'
['components/editor/form.js', 'components/editor/configure.js', 'components/editor/editor.js'].forEach((f) => [...read(f).matchAll(/class: [`'"]([^`'"$]+)/g)].forEach((m) => m[1].split(/\s+/).forEach((c) => c && frameClasses.add(c))));
const SHARED_INFRA = (c) => c.startsWith('iqv-') || c.startsWith('iq-hist') || c === 'iqha' || c === 'iqdemo' || c.startsWith('iqha__') || c.startsWith('iqdemo__');
const widgets = fs.readdirSync('widgets/default').filter((w) => fs.existsSync(`widgets/default/${w}/${w}.css`));
const NEW = ['robot', 'entitylist', 'datetime', 'timer', 'sunmoon', 'energy'];
const RECENT = NEW;
const owned = {};                        // class → widget that defines it
for (const w of widgets) {
  const mine = classesIn(read(`widgets/default/${w}/${w}.css`));
  // the framework's own prefixes (the editor form is `.ef`, the editor `.ed-`, the configuration dialog `.ecfg-`): no widget may ever define one
  const own = [...mine].filter((c) => /^(ef|ed|ecfg|mpop|mg|mf)([-_]|$)/.test(c));
  check(`${w}.css: defines no editor / app framework class (ef, ed-, ecfg-, mg-…)`, own.length === 0, own.join(', '));
  // the recent widgets are held to the stricter rule: not even an incidental shared name (is-*, generic state classes)
  const clash = [...mine].filter((c) => frameClasses.has(c) && !SHARED_INFRA(c));
  if (RECENT.includes(w)) check(`${w}.css: no class shared with the editor / app framework`, clash.length === 0, clash.join(', '));
  mine.forEach((c) => { (owned[c] ||= new Set()).add(w); });
}
// the same class defined by two different widgets would let one restyle the other
const shared = Object.entries(owned).filter(([c, s]) => s.size > 1 && [...s].some((w) => NEW.includes(w)) && !c.startsWith('iqv-') && c !== 'iqdemo').map(([c, s]) => `${c} (${[...s].join('+')})`);
check('no class of a recent widget is also defined by another widget stylesheet', shared.length === 0, shared.slice(0, 8).join(', '));
for (const w of NEW) {
  const css = read(`widgets/default/${w}/${w}.css`);
  const cls = [...classesIn(css)].filter((c) => !SHARED_INFRA(c));
  check(`${w}.css: only iq-* classes (besides the shared iqv- visuals)`, cls.every((c) => c.startsWith('iq-')), cls.filter((c) => !c.startsWith('iq-')).join(', '));
  const vars = [...css.matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/g)].map((m) => m[2]);
  check(`${w}.css: custom properties namespaced (--iq-*; --iqv-* belongs to the shared visuals)`, vars.every((v) => /^--iqv?-/.test(v)), vars.filter((v) => !/^--iqv?-/.test(v)).join(', '));
  const cont = [...css.matchAll(/(?:container(?:-name)?:\s*|@container\s+)([a-z][a-z0-9-]*)/g)].map((m) => m[1]).filter((n) => !['size', 'inline-size', 'normal', 'style', 'not', 'and', 'or'].includes(n) && !/^\(/.test(n));
  check(`${w}.css: container names are iq-*`, cont.every((n) => n.startsWith('iq-')), [...new Set(cont.filter((n) => !n.startsWith('iq-')))].join(', '));
  const bare = css.split('\n').filter((l) => /^(button|select|input|svg|ul|li|h[1-6]|p|span|div|a|img|label|:root|html|body|\*)[\s,{:[>]/.test(l));
  check(`${w}.css: no unscoped element selectors`, bare.length === 0, bare.slice(0, 3).join(' | '));
}
// container names are unique across widgets (a name shared by two widgets would let one's query match the other)
const names = {};
for (const w of widgets) [...read(`widgets/default/${w}/${w}.css`).matchAll(/container:\s*([a-z][a-z0-9-]*)\s*\//g)].forEach((m) => { (names[m[1]] ||= new Set()).add(w); });
const dupN = Object.entries(names).filter(([, s]) => s.size > 1).map(([n, s]) => `${n} (${[...s].join('+')})`);
check('container names are unique per widget', dupN.length === 0, dupN.join(', '));
// the historical root class of Energy Flow must never come back as a generic root
check('no stylesheet defines the generic `.ef` root outside the editor form', !widgets.some((w) => /(^|[\s,}])\.ef([\s,{.:[>]|$)/m.test(read(`widgets/default/${w}/${w}.css`))));
