/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Dashboard settings through the real editor (local mode): title, subtitle, background, custom grid; validation; undo; export → import
// round trip; a rejected import changes nothing.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.evaluate(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
const model = () => page.evaluate(() => window.editor.getModel());
const settle = (ms = 250) => page.waitForTimeout(ms);
const openS = async () => { await page.click('button[aria-label="Dashboard settings"]'); await page.waitForSelector('dialog[open] [data-k=page-name]'); };
const cur = async () => { const m = await model(); const id = await page.evaluate(() => window.editor.getPage().id); return m.pages.find((p) => p.id === id); };

await openS();
await page.fill('[data-k=page-name]', 'Living'); await page.fill('dialog[open] input[placeholder=Optional]', 'Ground floor');
await page.click('[data-k=settings-tab-grid]');   // the Grid & layout section
await page.check('[data-k=grid-custom]');
await page.fill('[data-k=grid-desktop-cols]', '16'); await page.fill('[data-k=grid-desktop-row]', '30'); await page.fill('[data-k=grid-desktop-gap]', '12');
await page.click('[data-k=apply-settings]'); await settle();
let m = await model(), p = await cur();
check('title and subtitle stored on the current page', p.name === 'Living' && p.subtitle === 'Ground floor');
check('custom grid stored for the whole dashboard', m.app.grid && m.app.grid.desktop.cols === 16 && m.app.grid.desktop.row === 30 && m.app.grid.desktop.gap === 12, JSON.stringify(m.app.grid));
check('the other breakpoints of a custom grid are complete', ['tablet', 'mobile'].every((k) => m.app.grid[k] && m.app.grid[k].cols > 0));

// invalid input is refused and nothing changes
await openS();
await page.fill('[data-k=page-name]', '<script>x</script>'); await page.click('[data-k=apply-settings]'); await settle();
check('markup in the title is refused (dialog stays, message shown)', !!(await page.$('dialog[open] .ef-err:not([hidden])')) && (await cur()).name === 'Living');
await page.fill('[data-k=page-name]', 'Living'); await page.click('[data-k=settings-tab-grid]'); await page.fill('[data-k=grid-desktop-cols]', '999'); await page.click('[data-k=apply-settings]'); await settle();
check('an out-of-range grid is refused', !!(await page.$('dialog[open] .ef-err:not([hidden])')) && (await model()).app.grid.desktop.cols === 16);
await page.click('dialog[open] button:has-text("Cancel")'); await settle();

// undo restores the previous settings in one step
await page.keyboard.press('Control+z'); await settle();
m = await model(); p = await cur();
check('undo reverts the settings change as one step', !m.app.grid && p.name !== 'Living', `${p.name} ${JSON.stringify(m.app.grid)}`);
await page.keyboard.press('Control+y'); await settle();
check('redo re-applies it', (await cur()).name === 'Living' && !!(await model()).app.grid);

// export → import keeps everything
const exported = await page.evaluate(() => JSON.stringify(window.editor.getModel()));
await page.keyboard.press('Control+z'); await settle();
await page.click('[data-k=more]'); await page.click('[data-k=import]'); await page.waitForSelector('dialog[open] textarea');
await page.fill('dialog[open] textarea', exported); await page.click('dialog[open] .ed-btn--primary:has-text("Import")'); await settle(500);
m = await model(); p = await cur();
check('import restores title, subtitle and grid', p.name === 'Living' && p.subtitle === 'Ground floor' && m.app.grid && m.app.grid.desktop.cols === 16);
// a malformed import changes nothing
const before = JSON.stringify(await model());
for (const bad of ['{"version":3,"pages":"x"}', 'not json', '{"version":3,"app":{},"pages":[{"id":"a","name":"<img onerror=x>","items":[]}]}']) {
  await page.click('[data-k=more]').catch(() => {}); await page.click('[data-k=import]'); await page.waitForSelector('dialog[open] textarea');
  await page.fill('dialog[open] textarea', bad); await page.click('dialog[open] .ed-btn--primary:has-text("Import")'); await settle();
  const shown = !!(await page.$('dialog[open] .ed-errors li'));
  await page.keyboard.press('Escape'); await settle(150);
  check(`malformed import refused with a message (${bad.slice(0, 22)})`, shown && JSON.stringify(await model()) === before);
}
// settings do not leak into a freshly loaded different dashboard: reload shows the saved/default, not the unsaved edits
await page.reload(); await page.waitForTimeout(1500);
check('unsaved settings are not applied after a reload (explicit Save only)', !(await model()).app.grid);
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
