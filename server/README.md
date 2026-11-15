# IniqDash server — access protection + Home Assistant layer

This folder is never served by the web server (`server/.htaccess` and the root `.htaccess`).

## 1 · Maison's proven Home Assistant method (inspected read-only, /home untouched)

Files read: `src/HaClient.php`, `src/HaWebSocket.php` (head), `src/StateService.php` (head +
template), `src/Secrets.php`, `src/Paths.php`, `src/Auth.php`, `src/bootstrap.php`,
`src/CommandPolicy.php` (head), `api/command.php`, `api/state.php`, `login.php`, `logout.php`,
`.htaccess`, `config/local.example.php`, `assets/js/data/live-data.js` (polling part).

| Question | Maison |
|---|---|
| How it connects | PHP → Home Assistant **REST API** over cURL (`Authorization: Bearer <long-lived token>`). A short-lived PHP WebSocket client is used only for recorder statistics (history), not for live state. |
| Where the credentials are | `<private>/secrets.php` (mode 600) in a private folder **outside the web root**; its location is in `config/local.php` (not secret, not committed) or `HA_DASHBOARD_PRIVATE`. |
| Do credentials reach the browser? | **No.** The token only appears in server-side cURL headers; never logged, echoed or returned. |
| How states are read | One `POST /api/template` returning only the needed entities with explicitly picked attributes; fallback: parallel `GET /api/states/<id>` when the token may not render templates. |
| Live updates | The browser **polls** `api/state.php` (short interval, slower when hidden, backoff while HA is unreachable). No browser WebSocket to HA. |
| Actions | `POST api/command.php` with session + CSRF + same-origin; the server derives the service from an allow-list and the entity's **current** capabilities (`CommandPolicy`); the browser waits for HA to confirm the new state. |
| Connection loss | HTTP errors are mapped to `unreachable / timeout / auth / http`; the page shows "connection lost" and polling backs off (max 20 s), then resumes. |
| Reusable for IniqDash | The whole principle: private secrets file, server-side REST client, template-based state read with fallback, server-side action policy, polling with backoff. Adapted, not copied: IniqDash has its own generic layer (no Maison room/config files). |

Adapting this method does **not** put a token in the browser, so no architecture change was needed.

## 2 · Access protection (one administrator)

* Every request goes through `gate.php` (`.htaccess` rewrite); only `login.php` / `logout.php`
  are public. Pages → redirect to login, everything else → 401. `server/` and dotfiles → 403.
  Without `mod_rewrite` nothing is served at all (fail closed).
* Password: `password_hash` (Argon2id) in `<private>/iniqdash-secrets.php`; never stored in clear.
* Sessions: files in `<private>/var/sessions`, strict mode, id regenerated at login, cookie
  `__Host-iniqdash` (HTTPS) — HttpOnly, Secure, SameSite=Lax, browser-session cookie; idle
  timeout 12 h, absolute 7 days (`server/config.php`). Expired → login with a notice.
* Login attempts: 5 per address / 20 per account name in 15 min (sliding window), plus a short
  random delay on every failure. Log: `<private>/var/log/auth.log` (no passwords, no hashes).
* CSRF: per-session token; login, logout and every non-GET `api/*.php` need it + same origin.
* HTTPS required (`require_https`); HSTS, nosniff, frame and referrer headers.

## 3 · Home Assistant layer

    Home Assistant ⇄ server/ha (token here only) ⇄ api/ha_*.php (signed in) ⇄ IniqHA (browser) ⇄ bindings ⇄ widgets

