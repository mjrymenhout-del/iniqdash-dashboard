# Changelog

All notable changes to INIQDASH. The version of a copy is in the `VERSION` file. Versions follow [Semantic Versioning](https://semver.org/);
during the beta, minor versions may change dashboards' saved format (with an automatic migration).

## 0.1.0-beta.1 — first public beta

The first public release of INIQDASH, a self-hosted, customizable dashboard for Home Assistant.

### Features
- **Visual editor** — pages, a responsive grid with separate desktop, tablet and phone layouts, containers and tabbed containers,
  drag and resize, undo / redo, copy / paste, multi-select with align and distribute, a preview at any screen size.
- **More than 40 standard widgets** with variants — lights, climate, sensors, energy flow, weather, alarm, locks, covers, media, cameras,
  calendars, who's home, activity, charts, gauges, room cards and more. Controls follow what Home Assistant reports each device supports.
- **Dashboard generator** — builds Home, Lights, Climate, Rooms, Energy and Security pages from Home Assistant's areas, devices and
  entities; leaves out diagnostic, configuration, hidden and duplicate entities (using Home Assistant's registries when available);
  compact room popups with only the tabs a room needs; a house-centred energy flow.
- **Widget Studio** — compose your own widgets from building blocks, bind them to entities, save them in collections.
- **Appearance and Theme Studio**, **popups**, **notifications** with a notification centre, a navigation dock and a **radial menu**.
- **Demo home** — a new installation can start with a fully simulated home (no Home Assistant needed).
- **Installation wizard** — account, Home Assistant connection, first dashboard, all in the browser; the private data folder is created
  outside the website automatically, including on shared hosting with restricted PHP folders.

### Requirements
PHP 8.1+ (curl, json, session, hash, pcre, fileinfo, mbstring), Apache with `mod_rewrite` and `.htaccess` (or Nginx with the example
configuration), HTTPS. Home Assistant reachable from the web server, with a long-lived access token.

### Security
The Home Assistant token and the password hash are kept in a private folder outside the website and never reach the browser; Argon2id
password hashes, CSRF protection, rate-limited sign-in, a Content-Security-Policy. No external security review yet — see
[docs/security.md](docs/security.md).

### Known limitations
- Tested against a simulated Home Assistant and synthetic installations (up to 18 areas / 330 entities); real installations vary —
  please report what the generator gets wrong.
- Media cards keep their size: they do not expand automatically when playback starts.
- Very large lighting installations make a long Lights page on phones (one light a row).
- The daily weather card keeps its height when Home Assistant provides no forecast.
- An energy flow with only one or two sources leaves empty space around the house.
- There is no single compact / standard / expanded setting across all widgets (each widget has its own variants).
- Custom widget packages (code) are not sandboxed — install only packages you trust.
- One administrator account; no multi-user permissions. There is no official logo yet.

### Upgrade notes
First public release. Installations made from development versions keep their data: replace the application folder, keep the private
folder and `server/local.php` ([docs/updating.md](docs/updating.md)).
