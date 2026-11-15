/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Install / remove a widget package folder in widgets/custom/ for a test (the drop-in lifecycle, exactly as an owner does it: copy ONLY the folder).
import fs from 'node:fs';
import path from 'node:path';
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export const customDir = (name) => path.join(ROOT, 'widgets/custom', name);
export function install(src, name) { fs.rmSync(customDir(name), { recursive: true, force: true }); fs.cpSync(src, customDir(name), { recursive: true }); }
export function remove(name) { fs.rmSync(customDir(name), { recursive: true, force: true }); }
