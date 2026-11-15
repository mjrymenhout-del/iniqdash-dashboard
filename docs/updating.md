# Updating INIQDASH

An installation has two parts:

| | Where | On update |
|---|---|---|
| **The application** | the `iniqdash` folder on your website | **replace** |
| **Your data** — account, Home Assistant token, dashboards, uploaded pictures | the private folder `iniqdash-private`, outside the website | **never replace or delete** |
| `server/local.php` | inside the application | **keep** (it says where your private folder is) |

## Update

1. **Back up** the private folder `iniqdash-private` (download a copy). It is the only place your data lives.
2. **Download** the new release ZIP and unpack it on your computer.
3. **Upload** the new `iniqdash` folder over the old one, replacing files. Keep `server/local.php`.
   *Cleaner:* rename the old folder, upload the new one, copy `server/local.php` from the old folder into the new one, then delete the
   old folder.
4. **Open** your dashboard and sign in. Dashboards saved by an older version are converted in the browser when opened; nothing changes
   on the server until you save.

If `server/local.php` was lost, INIQDASH looks for an existing `iniqdash-private` folder in the places the installation wizard uses and
finds it again — you see the sign-in page, not a new installation. If yours is somewhere else, copy `server/local.php` back.

## Restore

Put the backup of `iniqdash-private` back in its place (and `server/local.php`, if needed). To go back to an older version, upload that
version's application folder the same way.

## Will my dashboards improve?

Fixes to widgets, the editor and the look apply to all your dashboards at once. **Generated** dashboards are saved as they were
generated: to get an improved generator's layout, generate a new dashboard (your existing ones stay as they are).

Release notes for every version: [CHANGELOG.md](../CHANGELOG.md).
