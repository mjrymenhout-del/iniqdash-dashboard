<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {                     // before anything that needs PHP 8.1 is loaded: say so instead of an empty error
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'IniqDash needs PHP 8.1 or newer. This web site runs PHP ' . PHP_VERSION . ' - choose a newer PHP version for this site in the hosting control panel.';
    exit;
}

/**
 * IniqDash front controller: EVERY request (pages, scripts, styles, images, data) arrives here
 * through the rewrite in .htaccess, except login.php and logout.php. Nothing is served to a
 * visitor without a valid server-side session:
 *   - pages (HTML)  → redirect to login.php (with ?next= so the visitor comes back)
 *   - anything else → 401, no content
 * Typing a file's URL directly therefore does not bypass the login.
 */

require __DIR__ . '/server/bootstrap.php';

const IQ_TYPES = [
    'html' => 'text/html; charset=utf-8',
    'css'  => 'text/css; charset=utf-8',
    'js'   => 'text/javascript; charset=utf-8',
    'json' => 'application/json',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'gif'  => 'image/gif',
    'ico'  => 'image/x-icon',
    'woff2' => 'font/woff2',
    'woff' => 'font/woff',
    'ttf'  => 'font/ttf',
    'mp4'  => 'video/mp4',
    'webm' => 'video/webm',
];

function iq_fail(int $code): never
{
    http_response_code($code);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo $code === 401 ? "Sign in required\n" : ($code === 403 ? "Forbidden\n" : "Not found\n");
    exit;
}

iq_headers();

/* ---- which file? (a relative path inside the IniqDash folder; anything odd is refused) */
$uri = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$base = iq_base();
$rel = str_starts_with($uri, $base) ? substr($uri, strlen($base)) : ltrim($uri, '/');
$rel = rawurldecode($rel);
if ($rel === '' || str_ends_with($rel, '/')) {
    $rel .= 'index.html';
}
$bad = str_contains($rel, "\0") || str_contains($rel, '\\') || str_starts_with($rel, '/')
    || preg_match('#(^|/)\.#', $rel) || preg_match('#(^|/)\.\.(/|$)#', $rel)
    || preg_match('#^server(/|$)#i', $rel);
// THE APPLICATION is the site root: '/' (and a root index.html) opens the dashboard application — in viewing mode, at the
// configured default dashboard. The developer showroom lives under dev/ (see below), never at the root.
$asked = $rel === 'index.html' ? '' : $rel;          // where the visitor comes back after signing in (the root stays the root)
if ($rel === 'index.html') {
    $rel = 'editor.html';
}
$isDev = (bool) preg_match('#^dev(/|$)#', $rel);
$ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
$isApi = (bool) preg_match('#^api/[a-z0-9_-]+\.php$#', $rel);
$isPage = $ext === 'html';

/* ---- who? */
Auth::startSession($isPage || $isApi);            // static files: read the session and let go of it
$user = Auth::problem() === null ? Auth::user($isPage || $isApi) : null;
if ($user === null) {
    if ($isPage && !$bad && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $q = $asked === '' ? [] : ['next' => $asked];
        if (Auth::$expired) {
            $q['expired'] = '1';
        }
        header('Cache-Control: no-store');
        header('Location: ' . $base . 'login.php' . ($q ? '?' . http_build_query($q) : ''), true, 302);
        exit;
    }
    iq_fail(401);
}

/* ---- signed in */
if ($bad) {
    iq_fail(404);
}
// the developer showroom (dev/): component test pages, not part of the product — served ONLY when this installation enables it
// (server/local.php: 'dev_showroom' => true). Otherwise it does not exist for anyone (404, enforced here, not hidden in the page).
if ($isDev && (iq_local()['dev_showroom'] ?? false) !== true) {
    iq_fail(404);
}
$file = realpath(APP_ROOT . '/' . $rel);
if ($file === false || !is_file($file) || !str_starts_with($file, APP_ROOT . DIRECTORY_SEPARATOR)) {
    iq_fail(404);
}

if ($isApi) {
    // Server endpoints (Home Assistant layer, later): signed in; state changes need CSRF + same origin.
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'HEAD'], true) && (!Auth::sameOrigin() || !Auth::checkCsrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null))) {
        iq_fail(403);
    }
    session_write_close();
    define('IQ_GATED', true);
    require $file;
    exit;
}
if (!isset(IQ_TYPES[$ext])) {
    iq_fail(404);                                   // .php, .md, .zip, … are never served as files
}

