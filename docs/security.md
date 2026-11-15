# Security model

This page describes what INIQDASH actually does. It has **not** had an independent security review; report problems privately as
described in [SECURITY.md](../SECURITY.md).

## Where secrets are kept

- **One private folder outside the website** (`iniqdash-private`), never inside the web site (the installer refuses such places).
  Folder `0700`, files `0600`: readable only by the web server's user.
- **`iniqdash-secrets.php`** in that folder holds the administrator name and password **hash**, and the Home Assistant address and
  **token**. It is written atomically (a temporary file, checked, then renamed): a failed write leaves the previous version intact.
- **The token is stored readable**, not encrypted: the server must send it to Home Assistant. It is protected by its location and the
  file permissions. Anyone who can read your hosting account's files (the hosting provider, your FTP/SSH accounts, backups) can read it.

## The password and sign-in

- Argon2id password hashes (PHP's default where Argon2id is unavailable); constant-time comparisons.
- Rate limiting: 5 failed attempts per address and 20 per account name per 15 minutes, with a random delay after each failure.
- Server-side sessions; cookies `HttpOnly`, `Secure`, `SameSite`; a new session id at sign-in; sign-out after 12 hours of inactivity and
  after 7 days in any case.
- A CSRF token and a same-origin check on every change. HTTPS is required by default.
- The first-run account page is offered only while no account exists; the creation is locked against two simultaneous visitors.

## The Home Assistant token

- Used **only by the server**. It is never sent to the browser, exported with a dashboard, written to the log or shown in settings.
- A saved token is only ever sent to the **saved** Home Assistant address — changing the address requires entering the token again.
- The browser can only ask for actions from a fixed list, matched to the entity's capabilities.
- **Risk:** a long-lived token has all the rights of the Home Assistant user who created it, for as long as it exists. Use a separate
  Home Assistant user for INIQDASH, and revoke the token in Home Assistant (Profile → Security) if you suspect a leak; then enter a
  new one in INIQDASH.

## Other protections

Every page and endpoint is behind the sign-in; the `server` folder and hidden files are never served; saved dashboards are validated on
the server; uploaded images are checked and stored under server-chosen names; a Content-Security-Policy restricts what pages may load.
Automated tests check these against the real PHP code (`tests/security.mjs`).

## Known limits

- **Custom widget packages are not sandboxed** — they run in the page with your rights. Install only packages you trust.
- One administrator account; no multi-user permissions.
- Backups of the private folder contain the token and the password hash: protect them like passwords.
