# Standalone installation — what IniqDash actually requires

Facts taken from this repository (`server/`, `gate.php`, `.htaccess`, the CSS / JS in use) and from one **clean-install test in an isolated
container** (results below). That test is not a real server on a real network, and nothing was verified against a real Home Assistant.
There is no installer or updater.

## Server

| Requirement | Detail |
|---|---|
| PHP | **8.1 or newer.** The code uses `never` return types, `readonly` properties and `array_is_list()`. It has been run on **8.3.6 only**; 8.1 and 8.2 are untested. |
| PHP extensions (required) | `curl` (Home Assistant), `json`, `session`, `hash`, `pcre`, `fileinfo` (image uploads), `mbstring`. `getimagesize()` with WebP support (standard PHP) is needed for uploads. |
| Web server | **Apache with `mod_rewrite`** and `AllowOverride` so the shipped `.htaccess` applies (`mod_headers` is optional). Without `mod_rewrite` the `.htaccess` fails closed (nothing is served). |
| Other web servers | **Examples, tested once in a clean container (below):** [webserver/nginx.conf](webserver/nginx.conf), [webserver/apache-vhost.conf](webserver/apache-vhost.conf). Any server must (1) send **every** request to `gate.php` except `login.php`, `logout.php` and `gate.php` itself, (2) never serve `server/` or any dotfile directly, (3) pass the real client address and `X-Forwarded-Proto` correctly. `tests/lib/router.php` shows the minimum mapping for PHP's built-in server — it is a **test router, not a production setup**. |
| Build step | None. No Composer, no npm. `widgets/index.js` is a committed, generated file; after changing a **default** widget's manifest run `php server/build-widget-index.php`. |
| HTTPS | Required by default (`require_https` in `server/config.php`: plain HTTP is redirected for pages and refused for everything else). `server/local.php` may set `'require_https' => false` — only for a trusted local network. Behind a TLS-terminating reverse proxy, list the proxy's address in `server/local.php` → `'trusted_proxies' => ['127.0.0.1']` (addresses or CIDR ranges; or the environment variable `INIQDASH_TRUSTED_PROXIES`, comma-separated). Only then are its `X-Forwarded-Proto` and `X-Forwarded-For` believed; from anyone else they are ignored (default: nobody). Example: [webserver/reverse-proxy-nginx.conf](webserver/reverse-proxy-nginx.conf). |

## Private folder (secrets and data)

`php server/setup.php` creates it, writes the admin account and optionally the Home Assistant connection.

- **Location:** outside the site folder, outside the folder above it, and outside the web server's `DOCUMENT_ROOT` — `server/Paths.php` refuses anything else.
  Resolution order: environment variable `INIQDASH_PRIVATE`, then `server/local.php` (`private_dir`, written by setup, never committed).
  Setup's default: `iniqdash-private` two folders above the IniqDash folder.
- **Contents:** `iniqdash-secrets.php` (admin user + **password hash**, Home Assistant URL + **token**) · `dashboards/` (saved dashboards, one JSON file each, with a revision) ·
  `assets/` (uploaded images, server-chosen names) · `var/sessions`, `var/ratelimit`, `var/log`, `var/cache`.
- **Permissions:** folder `0700`, secrets file `0600`, runtime folders `0700`. The **web server user must be able to read and write** the private folder
  (run setup as that user, or `chown` afterwards). **Every** run of `setup.php` as root (`--ha`, `--password`) rewrites the secrets file as
  root-owned `0600`: `chown -R <web user> <private folder>` again afterwards, or the site reports the account as missing.
- **Backups:** back up the private folder. It is the only place that holds your dashboards and secrets.

## Check before first use

```
php server/setup.php        # create the private folder + admin account (+ Home Assistant)
php server/check.php        # read-only readiness check: PHP, extensions, private folder, permissions, account (exit 1 if not ready)
php server/setup.php --status
```

`server/check.php` cannot see your web server. `tests/install-check.sh` checks a deployed site from outside with curl (signed-out
refusals, sign-in, CSRF, a dashboard save, an image upload, sign-out): `IQ_PASS='…' tests/install-check.sh https://your.host`. By hand, while **signed out**, request `/server/Auth.php`, `/api/dashboards.php`, `/.git/config`,
`/tests/README.md` and `/assets/css/tokens.css`: every one must be refused (redirect to login, 401, 403 or 404) and none may return file contents.
(`tests/security.mjs` does exactly this against a real PHP server.)

## Clean-install test (2026-11-05, isolated container)

Ubuntu 24.04 container, PHP 8.3.6 (CLI, `mod_php`, PHP-FPM), Apache 2.4.58, Nginx 1.24.0, self-signed certificate, a fake Home Assistant
(HTTP, `/api/config` + `/api/states`). The application came from `git archive HEAD` (no `server/local.php`, no private folder).

