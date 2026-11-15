# Home Assistant App (add-on) packaging — analysis only

**Decision (locked):** IniqDash will ship as **both** a Home Assistant App (recommended, easiest) **and** standalone / self-hosted. Both run the
**same codebase**. A **draft** of the App files exists in [`packaging/ha-app/`](../packaging/ha-app/README.md) — never built or installed on Home
Assistant; its README lists the release blockers found so far (ingress paths, same origin as Home Assistant with non-sandboxed widgets,
sign-in, HTTPS, connection, first-run account) and the install checklist that must pass first. No image exists.
The Home Assistant side below is written from general knowledge of the App system and **must be checked against the current Home Assistant
developer documentation** before building.

## What will be needed (outside the application code)

```
ha-app/                     new folder, packaging only — the app code stays where it is
  config.yaml               name, slug, version, arch, startup, ingress: true, panel_icon/title, map/options, API access
  Dockerfile                PHP ≥ 8.1 (+ curl, fileinfo, mbstring, session…) + a web server; copies the repository
  run.sh                    prepares /data, exports INIQDASH_PRIVATE, creates the admin account on first run, starts the server
  web-server config         the equivalent of .htaccess for the chosen server (see below)
repository.yaml (repo root) lets users add this repository to the App store
CI                          builds amd64 + aarch64 images and publishes them; version number kept in sync with the app
```

Not a second implementation: the image `COPY`s the same files a standalone install uses. Any change the App needs in the application must be
made in the shared code and keep standalone working (switches by environment variable, never a fork).

## Container / web server

- PHP with the extensions in [STANDALONE-INSTALL.md](STANDALONE-INSTALL.md) and a web server that **routes every request to `gate.php`** except `login.php` / `logout.php`,
  and never serves `server/`, dotfiles or `tests/`. The repository's rules are Apache `.htaccess`; an nginx + php-fpm image needs the same rules written for nginx
  (more common for small images), or the image can run Apache. Either way those rules must be covered by the security regression test (`tests/security.mjs`)
  run against the container.
- `tests/` is not needed at runtime and should be left out of the image.

## Persistent data

All state is in the **private folder** (`dashboards/`, `assets/`, `var/`, `iniqdash-secrets.php`). Point `INIQDASH_PRIVATE` (already supported by `server/Paths.php`) at the
App's persistent data volume (`/data` is the usual place). It is outside the web root, so `Paths` accepts it. Backups then come from Home Assistant's own backups.

## Ingress and the sidebar

Ingress lets the App appear in Home Assistant's sidebar and be reached through Home Assistant's own authenticated proxy. What must be decided / checked:

1. **Paths.** IniqDash's browser code uses relative URLs (`api/…`, `login.php`) and the server derives its base from `SCRIPT_NAME`, so it should work under a changing
   ingress path — to be verified. The server's redirects use `iq_base()`; behind ingress the original path arrives in the `X-Ingress-Path` header and must be honoured.
2. **Cookies.** Sessions use the `__Host-` cookie on HTTPS (requires `Path=/`, `Secure`). Under ingress the browser talks to Home Assistant's origin, not IniqDash's: cookie
   naming / path and the same-origin check (`Auth::sameOrigin()` compares `Origin` with `Host`) must be re-verified there.
3. **Authentication — the real design decision.** Standalone uses IniqDash's own login. In an App the user is already signed in to Home Assistant. Options:
   (a) keep IniqDash's login (double sign-in; simplest, safest); (b) trust requests that come through ingress only and skip the login — a **new auth mode** that must be
   designed carefully (only accept the Supervisor's address, only in App mode, never when the port is exposed directly); (c) offer both. Not decided here.
4. **Home Assistant connection.** Standalone stores a URL and a long-lived token. An App can instead use the Supervisor's proxy and token supplied to the container
   (requires the App to request Home Assistant API access). `HaClient::config()` would gain a second, environment-driven source. The token must still never reach the browser.

## Release implications

Version numbers and changelog shared by both distributions · images for each architecture · an upgrade path that never touches `/data` · the App's documentation
and the standalone README must say the same thing about status and security · acceptance testing on real Home Assistant installations is a
precondition of a first App release.

## Clean-install test plan (App)

1. Add the repository to a clean Home Assistant OS / Supervised instance; install the App; start it; watch the log for errors.
2. The sidebar entry opens IniqDash through ingress; reload and deep-link behave; sign-in works as decided in (3).
3. First run creates the admin account / private folder with correct modes; restart and upgrade keep dashboards, uploads and secrets.
4. Home Assistant connection works with the chosen method; disconnect / reconnect; an entity of every widget family.
5. Run `tests/security.mjs` equivalents against the container: signed-out requests to `server/`, `api/`, dotfiles, traversal strings are all refused.
6. Uninstall removes the App; its data is or is not kept as documented.
