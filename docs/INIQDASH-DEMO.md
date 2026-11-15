# The INIQDASH demo

The INIQDASH demo is the official demonstration dashboard. It shows a fictional, **simulated** home on six pages:

- Home
- Lights
- Climate
- Rooms
- Energy
- Security

It is built only from standard IniqDash widgets, popups, notification rules and the radial menu. It is an ordinary
dashboard: you can view it, edit it, save it, export it, import it and delete it like any other.

No Home Assistant is needed. **Every value is simulated and nothing the demo does reaches a real device**, whether it is a light,
a thermostat, an alarm or a lock.

Screenshots are in [`docs/iniqdash-demo/`](iniqdash-demo/), at desktop (1440 × 900), tablet (834 × 1112) and phone (390 × 844) size.

## What is in it

The theme is *INIQDASH Charcoal*: a charcoal page, dark rounded cards, a sky-blue accent, orange / yellow / pink / purple / green icon
colours and the Poppins font. Rooms, the house and the demo cameras use **photographs** (credits in `THIRD-PARTY-NOTICES.md`).

| Page | What it shows | What you can do |
|---|---|---|
| **Home** | <ul><li>Who is home (four fictional people, presence rings, "2 of 4 home").</li><li>**The household calendar** (Spotlight widget): one event at a time with a picture — waste collection, a birthday — "1 of 3", previous / next.</li><li>**The notification centre**, on the page.</li><li>Weather now and the coming days, sunrise and sunset.</li><li>Readings (indoor and outdoor temperature, humidity, water flow).</li><li>Now playing.</li><li>The living-room thermostat (a knob dial over a fireplace photo).</li><li>Four device tiles (light, heating, extractor fan, speaker).</li><li>Live activity (the latest changes in the home).</li><li>Two scenes.</li></ul> | <ul><li>Switch a device; set the temperature; run a scene.</li><li>Open the calendar, media and thermostat popups.</li><li>Read or dismiss a notification.</li></ul> |
| **Lights** | <ul><li>A photo card with the lights on now.</li><li>Four scenes and *All off*.</li><li>Every room with its lights (picture light cards).</li><li>Live activity.</li></ul> | Switch and dim; a light's details offer white and colour where supported. |
| **Climate** | <ul><li>The living-room thermostat (knob dial).</li><li>The bedroom and office thermostats.</li><li>Readings and every temperature / humidity sensor.</li></ul> | Set temperatures and modes. |
| **Rooms** | <ul><li>A photo card for the whole house and for every room: temperature, humidity, lights on ("2/3").</li></ul> | Tap a room: its popup (below). |
| **Energy** | <ul><li>**The house energy flow**: a picture of the house with **Solar**, **Grid**, **CO₂**, **Gas** and **Water** around it, live.</li><li>**Consumption** tabs: *Today* (power, gas, water, totals), *Week* (electricity, gas, water per day), *Month* (electricity and CO₂ per day).</li><li>About the CO₂ estimate.</li></ul> | Switch the tabs. |
| **Security** | <ul><li>The alarm: Disarm, Arm home, Arm away.</li><li>Doors, motion and water status.</li><li>Two camera stills (garden and living room), labelled "Demo cameras — photo stills, not live video".</li><li>The activity log.</li><li>**Demo events**.</li></ul> | Arm / disarm; *Simulate motion*; *Open back door* (an armed alarm goes off); *Clear events*; *Reset demo*. |

### The room popup

Each room opens a popup made of standard parts: the popup's **picture header** (the room's photograph, its name, Back and Close), its
**information** over the picture (humidity, temperature, lights on) and a **Tabbed Container** with six tabs:

| Tab | Content |
|---|---|
| Active | what is on in the room now |
| Lights | every light of the room |
| Heating | the thermostat knob |
| Media | the room's speaker |
| Security | the alarm and the room's doors, windows and motion sensors |
| Sensors | every reading of the room |

A tab with nothing to show says so. On a desktop the popup is centred; on a phone it is a full-width sheet and the tab row scrolls. Tabs
work with the keyboard (arrows, Home / End) and by swiping.

### On every page

- **The radial menu** in the bottom-right corner, with **four actions**: Home, Lights, Scenes (a popup) and Notifications (a popup with the
  notification centre). Escape or a click outside closes it; mouse, touch and keyboard; it follows "reduce motion".
- **The "Simulated home" badge.**

### Notifications and occasional events

The notification centre starts with four example entries, each marked "demo". Then:

- **Your actions** raise notifications: the alarm armed / disarmed / triggered, the back door opening, garden motion, the front door unlocked.
- **Occasional events**: each visitor's demo raises at most **six** simulated events on a fixed schedule from the moment the demo was first
  seen (after about 2½, 7, 12, 18, 25 and 33 minutes — never closer than four minutes): a washing machine finishing, a solar or evening
  note, motion in the garden, a birthday, high energy use, an open window. Each is a toast and an inbox entry whose text starts with
  "Simulated".
- **No replay**: the events are the state of one simulated sensor (`sensor.demo_event`); a refresh shows nothing again.
- **Per visitor**: the schedule lives with that visitor's simulated home. **Reset demo** starts it again and resets the inbox.

