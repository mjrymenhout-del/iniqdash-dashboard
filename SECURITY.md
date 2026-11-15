# Security policy

INIQDASH is **beta software** (0.1.0-beta.1). It has not had an external security review or a penetration test. How secrets are kept: [docs/security.md](docs/security.md).

## Reporting a vulnerability
Please **do not open a public issue** for a security problem. Use GitHub's private vulnerability reporting
("Security" tab → "Report a vulnerability") on this repository. Include what you found, how to reproduce it and the version / commit.
You will get an answer as soon as the maintainer can; there is no guaranteed response time during the beta.

## Supported versions
Only the latest beta release (and the default branch) is supported. There are no patched older releases during the beta.

## What IniqDash is designed to protect (and how)
- **The Home Assistant token never reaches the browser.** The Home Assistant address and long-lived token live only in the server's private
  folder (outside the web root). The saved token is only ever sent to the saved Home Assistant address (a new address needs the token again). The browser talks to IniqDash's own signed-in endpoints; it is never given the token, and the token is never
  logged, exported or put into a dashboard.
- **Every file and endpoint is behind the session** (`gate.php`); only `login.php` / `logout.php` are public. State changes need a CSRF
  token and the same origin. Passwords are stored as hashes.
- **Login attempts are rate-limited** per visitor address (5 failures / 15 min) and per account name (20 / 15 min). A browser that signed
  in successfully before gets a *device cookie* (random, HttpOnly, `SameSite=Strict`, only its hash is stored); it is limited on its own
  instead of by the account counter, so strangers guessing passwords cannot lock the owner out. It grants no access by itself.
- **Forwarding headers are believed only from trusted proxies.** `X-Forwarded-Proto` / `X-Forwarded-For` count only when the request comes
  from an address in `trusted_proxies` (`server/local.php`) or `INIQDASH_TRUSTED_PROXIES`; by default from nobody. Behind a configured
  proxy the login limit applies to the real client, not to everyone behind the proxy.
- **Content-Security-Policy** on every page: scripts only from IniqDash's own files (no inline script, no `eval`, no other host), images,
  fonts and connections only to this server, not frameable by other sites. The sign-in page has a stricter policy of its own.
- **Actions are allow-listed on the server.** The browser sends an entity id and an action name — never a Home Assistant service. The server
  derives the service from an allow-list and the entity's reported capabilities, and refuses anything else. Alarm codes are never stored.
- **Long-term statistics are read-only.** The server's WebSocket client sends only authentication and the recorder's statistics queries.
- **Saved dashboards are validated on the server** (shape, size, no markup, no credential-like keys). Uploaded images are validated and
  served with a sandboxing policy.
- **The developer showroom (`dev/`) does not exist** unless an installation enables it in `server/local.php` — enforced by the server.
- Regression tests for these behaviours run against the real PHP code (`tests/security.mjs`, `tests/proxy-trust.mjs`, `tests/proxy.php`,
  `tests/csp.mjs`, `tests/app-shell.mjs`).

## Known limitations (read before exposing IniqDash)
- **Custom widgets are not sandboxed.** A package in `widgets/custom/` runs as ordinary JavaScript in your page with the same rights as
  IniqDash itself. Only install widgets you trust. See [docs/CUSTOM-WIDGETS-SECURITY.md](docs/CUSTOM-WIDGETS-SECURITY.md).
- **One administrator account.** There are no roles or per-user permissions yet.
- **HTTPS is required** for anything reachable beyond a trusted local network (the default configuration refuses plain HTTP).
- Only Chromium has been tested.
- An attacker who knows the user name can still lock the account for **new** browsers (20 failures / 15 min); a browser that signed in
  before keeps working (device cookie). Clearing cookies, or a first sign-in from a new device during an attack, waits out the window.
  Do not expose IniqDash to the internet without a reason; prefer a VPN or a reverse proxy with its own access control.
- The Content-Security-Policy allows inline **styles** (`style-src 'unsafe-inline'`: widgets position and colour elements with style
  attributes). A custom widget that needs inline scripts, `eval` or another host is blocked by it; `server/local.php` `'csp' => 'report-only'`
  only reports instead (weaker — use it to diagnose, not permanently). The CSP does not make custom widgets safe: their own script files
  are allowed and run with IniqDash's rights.
- Under a Home Assistant App's ingress IniqDash would share Home Assistant's origin; see `packaging/ha-app/README.md` before building one.

## If a Home Assistant token may have leaked
Revoke it in Home Assistant (your profile → Security → Long-lived access tokens), create a new one and update it with
`php server/setup.php`. Deleting a file does not remove it from Git history: never commit a private folder or `server/local.php`.
