# User guide

IniqDash shows your Home Assistant home as dashboards you design in the browser. Home Assistant stays the brain: IniqDash shows what it
reports and sends the actions you allow. (Installation: [STANDALONE-INSTALL.md](STANDALONE-INSTALL.md) · Home Assistant App: planned, see
[HA-APP-PACKAGING.md](HA-APP-PACKAGING.md).)

## Try it first: the INIQDASH demo (no Home Assistant needed)
A new installation opens the **INIQDASH demo**: a six-page dashboard (Home, Lights, Climate, Rooms, Energy, Security) of a **simulated home**.
Lights switch and dim, thermostats change their target, scenes set their lights, the energy figures add up, the alarm and the locks respond
and raise notifications. Everything happens inside the simulation, never in a real Home Assistant; the *Simulated home* badge says so and
leads to connecting your own. Each signed-in session has its own simulated home; *Reset demo* (Security page) starts it over. It is an
ordinary dashboard: edit it, copy its pages, export it. On an existing installation add it from **Edit → More → Dashboards → Add the
INIQDASH demo**. Details: [INIQDASH-DEMO.md](INIQDASH-DEMO.md).

## 1 · Connect Home Assistant
1. In Home Assistant: your profile → Security → **Long-lived access tokens** → Create token. Copy it once.
2. In IniqDash: Edit dashboard → **More → Home Assistant connection…** → the address (e.g. `http://homeassistant.local:8123` or your HTTPS
   address) and the token → **Test connection** → Save. (Or on the server: `php server/setup.php`.) They are stored only in the server's
   private folder — never in the browser or a dashboard.
3. Without a connection every widget shows clearly labelled demo data.

## 2 · Viewing (the normal mode)
Signing in opens your **default dashboard** directly. Switch pages with the **Navigation Dock** (its position per screen size is a setting).
Widgets show Home Assistant's values; a control appears only when the entity supports it. Nothing pretends: an unavailable entity says so.

## 3 · Editing
- **Open the editor:** rest the pointer in the **top-right corner** for 2 seconds (or press and hold it for 2 seconds on a touch screen) →
  **Edit dashboard**. With the keyboard: Tab (it is the first control) or **Shift + E**. Dashboard Settings → Editing can make it always visible.
- **In the editor:** Add widgets, drag to move, eight handles to resize, arrow keys move / Shift + arrows resize,
  Ctrl + Z / Ctrl + Shift + Z undo / redo, copy / paste, Desktop / Tablet / Mobile previews and exact device sizes.
- **Configure a widget:** select it → Configure. The live preview is the real widget; in a list (controls, information, nodes…) each item's
  editor shows *Whole widget | This element*. Cancel changes nothing.
- **The design grid while editing:** every column is a faint band and every row starts with a hairline (what you see is where things
  snap); a numbered **column ruler** runs above the page, a dashed outline marks the **page edge**, and an orange line marks where **the
  first screen ends** (and screen 2, 3… further down) for the screen size you chose in the preview bar. A radial menu pinned to a screen
  corner is drawn in that corner. Toggle the aids with **Grid**.
- **Several items at once:** Shift / Ctrl / ⌘ + click adds items of the same grid to the selection (Ctrl + A: the whole grid). The
  inspector then aligns them (left, centre, right, top, middle, bottom), distributes them with equal gaps, gives them the same width /
  height as the first one selected, or removes them; the arrow keys move them together. Each action is one undo step; one that would make
  items overlap or leave the grid is refused. Esc deselects.
- **Screen layouts:** every screen size (Desktop, Tablet, Mobile) keeps its own layout; changing one never changes the others. The page
  panel's **Screen layout** says how the screen you are editing gets its layout, **Copy from Desktop / Tablet** copies another screen's
  layout (converted to this screen's columns and rows; on a phone half or full width, in the desktop's reading order) and **Make
  automatic** resets it. One undo step each.
