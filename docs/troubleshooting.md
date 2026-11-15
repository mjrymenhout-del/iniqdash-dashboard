# Troubleshooting

## Installation

| What you see | What to do |
|---|---|
| **"IniqDash needs PHP 8.1 or newer"** | Choose PHP 8.1+ for this site in your hosting panel. |
| **"IniqDash could not start"** with a reason | During a first installation the page names the problem (a missing file, a missing PHP extension). A missing file usually means an incomplete upload: delete the folder and upload it again. |
| **An empty "HTTP 500" page** | Check the PHP version, then your hosting's PHP error log. Often a `.htaccess` directive your host does not allow, or an incomplete upload. |
| **"…found no folder outside the web site that PHP may create and write"** | Your host lets PHP write only inside the website. Allow PHP to reach your account folder (hosting panel, "open_basedir"), or create an empty `iniqdash-private` folder beside your site's folder, and try again. See [installation.md](installation.md#the-private-folder-where-your-account-and-token-are-kept). |
| **"IniqDash cannot write server/local.php"** | Give the web server write access to the `server` folder for the installation (only this one file is written), or run `php server/setup.php` over SSH. |
| **The page redirects to https and fails** | Install a certificate for the site (most panels offer one free). |
| **Everything shows "Not Found" / the pages are not styled** | `.htaccess` is not active: it was not uploaded (hidden file), or `mod_rewrite` / `AllowOverride` is off. On Nginx use [webserver/nginx.conf](webserver/nginx.conf). |
| **Sign-in says "locked"** | Too many failed attempts: wait 15 minutes. |
| **Forgot the password** | Over SSH: `php server/setup.php --password`. |

## Home Assistant

| Message | Meaning |
|---|---|
| **Could not reach Home Assistant at this address** | The *web server* cannot reach that address. A hosted INIQDASH cannot reach `192.168.…` — use a public HTTPS address (for example your Home Assistant Cloud remote URL). |
| **This host name could not be found** | Typo, or a local name (`homeassistant.local`) the web server cannot resolve. |
| **The secure (https) connection failed** | Certificate problem on the Home Assistant side (self-signed, expired, wrong name). |
| **Home Assistant rejected the token** | The token was revoked or mistyped: create a new long-lived access token. |
| **You changed the address: paste the token again** | By design: the saved token is only sent to the saved address. |
| Widgets show **Unavailable** | The entity is unavailable in Home Assistant itself (device offline). |

## Dashboards

- **A generated dashboard misses a device** — the generator leaves out technical and duplicate entities; add the widget yourself in the
  editor (every widget lets you pick any entity), or see [dashboard-generator.md](dashboard-generator.md).
- **The dashboard looks different on the phone** — each screen size has its own layout: edit it with the **Mobile** screen selected.
- **Changes are lost** — click **Done** (or **Save**) before leaving the editor; the editor warns about unsaved changes.

## Reporting a problem

Open an issue on the project's GitHub page ("Report a problem"). Include your PHP version, hosting type, browser, and what the page
said. **Remove private information first** — addresses, tokens, names.
