# Installing INIQDASH

INIQDASH is a PHP web application. You put its files on a web server, open the address in a browser, and a four-step wizard does the
rest. No database, no build step, no command line needed for a normal installation.

## Requirements

| | |
|---|---|
| **PHP** | **8.1 or newer** (tested on 8.3) with the extensions `curl`, `json`, `session`, `hash`, `pcre`, `fileinfo` and `mbstring` — all standard on most hosts. |
| **Web server** | **Apache** with `mod_rewrite` and `.htaccess` files allowed (most shared hosting), or **Nginx** with the example configuration in [webserver/nginx.conf](webserver/nginx.conf). |
| **HTTPS** | Required by default (plain HTTP is redirected). A local-network-only installation can switch this off — see [STANDALONE-INSTALL.md](STANDALONE-INSTALL.md). |
| **Disk** | About 15 MB for the application, a few MB for your dashboards and uploaded pictures. |
| **Home Assistant** | Optional to start (the built-in demo works without it). To use your own home, the **web server** must be able to reach your Home Assistant — see [home-assistant.md](home-assistant.md). |
| **Browser** | A current Chrome, Edge, Firefox or Safari, on a computer, tablet or phone. |

## 1 · Download

Download `iniqdash-<version>.zip` from the project's **Releases** page and unpack it on your computer. You get one folder, `iniqdash`.

## 2 · Upload

Upload the whole `iniqdash` folder to your web space with your hosting's file manager, FTP or SFTP — for example into the folder of
your domain, so that it is reachable as `https://example.com/iniqdash/`. Upload **every** file, including the hidden `.htaccess`.

You can also put the contents directly in the root of a (sub)domain, for example `https://dashboard.example.com/`.

## 3 · Run the installation wizard

Open the address in your browser. Because there is no account yet, the wizard starts:

1. **Create your account** — a user name and a password of at least 12 characters. This is the only account; it manages your
   dashboards. The page is offered only until an account exists.
2. **Connect Home Assistant** — the Home Assistant address and a long-lived access token, then **Test connection**
   ([how to create a token](home-assistant.md#create-an-access-token)). No Home Assistant yet? Choose **Explore the demo instead**.
3. **Your dashboard** — choose the rooms and pages INIQDASH should generate ([dashboard-generator.md](dashboard-generator.md)).
4. **Finish** — the dashboard is created, becomes your default and opens.

If a step fails, nothing half-made is left behind: you can go back, correct it and try again.

## The private folder (where your account and token are kept)

During step 1 INIQDASH creates a folder named **`iniqdash-private`** **outside the website**, where it keeps your password hash, the
Home Assistant address and token, your dashboards and uploaded pictures. It is never inside the web site, so it cannot be downloaded.
It tries, in this order, and uses the first place PHP may create and write:

1. beside your site's folder (the folder above the one that holds the `iniqdash` folder);
2. the folders your host allows PHP to use (on shared hosting usually your account folder);
3. your account's home folder.

It then writes `server/local.php` (inside the application) to remember the place. Folder permissions are set to `0700`, the secrets
file to `0600`.

If no such place exists — some hosts let PHP write only inside the website — the wizard says so and creates nothing. Then either allow
PHP to reach your account folder in the hosting panel (the PHP "open_basedir" setting), or create an empty folder named
`iniqdash-private` beside your site's folder, and try again. With SSH you can also run `php server/setup.php` instead of the wizard.

## Shared hosting notes

Written for typical European shared hosting: Apache with `.htaccess`, a PHP version chosen per site, PHP limited to the account's
folders ("open_basedir") and a file manager / FTP upload. Any host with these features works the same way.

- Choose **PHP 8.1 or newer** for the site in your hosting panel (the version on the command line can differ from the site's).
- Make sure the site uses **HTTPS** (most panels offer a free certificate).
- A Home Assistant on your home network (`http://192.168.x.x:8123`) is **not reachable** from a hosting company's server. Use an
  address the internet can reach — for example your Home Assistant Cloud (Nabu Casa) remote URL, or your own HTTPS reverse proxy.
- **Unpack on your computer, upload the folder** — don't upload the ZIP and unpack it with a tool that changes file names.

## Your own server

On a home server or VPS everything above applies; you can also run INIQDASH next to Home Assistant on your local network. Server
configuration examples (Apache virtual host, Nginx, a reverse proxy) and the command-line setup are in
[STANDALONE-INSTALL.md](STANDALONE-INSTALL.md).

## After installing

- [Quick start](quick-start.md) — the first ten minutes.
- [Updating](updating.md) — how to install a new version without losing anything.
- [Troubleshooting](troubleshooting.md) — if something does not work.