### One simulated home

Every page reads the same simulated home, so a change made on one page shows on all of them.

The home is defined in `server/ha/SimHome.php` (`demoHome()`) and runs in `server/ha/SimHa.php`. It contains:

| Group | Entities |
|---|---|
| Lights | 15 lights in 7 rooms |
| Climate | 4 thermostats; a temperature and a humidity sensor per room; light level and power in some rooms |
| People | Mia, Noah, Léa and Theo (fictional): two at home, one at work, one away |
| Media | 2 speakers (one playing a fictional track) |
| Weather | Current weather and forecast |
| Security | An alarm (home / away), 3 locks, 5 door/window contacts, 3 motion sensors, 2 leak sensors |
| Energy | Solar, grid import / export, home; water and gas meters; a CO₂ estimate |
| Scenes | 6 scenes; each one sets its own lights |
| Demo events | 4 buttons, and the occasional events (`sensor.demo_event`) |

**The energy figures add up.** Power, today's totals, the 24-hour chart and the daily history all come from one model of the day,
which combines a daylight curve for the panels with a household profile:

| What | How it is calculated |
|---|---|
| Live power | home = solar + grid |
| Every day, today included | consumed = solar − exported + imported |
| Today's bar in the daily charts | equals today's cards |
| Self-sufficiency | 1 − imported ÷ consumed |
| Cost | imported × 0.181 € − exported × 0.050 € |
| Water, gas | flow now; today = the flow integrated since midnight; the daily history uses the same profile |
| CO₂ (estimate) | imported kWh × 0.18 kg + gas m³ × 2.0 kg; solar 0 — the same factors every day; **no savings are claimed** |

There is **no battery**.

Motion clears itself after 90 seconds. The simulated state is kept on the server, **one home per signed-in browser session**
(`<private>/var/sim/s<hash>.json`): it survives navigation and reloads, one visitor's changes never appear in another visitor's demo, and
*Reset demo* resets only your own. Files untouched for a week are removed.

## Isolation from Home Assistant

The dashboard is marked `app.simulated`. While it is open, every request carries the "simulated" flag and the server answers it from
the simulator:

- **No request reaches the configured Home Assistant.** This is the last check of `tests/iniqdash-demo.mjs`.
- **Live and simulated states are never mixed.** Switching between a live and a simulated dashboard clears every cache.
- **Your own dashboards stay live.** Adding the demo does not change them.

The demo's buttons, scenes, alarm and locks act only on the simulated entities (`*.demo_*`).

## Installing it

The demo is part of the application files (`assets/demo/iniqdash-demo.json`). Nothing extra needs to be downloaded or set up.

- **New installation.** The demo is added automatically and becomes the **default dashboard**: after the first sign-in, its Home page
  opens (`server/DemoInstall.php`). A new installation is one with no dashboard and no Widget Studio widget yet.
- **Existing installation.** Nothing is added or changed: your dashboards, your default dashboard and your settings stay as they are.
  The demo is available from **Edit → More → Dashboards → Add the INIQDASH demo (simulated home)**.
- **No dashboard at all** (for example after deleting every dashboard): the first screen offers **Open the INIQDASH demo**.

The decision for a new installation is taken once and recorded in `<private>/demo.json`:

- A demo you delete does not come back.
- Adding it from Dashboards always creates a **new** dashboard. Nothing is replaced, and a taken name becomes "INIQDASH demo 2".

**To reset it,** press **Reset demo** on the Security page. This returns your simulated devices and the notification inbox to their
initial state. For a fresh copy of the dashboard itself, delete it and add it again.

**To remove it,** use **Dashboards → Delete**, the same as for any dashboard.

### Updating an existing installation

1. Back up the private folder.
2. Upload the new files over the existing installation. The private folder is not part of the download and is left as it is.
3. Sign in, then **Edit → More → Dashboards → Add the INIQDASH demo** if you want it.

## Editing, exporting, importing

The demo uses only standard widgets, laid out on the standard grid:

| Layout | Columns |
|---|---|
| Desktop | 24 (10 px rows; containers share the rows) |
| Tablet | 16 |
| Mobile | 4, stacked in order |

Its popups are edited under **Popups** and its notification rules under **Notifications**. The theme, *INIQDASH Charcoal*, is part of the
dashboard.

Export and import work as for any dashboard. `tests/iniqdash-demo.mjs` checks that an exported demo, imported again, has the same
pages, popups and notification rules.

**To rebuild the shipped file** after changing the design script:

```bash
node tools/build-iniqdash-demo.mjs
```

The script writes `assets/demo/iniqdash-demo.json`.

## Components added or extended for it

All of these are standard and available in every dashboard (details: [APPEARANCE.md](APPEARANCE.md)):