* `server/ha/HaClient.php` — REST client (Maison's method).
* `server/ha/HaService.php` — status, discovery (one template call with areas, 30 s cache;
  fallback `/api/states`), states (template with explicit attribute picks; fallback per entity),
  **normalised entity** `{ id, domain, name, state, available, unit, changed, attrs, caps }`,
  and `plan()`: the only place an action becomes an HA service call. The browser sends an entity id, an action NAME and one scalar
  value — never a domain, service or data key. Each action is checked against the entity's current capabilities and values:
  light (on / off / toggle, brightness, colour temperature inside the reported kelvin range, hue, effect from the reported list),
  switch / input_boolean / fan (on / off / toggle, speed, preset, oscillate, direction), cover (open / close / stop / position),
  climate (temperature, hvac mode, preset / fan / swing mode from the reported lists, target humidity inside the reported range,
  low:high target range inside min / max, low strictly below high), media_player (play / pause / stop / previous / next, volume, mute,
  source, shuffle, repeat, power), lock, alarm_control_panel (code handled once, never stored), number / input_number (inside min / max,
  on the step), select / input_select (an option HA reports, verbatim), scene / script / button (fixed trigger), vacuum (start, pause,
  stop, return to base, locate, spot, suction level from the reported list), lawn_mower (start mowing, pause, dock) and timer (start,
  pause, cancel, finish). Everything else — sensors, weather, person, device_tracker, camera, sun — has NO action.
  `tests/plan.php` and `tests/actions.php` hold the allow-list to this.
* `api/ha_status.php`, `api/ha_entities.php`, `api/ha_states.php`, `api/ha_call.php`.
* Read-only, lazily fetched (never part of the 2 s state poll), cached in `<private>/var/cache` and shared by widget and
  Entity Details: `api/ha_calendar.php` (upcoming events of a `calendar.*` entity, `GET /api/calendars/<id>`, 14 days, 5 min)
  and `api/ha_forecast.php` (forecast of a `weather.*` entity through `weather.get_forecasts?return_response` — needs
  Home Assistant 2024.8+; only the types the entity's `supported_features` declare; 10 min).
* Browser: `components/ha/ha.js` (one poller for the whole page: 2 s visible, 10 s hidden,
  0.4 s after an action, backoff to 15 s), `bindings.js` (one entry per widget type: which domains, config from the entity, live update, actions; `bindMany` for the
  Entity List),
  `picker.js` (entity picker), `ha.css`.
* Dashboards store only `entity: "light.living_room"` — never connection data.
* Demo: a page that is not served by this server (local file, public demo without HA settings)
  never connects; widgets keep their demo data.

## 4 · Install / update on the server (SSH)

    cd ~/sites/<your site>/iniqdash          # wherever IniqDash is uploaded
    php server/setup.php --private=$HOME/private/iniqdash   # admin user + password (hidden input)
    php server/setup.php --ha                # Home Assistant URL + long-lived token
    php server/setup.php --status            # check (prints no secrets)

Upload everything except `server/local.php` (it is written on the server by the setup tool).

The Home Assistant URL and token can also be set from the editor: **More → Home Assistant connection…**
(`api/ha_settings.php`, `server/ha/HaSettings.php`). It writes the same `ha` entry of the same private
`iniqdash-secrets.php` (atomically, keeping every other value); the saved token is never sent to the browser.
The web server needs write access to the private folder for this; `setup.php --ha` keeps working as before.

Dashboards are stored on the server (`api/dashboards.php`, `server/Dashboards.php`) in
`<private>/dashboards/<id>.json` (folder 0700, files 0600, created on first use). The web server user
(e.g. `www-data`) must be able to write the private folder — the same requirement as above. Each file holds
`{ format, id, name, created, updated, revision, dashboard }`; ids are random (`d` + 16 hex) and never
derived from the name. Writes are atomic (temp file + rename) with a revision check against stale saves.
Back up `<private>/dashboards/` together with `<private>/assets/` (uploaded images).

## Readiness check

`php server/check.php` (command line only) reports the PHP version and extensions, the private folder (location, modes, writable runtime folders), the administrator account and whether Home Assistant is configured. It prints OK / WARN / FAIL, never a secret, and changes nothing. Requirements are listed in `docs/STANDALONE-INSTALL.md`.
