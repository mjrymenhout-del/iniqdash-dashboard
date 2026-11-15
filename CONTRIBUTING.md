# Contributing to IniqDash

Thank you for helping. INIQDASH is in **public beta**; expect things to move.

## Before you start
- **Licence:** IniqDash is licensed under the [Mozilla Public License 2.0](LICENSE). By contributing you agree that your contribution is
  licensed under MPL-2.0 ("inbound = outbound"). You keep the copyright in your contribution; there is no copyright assignment and no CLA.
- **Sign-off (DCO):** add a `Signed-off-by: Your Name <email>` line to each commit (`git commit -s`), certifying the
  [Developer Certificate of Origin 1.1](https://developercertificate.org/): you wrote the change or have the right to submit it under the
  project's licence. Use a real name or a consistent public identity, and an address you are happy to publish (a GitHub no-reply address is fine).
- **File notices:** new source files (`.js`, `.mjs`, `.css`, `.php`, `.sh`, HTML) start with the MPL-2.0 notice used in the existing files
  (after a `#!` line or `<?php`). JSON files carry no notice. Never remove or change an existing copyright or licence notice, and keep
  third-party files' own notices ([THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)); adding third-party code or assets needs their licence
  recorded there first.
- The project's name and founder attribution: [BRANDING.md](BRANDING.md).
- Open an issue first for anything larger than a fix, so the design can be agreed (especially new widgets, settings or server endpoints).
- Security problems: see [SECURITY.md](SECURITY.md) — never in a public issue.

## Principles (please keep them)
- **Home Assistant is the backend. IniqDash is the frontend.** No automation engine, no device database, no energy calculations: show what
  Home Assistant reports, send the few actions the user allows.
- **The token never reaches the browser.** Widgets never talk to Home Assistant; actions are allow-listed on the server.
- **One functional component, many uses.** Reuse the shared components (`window.IniqDashUI`, [docs/SHARED-CONTROLS.md](docs/SHARED-CONTROLS.md))
  instead of writing another button, value, slider or dial.
- **Nothing invented.** A missing or unavailable value is shown as such — never estimated or replaced.
- **No framework, no build step.** Vanilla JavaScript, CSS and PHP 8.1+.
- **Existing dashboards keep working.** New configuration keys are optional; a schema change needs a migration and a test.

## Set up a development copy
You need **PHP 8.1+** (with `curl`, `mbstring`, `fileinfo`), **Node.js 20+**, **Python 3** (a few tools) and **Playwright with
Chromium** for the browser tests:

```bash
git clone https://github.com/mjrymenhout-del/iniqdash-dashboard.git && cd iniqdash-dashboard
npm install -g playwright && npx playwright install chromium
tests/run-all.sh                 # every suite; or one: node tests/setup-wizard.mjs
```

No Home Assistant is needed: the tests start the real PHP server with a **fake** Home Assistant and a **simulated** home
([tests/README.md](tests/README.md)). To try the application by hand, the tests' helper `tests/lib/live.mjs` shows how a throwaway
server is started (private folder, account, fake Home Assistant).

## How it fits together
```
Home Assistant  ⇄  INIQDASH server (PHP)  ⇄  browser (vanilla JS)  ⇄  widgets
  the brain          holds the token          editor + runtime        never talk to Home Assistant
```

| Path | What |
|---|---|
| `gate.php`, `login.php`, `api/` | the front controller (everything goes through it, behind the sign-in) and the JSON endpoints |
| `server/` | PHP, never served: sessions (`Auth.php`), first-run setup (`FirstRun.php`), dashboards storage, the Home Assistant client and the simulated home (`ha/`) |
| `editor.html`, `components/` | the page: editor and runtime (`components/editor/`), grid, popups, themes, Widget Studio, the Home Assistant layer (`components/ha/`) |
| `components/editor/generate-demo.js`, `design-presets.js` | the dashboard generator and the shared design rules it and the demo use |
| `widgets/default/` | the standard widgets (one folder each: `widget.json`, JS, CSS) |
| `assets/` | styles, fonts, icons, photos, the demo dashboard (`assets/demo/iniqdash-demo.json`, built by `tools/build-iniqdash-demo.mjs`) |
| `tests/`, `tools/`, `packaging/`, `docs/` | tests, maintenance scripts, release packaging, documentation |

## Development
- Run it with PHP's built-in server for development only (`tests/lib/router.php` shows the routing); production needs Apache or Nginx
  ([docs/STANDALONE-INSTALL.md](docs/STANDALONE-INSTALL.md)).
- The developer showroom (`dev/`) is served only when `server/local.php` contains `'dev_showroom' => true`.
- Tests: `tests/run-all.sh` (Playwright / Chromium and PHP). Add a focused test for what you change; a visual change needs its screenshots
  checked by eye, not only a passing test. Tests run against a **fake** Home Assistant — say so when you report results.
- Commit messages: what changed and why, in plain language.

## Pull requests
Use the pull-request template. Keep a pull request to one topic; include tests and, for visual changes, before / after screenshots.
