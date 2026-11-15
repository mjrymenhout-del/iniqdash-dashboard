/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The sample images shipped with IniqDash are ORIGINAL drawings: the SVG sources in this folder, rendered by Chromium to the file names and
// sizes the widgets use (PNG with transparency, JPEG for photos-like artwork). Re-run after changing a source:  node tools/artwork/render.mjs
// Chromium writes an ICC colour profile into JPEGs; the public snapshot refuses image metadata, so re-save them without it, e.g.
//   python3 -c "from PIL import Image; [Image.open(f).convert('RGB').save(f, 'JPEG', quality=88, optimize=True) for f in ['assets/img/media/artwork-dusk.jpg', 'assets/img/media/artwork-tide.jpg', 'widgets/default/person/assets/avatar-demo.jpg']]"
import fs from 'node:fs';
import path from 'node:path';
import { playwright } from '../../tests/lib/harness.mjs';
const { chromium } = playwright();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = {
  'artwork-dusk': 'assets/img/media/artwork-dusk.jpg', 'artwork-tide': 'assets/img/media/artwork-tide.jpg',
  'washing-machine': 'widgets/default/appliance/assets/washing-machine.png', 'pendant-dome': 'widgets/default/light/assets/pendant-dome.png',
  'avatar-demo': 'widgets/default/person/assets/avatar-demo.jpg', 'smart-plug-off': 'widgets/default/switch/assets/smart-plug-off.png',
  'smart-plug-on': 'widgets/default/switch/assets/smart-plug-on.png',
};
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, dest] of Object.entries(OUT)) {
  const svg = fs.readFileSync(path.join(ROOT, 'tools/artwork', `${name}.svg`), 'utf8');
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  await page.setViewportSize({ width: Number(w), height: Number(h) });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const jpg = dest.endsWith('.jpg');
  await page.screenshot({ path: path.join(ROOT, dest), type: jpg ? 'jpeg' : 'png', quality: jpg ? 88 : undefined, omitBackground: !jpg, clip: { x: 0, y: 0, width: Number(w), height: Number(h) } });
  console.log(dest);
}
await browser.close();