| Component | Change |
|---|---|
| **Appearance** (every widget) | Background (theme, transparent, opacity, solid, linear / radial gradient with three stops, image with fit, position and overlay), border, shadow, glow, text tone, accent colour, presets. |
| Notification centre (`inbox`) | New **List** variant: the notification centre on the dashboard itself. |
| **Who's home** (`presence`) | **New widget**: people (person or device tracker), presence rings, "N of M home"; row or list. |
| Chart | Line thickness, smooth curve, area fill, bar width and corners, gradient colour, glow. |
| Notification rules | `ha.<domain>.<object>.<state>` events (used by the demo events). |
| **Activity log** (`activitylog`) | **New widget**: a timeline of the latest changes of chosen entities (icon, what happened, where, when), with an optional link. |
| **Spotlight** (`spotlight`) | **New widget**: calendar events one at a time, large, with a picture chosen by rules (waste, birthday…), "N of M", previous / next, a corner button. |
| **Device tile** (`devicetile`) | **New widget**: one device as a coloured tile — state, switch, name, "since". |
| **Readings** (`readings`) | **New widget**: several values in one card, each with a coloured bar. |
| **Room tile** (`roomtile`) | **New widget**: a photo card for a room — temperature, humidity, lights on, icon, chevron; opens a popup or a page. |
| Climate | New **knob** dial design (ticks, cool-to-warm gradient). |
| Action | New **scene** and **pill** looks and icon colours. |
| Energy flow | New **House** layout: a picture of the house in the middle, the sources on either side with elbow connectors. |

## Licences and assets

The demo's content is original and covered by the project's licence (MPL-2.0): the dashboard, theme, texts and the simulated home (fictional
rooms, devices and people, no personal data). The photographs in `assets/img/photos/` come from Wikimedia Commons under free licences
(CC BY 2.0 and others); each one, its author, licence and the changes made are listed in `THIRD-PARTY-NOTICES.md`. Icons: **Material Design Icons** (Apache-2.0).

## Tests

`tests/iniqdash-demo.mjs` drives the real widgets in a browser, against the real PHP server and a **fake** Home Assistant whose request
log proves the isolation. It checks:

1. The dashboard loads.
2. All six pages are reachable.
3. Every widget renders.
4. Values appear without Home Assistant.
5. A light toggles, and the count follows.
6. A device tile switches its device.
7. Climate + raises the target.
8. Scenes change their own lights.
9. The energy figures are coherent; the house flow shows its five domains (solar, grid, CO₂, gas, water) and the Today / Week / Month tabs show.
10. A room tile opens its room popup with its picture, readings and six tabs, each with content; Escape closes it.
11. The security demo works: arm → open the back door → the alarm is triggered → disarm → clear the events; the activity log records the door.
12. A notification toast appears, the alert reaches the notification centre on Home, and an entry can be dismissed and marked read. A due demo event notifies once, is not replayed after a refresh, and leaves other visitors alone.
13. The radial menu has exactly four actions, navigates, opens a popup and closes.
14. Layouts survive save and reload; export and import give the same dashboard.
15. Desktop, tablet and mobile: no sideways scrolling and no overlaps on any page.
16. Your own dashboard is unchanged.
17. "Studio Examples" is unchanged.
18. No request reaches Home Assistant.

## Limitations

- **The photographs are not of the simulated home.** They are free-licence stock pictures chosen to fit each room.
- **The camera previews are stills.** No live video is simulated.
- **The simulated home follows the server's clock** in its time zone: at night the solar figure is 0 W.
- **The weather is a fixed simulated forecast.**
- **One simulated home per browser session.** Signing in again starts a fresh one (and a fresh event schedule).
- **Colour depends on the light.** Only lights that support it offer colour or colour temperature.
- **Tested in Chromium only** (Firefox and Safari were not available in the test environment).

## Public-release checklist (the demo)

| | Item | State |
|---|---|---|
| ☑ | The demo ships with the application files (`assets/demo/iniqdash-demo.json`); it does not depend on a test environment | done |
| ☑ | New installation: the demo is the default dashboard; existing installation: unchanged, the demo in Dashboards → Add; never overwrites; not recreated after deletion | done, tested (`tests/demo-default.mjs`) |
| ☑ | Demo state isolated per visitor (session); a reset affects only that visitor | done, tested (`tests/simulated-home.mjs`) |
| ☑ | Resettable (*Reset demo*: the devices and the inbox) and removable (Delete) | done, tested |
| ☑ | Every value is labelled simulated (badge, "Demo" on demo actions, "demo" on example notifications); no real Home Assistant request | done, tested |
| ☑ | No credentials, tokens, personal names, e-mail addresses, IP addresses or private host names in the demo file (scanned) | done |
| ☑ | Original content (MPL-2.0); icons: Material Design Icons (Apache-2.0); photographs under free licences, credited in THIRD-PARTY-NOTICES.md; no new dependency | done |
| ☑ | Desktop, tablet and phone layouts checked on every page (screenshots in `docs/iniqdash-demo/`, automated overlap / width check) | done |
| ☑ | Existing dashboards and the "Studio Examples" collection are not touched | tested |
| ☐ | Tried by the owner on the live installation after uploading this version (local tests do not prove the hosted installation) | **owner** |
| ☐ | Merge into `main`, release notes, a release | **owner** |
