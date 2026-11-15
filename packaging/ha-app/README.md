# Home Assistant App — EXPERIMENTAL, UNRELEASED draft (NOT installable yet)

**Never built or installed on a Home Assistant system.** Do not publish these files, add a `repository.yaml`, or tell anyone the App works
until the install checklist below has passed on a real, supported Home Assistant (HA OS or Supervised). Plan:
[docs/HA-APP-PACKAGING.md](../../docs/HA-APP-PACKAGING.md).

- `config.yaml` — App metadata (ingress, no exposed port, Home Assistant API access).
- `prepare.sh` — copies the application (the committed files of the current commit, the SAME files a standalone install uses) into `./app`.
  Home Assistant builds an App with this folder as the build context, so `./app` must exist before a build. It is git-ignored.
- `Dockerfile` — PHP-FPM + Nginx on the Home Assistant base image; copies `./app`, the Nginx config and `run.sh`.
- `run.sh` — prepares the private folder in `/data` (persistent, in Home Assistant backups) and starts PHP-FPM + Nginx.
- `nginx.conf` — the gate routing (the rules of `docs/webserver/nginx.conf`, plain HTTP inside the container).

## What was checked (2026-11-05, outside Home Assistant)
- `prepare.sh` produces `./app` without tests / docs / dev / packaging.
- The App's `nginx.conf` and the `local.php` that `run.sh` writes, on a host Nginx 1.24 + PHP-FPM 8.3 (TCP 9000) over plain HTTP: every
  signed-out request to pages, `api/`, `server/`, `tests/`, dotfiles and the private folder is refused; sign-in, CSRF, dashboard save,
  image upload and sign-out work (the same checks as the standalone clean install).
- **Not checked:** the image build (the Home Assistant base image and the Alpine package mirror were not reachable), the package names in the
  Dockerfile, the Supervisor, ingress, the sidebar panel, backups, upgrades of the App.

## Release blockers (found or confirmed)
1. **Ingress paths do not work yet.** Behind a simulated ingress proxy (`/api/hassio_ingress/<token>/` → the container, `X-Ingress-Path` set)
   the server redirects a signed-out visitor to `/login.php` at Home Assistant's root, not under the ingress path: `iq_base()` derives the base
   from `SCRIPT_NAME` only. Honouring `X-Ingress-Path` is new App-mode code; the header must be trusted only when the request comes from the
   Supervisor's ingress address (anyone can send the header to an exposed port).
2. **Same origin as Home Assistant.** Under ingress IniqDash's pages run on Home Assistant's own origin. Any script in them — including a custom
   widget, which is **not sandboxed** — could read the Home Assistant frontend's stored sign-in tokens and act as the signed-in Home Assistant
   user. Until custom widgets are isolated (`docs/CUSTOM-WIDGETS-SECURITY.md`), an App build must ship with custom widgets disabled or limited
   to the release's first-party ones, and that needs a server switch that does not exist yet.
3. **Sign-in.** The draft keeps IniqDash's own login (a second sign-in): authentication is NOT weakened. Trusting Home Assistant's ingress
   session instead is a new auth mode that needs its own design and security review.
4. **HTTPS.** Inside the container the ingress proxy speaks plain HTTP; `run.sh` sets `require_https => false` only because no port is exposed.
   Exposing a port would need TLS again. On plain HTTP the session cookie is `iniqdash_sid` (HttpOnly, not Secure) instead of `__Host-…`.
5. **Home Assistant connection.** The Supervisor token / proxy vs. a long-lived token — `HaClient::config()` would need a second source.
6. **First-run admin account** — where its password comes from (App options vs. a first-run screen). Until decided the login page reports the
   missing setup.
7. **Proxy trust and login limits under ingress (new, 2026-11-05).** IniqDash now believes forwarding headers only from configured
   proxies. Every ingress request comes from the Supervisor's proxy address, so without `trusted_proxies` all users share one login-limit
   bucket; with it, IniqDash relies on the `X-Forwarded-For` that ingress sends — whether and how ingress sets it is **unverified**.
   `run.sh` must write the right `trusted_proxies` for the Supervisor's address (never a wide range: the internal network has other Apps).
8. **CSP and framing under ingress (unverified).** The Home Assistant frontend shows an ingress App in a frame on its own origin;
   IniqDash sends `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`, which should allow that (same origin) — to be confirmed in a
   real installation, together with blocker 2 (same origin also means IniqDash's scripts could reach the Home Assistant frontend's data).
9. PHP-FPM clears the environment by default, so `INIQDASH_PRIVATE` exported by `run.sh` does not reach PHP; the private folder comes from
   the `local.php` that `run.sh` writes (which is enough).

## Install checklist (all must pass on a real Home Assistant before any release)
1. `./prepare.sh`; build the image for amd64 and aarch64 locally (`docker build --build-arg BUILD_FROM=<arch base image> .`); `apk add` succeeds.
2. Add the repository as a local / custom App repository on a clean HA OS (and Supervised) instance; install; start; the log is clean.
3. The sidebar entry opens IniqDash through ingress; sign-in, reload and a deep link stay under the ingress path (blocker 1 fixed).
4. Signed out through ingress and on the container's internal port: `server/`, `api/`, `tests/`, dotfiles, traversal strings refused
   (repeat the standalone curl checks in `docs/STANDALONE-INSTALL.md`).
5. First run creates the admin account and the private folder in `/data` (700 / 600); restart and an App update keep dashboards, uploads,
   settings and secrets; a Home Assistant backup / restore brings them back.
6. The Home Assistant connection works with the chosen method; the token never appears in a browser response, a log or a backup outside `/data`.
7. Custom widgets: the chosen restriction (blocker 2) is enforced by the server. Proxy trust (blocker 7): one user's failed sign-ins do
   not lock out another; a forged `X-Forwarded-For` from inside the App network is not believed.
8. Uninstall removes the App; whether `/data` is kept is what the documentation says.