| Step | Result |
|---|---|
| `php server/check.php` before setup | NOT READY (private folder not set) — as expected, exit 1 |
| `php server/setup.php --private=/srv/…/private` (answers on stdin) | admin account (Argon2id hash), folder `700`, secrets `600`, `server/local.php` written; `check.php` READY |
| Apache + `mod_php`, HTTPS, `docs/webserver/apache-vhost.conf` | **The example did not load** (`Illegal override option #`: Apache allows no comment after `AllowOverride All`) — **fixed** in the example; then `configtest` OK |
| Nginx + PHP-FPM, HTTPS, `docs/webserver/nginx.conf` | **The example did not load on Nginx 1.24** (`http2 on;` needs ≥ 1.25.1) — **fixed** (a comment explains both forms); then `nginx -t` OK |
| Signed out, both servers: `/`, `editor.html`, `api/*`, `server/*` (incl. `local.php`, `setup.php`), `.git/config`, `.htaccess`, `tests/`, `dev/`, assets, `widgets/custom/…`, the secrets file name, traversal strings (`..%2f`, `%2e%2e`, `gate.php/../`) | all refused (302 to sign-in, 400, 401, 403 or 404); none returned content |
| Plain HTTP | Apache (app's own rule): GET → 301 to https, POST → 403; Nginx example: 301 |
| Sign-in | wrong password 401; correct password from another `Origin` refused ("form expired", no session); correct password 303; cookie `__Host-iniqdash`, `Secure`, `HttpOnly`, `SameSite=Lax` |
| Signed in | app page 200 with a 64-character CSRF token; assets 200; `server/` still refused; `dev/` 404 |
| Dashboard create | without `X-CSRF-Token` 403; with it 200 and the JSON file in `<private>/dashboards/`; read back 200 |
| Image upload | PNG accepted (served with `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`); SVG with a script refused (415) |
| Home Assistant | `setup.php --ha` (stdin) → `api/ha_status.php`: `configured: true, connected: true` against the fake Home Assistant |
| Browser (Chromium) on both servers | sign-in → the application in viewing mode, no console error, no failed request; with no dashboard saved, the built-in sample and the first-run note |
| Sign-out | 303; the old cookie no longer works |
| Upgrade | a fresh `git archive` in place of the application folder, `server/local.php` copied over: `check.php` READY, sign-in, all dashboards and the Home Assistant connection kept |
| Upgrade without `server/local.php` | fails closed: the sign-in page reports `private_dir_not_set` |

### Re-test after the MPL-2.0 / hardening changes (2026-11-05, same container, fresh `git archive` of the release candidate)

| Check | Result |
|---|---|
| `tests/install-check.sh` — Apache + `mod_php` (HTTPS), Nginx + PHP-FPM (HTTPS), **Nginx reverse proxy (TLS) → Apache backend** (`docs/webserver/reverse-proxy-nginx.conf`, backend `trusted_proxies => ['127.0.0.2']`) | 33 / 33 on each |
| Reverse proxy example | **was wrong** (`Host $host` drops the port, so the same-origin check refused the sign-in on a non-443 port) — fixed to `$http_host` |
| Backend reached directly with a forged `X-Forwarded-Proto: https` (from an untrusted address) | refused (GET → 301 to https, POST → 403) |
| Login limit through the proxy with a forged `X-Forwarded-For` on every attempt | the real client is counted: the 6th attempt is locked (429) |
| CSP | every gated response sends it; the sign-in page sends its own stricter one |
| **First-run journey in Chromium** (`tests/install-firstrun.mjs`) on all three: sign in → Settings → Home Assistant (test, save) → new dashboard → Add Widget → Sensor → entity chosen from Home Assistant's list → Done → sign out (API 401) → sign in → the dashboard shows the value | 10 / 10 on each; no CSP violation, no console error. **Fake Home Assistant** (Python, `/api/config`, `/api/states`, `/api/template`) |
| **Backup / restore**: `tar` of the private folder → folder deleted (site fails closed: `private_dir_not_found`) → restored with `tar -p` | owner / modes kept (`700`, web user); every dashboard back; checks pass |
| **Upgrade** from the previous release candidate (`d471546`) to this one, keeping `server/local.php` and the private folder | READY; dashboards, Home Assistant connection and sign-in kept; the development "Test Me" widgets are gone from `widgets/custom/` (they are a test fixture now) |

**Not verified:** a real server on a real network and domain, a real certificate, a real Home Assistant, PHP 8.1 / 8.2, other
distributions, sub-path installs (`/dash/`), Apache as the reverse proxy, Firefox / Safari.

## Browser

A current evergreen browser. The UI relies on container queries (`@container`), `color-mix()`, `@property`, `<dialog>` with `showModal()`,
`inert`, `ResizeObserver`, `structuredClone`, Web Animations and `:has()`. **Only Chromium is tested** (Playwright). Firefox and Safari have not been
tried; treat them as unverified. Cookies must be enabled (the session); JavaScript is required.

## Upgrades and backups
- **Back up the private folder** (dashboards, uploads, secrets) before every upgrade; it is the only state. The application folder can be
  replaced as a whole (keep `server/local.php`).
- Upgrade: put the new application files in place (keep `server/local.php`), run `php server/check.php`, sign in and open each dashboard.
  Saved dashboards are migrated in the browser when opened; the server copy changes only when you save.
- File permissions: the web server user reads the application folder and reads / writes the private folder; nothing in the application
  folder needs to be writable, except once: the browser setup (first-run wizard) writes `server/local.php` to remember where the
  private folder is. The full update procedure: [updating.md](updating.md).

## Public configuration examples

Nothing private ships in the repository: `.gitignore` excludes `server/local.php`, `*.secret.php`, `iniqdash-secrets.php`, `private/` and `var/`. What the files look like:

```php
// server/local.php  (written by setup.php; not secret; never committed)
return ['private_dir' => '/srv/iniqdash-private' /* , 'require_https' => false */];

// <private>/iniqdash-secrets.php  (mode 600; written by setup.php)
return [
    'admin' => ['user' => 'admin', 'hash' => '<output of password_hash()>'],
    'ha'    => ['url' => 'https://homeassistant.example:8123', 'token' => '<long-lived access token>', 'verify_tls' => true],   // optional
];
```
