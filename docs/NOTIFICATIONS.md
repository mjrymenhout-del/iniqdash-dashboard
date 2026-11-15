# Notifications — positioning and the visual designer

The notification engine is unchanged: **event → rule → template → rendered notification** (`components/notify/notify.js`:
`createEvents`, `createRules`, `fill` for `{placeholders}`, `createCenter`). This document covers how a notification is **placed**
and how a template's **look** is designed.

## Positioning — the coordinate system

Four surfaces exist in IniqDash: the **browser viewport** (what the user sees), the **dashboard preview** (the editor's canvas frame,
fitted into the page under the editor's toolbars), a **simulated device screen** (the Responsive Preview set to a device or a size —
a logical w × h, scaled to fit) and **full screen** (test mode: the chosen device size scaled to the display, or this window).

Notifications have their own screen layer (`noteScreen`, editor.js — `MaisonApp.createScreen`) with an **explicit target**
(`editor.notificationTarget()`):

| The dashboard is shown … | Notifications are placed on | Scale |
| --- | --- | --- |
| fitted to the editor (Desktop / Tablet / Mobile buttons), "Current browser window", view mode | the **visible browser window** | 1 : 1 |
| on a simulated device (Responsive Preview: a device or a W × H) | that **device's screen** (its part inside the window) | the preview's |
| full screen — "Selected preview size" | the device's screen, scaled to the display | the preview's |
| full screen — "Use this browser window" | the window | 1 : 1 |

"Top right" therefore means the top right of what the user sees — never of the editor's canvas. Popups keep their own layer (the
dashboard's screen); only notifications use this one.

- **Root causes of the reported placement.** (1) Notifications shared the popup layer, which is the dashboard **preview frame**: in
  the normal editor view that frame sits under the editor's toolbars and beside the inspector, so "Top right" was the frame's corner
  — at x = 1100, y = 248 in a 1440 × 900 window, i.e. in the middle of the page, under/over the template dialog. (2) While a dialog
  was open, Test drew the notification inside the dialog's top layer at that frame position — over the dialog's own fields. (3) The
  layer also covered parts of a simulated screen outside the window, so edge notifications could be cut off (fixed earlier: the
  visible part, `--scr-vis-*`).
- **Positions:** top left · top centre · top right · centre · bottom left · bottom centre · bottom right. Edge positions stack (newest
  nearest the edge, 10 px apart, at most 4, never more than fit); the centre queues (one at a time). Narrow screens (< 640 px): one
  full-width stack per edge.
- **Always visible:** at most the visible screen minus the edge distance, both ways; longer content scrolls inside. Scrolling the
  dashboard never moves a notification.

## Test and Fire

- **Test** (a template's row, or *Test on screen* in its editor) shows **that template directly** — no event, no rule — with the
  editor's current (unsaved) values.
- **Fire** (a demo event) follows the real path **event → rule → template**, exactly as a Home Assistant event will. The
  Notifications dialog always says what happened, in the dialog itself: the templates shown, or why none was — *no rule uses this
  event* (add a rule, or use Test) or *its rule is turned off*.
- **Seeing the result:** whenever Test or Fire shows a notification from an editor dialog, the dialogs **step aside** (see-through, no
  dimming, still open with their unsaved values) so the notification is seen where it really appears; they return when it is gone,
  on **Back to the editor**, or on Escape.

## The editor — the widget configuration editor

The template dialog is the widget configuration dialog (`MaisonConfigure.modal` + `MaisonForm`): the same split layout, the same
collapsible sections (the first open), the same **Live preview** panel (`.ecfg-pv`: its header and view choice, the stage, a note)
on the right — on top on a narrow screen — and Cancel / Apply. Shared controls: the MDI **icon picker** (an older template's
built-in icon name keeps drawing; it shows as its MDI equivalent), **colour swatches** with a custom colour, the **image picker**
with uploads, the **Slider + Number** ranges, and for Custom corners the widget **corner control** (each corner normal / concave
with its own radius — rendered by `IniqWidgetKit.corners`, as for widgets).

## The designer (template dialog)

`config.design` — optional; absent = the **Standard** look, exactly as before (older templates need no migration). Every value is
allow-listed in `MaisonNotify.cleanDesign` (also the registry's `normalize`) and reaches the stylesheet only as `--mnote-*` custom
properties (`lookOf`) — colours are design-token names or `#rrggbb`, sizes clamped numbers.

| Section | Properties |
| --- | --- |
| Position | position, distance from the screen edges (`margin`) |
| Appearance | preset, tone, style (Card / Compact / Solid colour) |
| Size | width, height (each Auto / a value), maximum width (% of the screen), padding, content alignment |
| Background & border | background colour, background opacity (the **background only** — `color-mix`, never `opacity` on the notification), background blur, border colour, border thickness, shadow (Standard / None / Soft / Strong) |
| Corners | Standard · Square · Slightly rounded · Rounded · Fully rounded · Custom (the shared per-corner control) |
| Text & icon | title colour / size / weight, message colour / size / weight, text alignment, icon (shown / size / colour) |
| Image | the shared Image picker (built-ins, this type's uploads, Upload — `api/asset.php?id=…`), layout None · Thumbnail (Standard) · Background · Hero · Left · Right, fit, position, image opacity, hero height, side width, overlay colour and opacity (Background) |

- **Image layouts.** Background: the picture covers the notification behind its content (with an overlay for readability) and never
  sets its height. Hero: across the top (its height; when the notification is constrained it gives way first, the text keeps 48 px).
  Left / Right: beside the text, at most 38 % of the notification so the text keeps its room on a small screen. The border and tone
  bar are drawn over the picture.
- **Presets** (`NOTE_PRESETS`, registry): Standard, Minimal, Glass, Banner, Image (side image), Hero. Choosing one *replaces* the design
  with its values (Image / Hero use the chosen picture, else a built-in one); every property can then be changed. Saving your own
  presets is not implemented (deferred).
- **Security.** Text is set with `textContent`; images are allow-listed (shared / package assets, uploaded user assets served by the
  protected endpoint; older templates' `https:` / inline images still display — the designer offers built-ins and uploads only).
  Nothing in a design can inject CSS.

## Live preview

The editor's Live preview draws the screen notifications appear on now (the window, or the simulated device — the note says which)
with the same renderer (`MaisonNotify.build`) and the same stack layout (`createCenter`) from the **unsaved** values, redrawn on
every change. *Actual size*: the notification at 100 % (the view follows it); *Whole screen*: where it sits. Cancel discards;
Apply + Save persist.

Verified in the real UI (tests/notify-acceptance.mjs and tests/notify-designer.mjs, fake Home Assistant — not a real one): all seven positions at 1920 × 1080,
1024 × 768 and 390 × 844, the Responsive Preview at 50 % and Fit, a scrolled page, full-screen test mode (preview and window),
window resizing, dashboard scrolling, stacking and overflow, extreme sizes, every designer property (preview pixels and computed
style), presets and overrides, image layouts, upload, Cancel, Save + reload, an older template, and Tests A–G.
