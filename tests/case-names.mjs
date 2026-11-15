/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// FILE NAMES THAT SURVIVE WINDOWS / macOS: no two files of the repository may differ only in upper / lower case. Unpacked on a
// case-insensitive disk one silently replaces the other, and the uploaded site is missing a file (server/Setup.php vs
// server/setup.php broke a first install that way).
import { execFileSync } from 'node:child_process';
import { check } from './lib/harness.mjs';
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const seen = new Map(), clash = [];
files.forEach((f) => { const k = f.toLowerCase(); if (seen.has(k)) clash.push(`${seen.get(k)} ↔ ${f}`); else seen.set(k, f); });
check('no two files differ only in upper / lower case (they would overwrite each other when unpacked on Windows or macOS)', clash.length === 0, clash.join(' · '));
console.log('finished');