- **Containers use the page grid:** a Container's or Tabbed Container's items have the same row height and gaps as the page (only the
  number of columns is the container's span), so a widget keeps its size when you drag it into or out of a container.
- **Done** saves and returns to viewing. If saving fails you stay in the editor; nothing is discarded silently. A save based on an older version
  than the one on the server (another device saved meanwhile) is refused — nothing is overwritten.

## 4 · Dashboard Settings (the gear in the editor)
- **General** — this page's name, subtitle, icon, whether it is shown first (start page), and the **default dashboard** opened after sign-in.
- **Appearance** — the page background and the Theme Studio.
- **Navigation** — show the page in the dock, the dock's edge per screen size (with a live picture), page order and visibility.
- **Grid & layout** — columns (up to 96 / 64 / 32), row height, gap and **page edge** (the room between the screen edge and the widgets) per
  screen size, with one-step presets for the columns (12 · 24 · 48 on a desktop) and the row height; each screen size shows what **one grid
  step** is in px. **Keep every widget's size and place on screen** (on by default) converts all layouts — containers included — when the
  grid changes; turn it off to keep the raw grid numbers instead. An item hidden at a screen size takes no room there.
- **Editing** — the Edit button (hidden until the corner is used, or always visible) and this device's editor aids (grid, snap, guides).

## 5 · Widgets
**Manage widgets:** Add → **Manage widgets** (or Widget Studio → Widget file → *Manage widgets…*). Create, rename and delete your
collections (*Delete the collection only* moves its widgets to IniqDash; *Delete the collection and its widgets* deletes them), tick
widgets to **move** them to another collection or **delete** several at once. Each collection shows how many widgets it has and each
widget whether it is **on a dashboard** — such a widget is never deleted (it is kept and you are told where it is used). The old example
collections *Maison demo*, *Studio Examples* and *Test Me* are removed once, automatically, after updating (a widget still on a dashboard
is kept in IniqDash); the manager shows what was cleaned up.

**Organise the gallery:** Add → **Organise**. Create your own categories (*New category*), move any widget into one with its **Move to**
choice, rename or delete a category (its widgets go back to their own), and mark widgets **Not wanted** — they leave the gallery
(*Show not wanted* lists them again; nothing is deleted). **Export list** downloads the arrangement with every widget and its category (and
copies it as text), for cleaning the widget set up later; **Reset** puts everything back. The arrangement is stored on the server for every
dashboard of this installation (without a server: in this browser).

Over 35 built-in widgets (light, climate, sensor, energy flow, sun & moon, weather, alarm, camera, chart, gauge, batteries, …). Each has a **type** (what it
shows), **presets** (how it looks) and adapts to its own size. Reference: [WIDGET-REFERENCE.md](WIDGET-REFERENCE.md). Custom widget
packages: [CUSTOM-WIDGETS.md](CUSTOM-WIDGETS.md) — read [CUSTOM-WIDGETS-SECURITY.md](CUSTOM-WIDGETS-SECURITY.md) first.

## Generate a dashboard from your home
**Dashboards → Generate from Home Assistant…** reads your Home Assistant **areas** and builds a **new** dashboard (nothing existing is
replaced): **Home** (who is home, the weather, a tile per room that opens its page) and **one page per room** you tick — its thermostats,
lights, switches and fans, covers, locks, media players, robots, cameras, the alarm and its sensors. An entity's room is the one Home
Assistant gives it (its own area, or its device's); devices without an area go only to an optional *Other* page. The result is an
ordinary dashboard: change anything. **Pages → Page for an area…** adds one room page to the dashboard you are editing. Without Home
Assistant you can try it with the simulated home.

## Wall tablets (address options)
Add these to a dashboard's address (any combination):
- `?page=<page id or name>` opens that page.
- `?fit=screen` shows the whole page without scrolling (scaled down when needed).
- `?noedit` hides every way into the editor on that screen.

For example: `…/?d=<dashboard>&page=kitchen&fit=screen&noedit`.

## 6 · Widget Studio (design your own widgets)
Open it from the editor: **Edit → Studio**. A widget is a canvas with elements on it (shapes, text, icons, images, gauges, controls…).
It is saved in your library, placed from **Add** like any widget, and every placed copy can use its own entities and settings.
- **New widget:** **Create blank widget**. With nothing selected, the panel on the right shows the **Widget** settings:
  - **Canvas size:** Width and Height in px, or drag the blue handle at the canvas's bottom-right corner. Shift keeps the proportions.
    **Fit to content** shrinks the canvas around the elements.
  - Name, collection, category and icon (how it is found in Add).
- **Elements:** click or drag one from the **Toolbox**.
  - Move it by dragging, resize with its corner handle (Shift: scale), or type exact **X, Y, Width, Height and Rotation** in **Layout**.
  - **Arrange** aligns, distributes, stacks and groups the selection. **Layers** orders, hides and locks.
- **Look:** a shape's **Fill type** can be solid, linear, radial or conic; add as many **colour stops** as you need. It also has
  its own corner radii, border style, several shadows and inner shadows.
  - Every element has an **Element style** section: opacity, **blend mode**, blur, a **glow / shadow list** that follows its outline,
    and **Clip contents** with rounded corners.
- **Outlines and clipping:** a shape can be a **card with a tab**, a **card with a notch** or a **speech bubble**. Set the tab's edge, position,
  width and depth in its fields. **Element style → Clip to another element** shows an element only inside another one's outline, such as a
  photo inside a card.
- **Rich text:** a text element can have **more text pieces** after it, each with its own colour, weight, size and superscript (m²).
- **Charts:** the **Chart** element draws bars, capsules, a line or an area. Every part has a field: bar colours, the highlighted bar
  and its tooltip, grid, labels. Give it a **Property** (an energy or temperature sensor) and it shows that sensor's Home Assistant
  statistics per day, hour or month, or its history.
- **Dials:** a dial can carry **more arcs** (a cold and a warm range), **scale labels**, **more markers** with icons, and a **dotted
  ring** whose dots change colour along the scale.
- **In a dashboard cell (resizing):** a Studio widget behaves like a standard widget — it **fills its cell**. A larger cell scales the
  design; a cell of another shape stretches the widget's full-size background, and the rest of the design moves as one block, centred
  across and kept at the top, so rows and groups never come apart. To make an element follow an edge instead (a menu at the right, a
  footer at the bottom), set its **pins** (Layout → Pin horizontally / vertically: left, right, both edges, centre, scale; *Automatic*
  is the behaviour above). Widget panel → **In a dashboard cell → Fit** keeps the whole design scaled with empty bands around it instead.
- **Navigation inside a design:** Layout → **On tap → Open page**: a sidebar, tabs or a bottom bar made in Studio switches pages.
  **Show → Only while … shows …** makes a segmented control work as tabs inside one widget (Week / Month / Year).
- **Controls:** buttons and toggles take their own colours (surface, text, track, knob, border, glow); segmented controls can be a
  column, tiles with the icon above the label, round icons with the label below, or a picker wheel; sliders take a gradient, a handle
  ring and a glow; dials can have a coloured (hue) track.
- **Data:** a weather entity's forecast (today and the next five days), the sun's next sunrise and sunset, a speaker's artist, live
  position and progress, a vacuum's state and battery, and "last changed" for every entity (shown as a time or "2hr 19min" ago).
  The text element also has a **Clock** mode.
- **Edit keys:** Undo and Redo in the header, or Ctrl/⌘ + Z and Ctrl/⌘ + Shift + Z.
  - Ctrl/⌘ + C, X, V copy, cut and paste elements, also into another widget.
  - Ctrl/⌘ + D duplicates; Delete removes; the arrow keys move by 1 px (Shift: one grid step).
- **Data:** give an element a **data property** (an entity's state or attribute). A placed copy chooses its own entities.
  - **Each copy sets** lets every copy change a property, such as its name or picture.
  - **Show** and **When…** make elements appear, or change their look, with Home Assistant values.
- **Widget file** (nothing selected):
  - **Duplicate widget** starts an unsaved copy.
  - **Export…** saves a file another IniqDash can **Import…**. Import always adds new widgets and never replaces one.
  - **Delete widget** asks for a second click. It is refused while a dashboard still uses the widget, and those dashboards are named.

- **Dashboard tools for designers:** Settings → General → **Use the simulated home** (design without Home Assistant), Navigation →
  **None** (the dashboard brings its own navigation), the inspector's **X / Y / W / H** fields (exact grid units) and **Hide on …
  screens** (e.g. a tablet sidebar on phones). Theme Studio → Page: **page frame, padding, margin and corner radius**.

## 7 · Troubleshooting
| Symptom | What to check |
| --- | --- |
| A widget says "Not found: sensor.…" | The entity id does not exist in your Home Assistant — choose another in Configure. |
| Everything shows demo data | Home Assistant is not connected: `php server/setup.php --status`, then the address / token. |
| "Home Assistant cannot be reached" | The address from the **server's** point of view (not your browser's); TLS: `verify_tls` / a CA file for self-signed certificates. |
| Charts: "no long-term statistics" | The entity has no `state_class` in Home Assistant, so Home Assistant keeps no statistics for it. |
| The page asks to sign in again | The session expired (idle 12 h, at most 7 days). |
| Plain HTTP is refused | By design. Use HTTPS, or on a trusted local network only set `'require_https' => false` in `server/local.php`. |
| The Edit button never appears | Rest the pointer exactly in the top-right corner for 2 s, use Tab / Shift + E, or set it to Always visible. |
| `server/check.php` reports a problem | Fix what it lists (PHP version, extensions, private-folder permissions). |