if ($isPage) {
    $csrf = Auth::csrfToken();
    session_write_close();
    $html = (string) file_get_contents($file);
    // the page gets its CSRF token (for sign-out and, later, actions); nothing else about the session
    $meta = '<meta name="iniqdash-csrf" content="' . iq_e($csrf) . '"><meta name="iniqdash-server" content="1">';
    // the installed version (the VERSION file) for the About dialog
    $ver = is_file(APP_ROOT . '/VERSION') ? trim((string) file_get_contents(APP_ROOT . '/VERSION')) : '';
    if (preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $ver)) {
        $meta .= '<meta name="iniqdash-version" content="' . iq_e($ver) . '">';
    }
    // FIRST RUN: the application opens the setup wizard (steps 2–4) while a browser setup is unfinished (server/FirstRun.php)
    require_once __DIR__ . '/server/FirstRun.php';
    if (Setup::pending()) {
        $meta .= '<meta name="iniqdash-setup" content="pending">';
    }
    $html = preg_replace('#</head>#i', $meta . '</head>', $html, 1) ?? $html;
    // the RETIRED example collections and packages ("Maison demo", "Studio Examples", "Test Me") are cleaned up ONCE, before the library and
    // the packages are listed (StudioWidgets::retireObsolete: a dashboard's widgets are never deleted; a marker keeps it from running again)
    if (str_contains($html, '<!-- iniqdash:studio-widgets -->') || str_contains($html, '<!-- iniqdash:custom-widgets -->')) {
        require_once __DIR__ . '/server/Dashboards.php';
        require_once __DIR__ . '/server/StudioWidgets.php';
        $retired = StudioWidgets::retireObsolete(false, APP_ROOT);
        if (!empty($retired['ran'])) {
            iq_log('studio_retire_examples', ['collections' => count($retired['report']['collections'] ?? []), 'packages' => count($retired['report']['packages'] ?? [])]);
        }
    }
    // custom widget packages: discovered from widgets/custom/ on every load (copy a widget or collection folder + refresh
    // = installed).
    // A page opts in with two placeholders; the page itself never names an installed widget.
    if (str_contains($html, '<!-- iniqdash:custom-widgets -->')) {
        require_once __DIR__ . '/server/WidgetPackages.php';
        $scan = WidgetPackages::scan(APP_ROOT, 'custom', WidgetPackages::defaultApis(APP_ROOT));
        $css = $js = '';
        foreach ($scan['packages'] as $p) {
            $css .= '<link rel="stylesheet" data-widget-package="' . iq_e($p['id']) . '" href="' . iq_e($p['path'] . $p['style'] . '?v=' . $p['v']) . '">';
            $js .= '<script data-widget-package="' . iq_e($p['id']) . '" src="' . iq_e($p['path'] . $p['entry'] . '?v=' . $p['v']) . '"></script>';
        }
        // the list itself as a data block (type application/json: never executed); rejected packages travel as diagnostics
        $data = '<script type="application/json" id="iniqdash-custom-widgets">'
            . json_encode(['packages' => $scan['packages'], 'collections' => $scan['collections'], 'rejected' => $scan['errors']], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . '</script>';
        $html = str_replace(['<!-- iniqdash:custom-widget-styles -->', '<!-- iniqdash:custom-widgets -->'], [$css, $data . $js], $html);
    }
    // MY WIDGETS: the reusable Widget Studio definitions (server/StudioWidgets.php) as a data block (never executed), so the gallery
    // and every dashboard instance have them on load — saving one in Studio needs no restart, no file copy and no registry edit
    if (str_contains($html, '<!-- iniqdash:studio-widgets -->')) {
        require_once __DIR__ . '/server/Dashboards.php';
        require_once __DIR__ . '/server/StudioWidgets.php';
        $html = str_replace('<!-- iniqdash:studio-widgets -->', '<script type="application/json" id="iniqdash-studio-widgets">'
            . json_encode(['widgets' => StudioWidgets::list(), 'collections' => StudioWidgets::collections()], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_PRESERVE_ZERO_FRACTION) . '</script>', $html);
    }
    header('Content-Type: ' . IQ_TYPES['html']);
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($html));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo $html;
    }
    exit;
}

// static file: private cache, always revalidated (so a signed-out browser cannot reuse it silently)
$mtime = (int) filemtime($file);
$size = (int) filesize($file);
$etag = '"' . dechex($mtime) . '-' . dechex($size) . '"';
header('Content-Type: ' . IQ_TYPES[$ext]);
header('Cache-Control: private, no-cache');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
// (Apache's compression appends "-gzip" to the ETag; W/ may be added by proxies)
$inm = array_map(static fn ($t) => preg_replace(['#^W/#', '#-(gzip|br)"$#'], ['', '"'], trim($t)), explode(',', (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')));
if (in_array($etag, $inm, true)) {
    http_response_code(304);
    exit;
}
header('Content-Length: ' . $size);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
    readfile($file);
}
