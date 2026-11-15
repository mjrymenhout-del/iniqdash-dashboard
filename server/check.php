<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * IniqDash readiness check — run on the server before first use, over SSH (never through the web: server/ is denied).
 *
 *   php server/check.php
 *
 * Checks the PHP version and extensions IniqDash uses, the private folder (location, permissions, writable runtime folders), the
 * administrator account and the optional Home Assistant connection. It prints OK / WARN / FAIL per line, never a secret, and exits 1 when
 * anything FAILed. It changes nothing.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('APP_ROOT', dirname(__DIR__));
$_SERVER['DOCUMENT_ROOT'] = $_SERVER['DOCUMENT_ROOT'] ?? '';
function iq_local(): array
{
    $f = __DIR__ . '/local.php';
    $v = is_file($f) ? (require $f) : [];
    return is_array($v) ? $v : [];
}
require __DIR__ . '/Paths.php';

/** The oldest PHP the code can run on: `never` return types, readonly properties and array_is_list() need 8.1. (Developed on 8.3.) */
const IQ_MIN_PHP = '8.1.0';
/** extension → why (REQUIRED ones make the check fail) */
const IQ_REQUIRED = [
    'curl' => 'talks to Home Assistant (server/ha/HaClient.php)',
    'json' => 'every API answer and the dashboard files',
    'session' => 'sign-in sessions (server/Auth.php)',
    'hash' => 'password hashes and CSRF comparisons',
    'pcre' => 'validation of ids, names and manifests',
    'fileinfo' => 'content checks of uploaded images (server/UserAssets.php)',
    'mbstring' => 'text length checks (lock codes, names)',
];

$fails = $warns = 0;
function line(string $level, string $text): void
{
    global $fails, $warns;
    $level === 'FAIL' && $fails++;
    $level === 'WARN' && $warns++;
    fwrite(STDOUT, sprintf("%-5s %s\n", $level, $text));
}

/* ---- PHP */
version_compare(PHP_VERSION, IQ_MIN_PHP, '>=')
    ? line('OK', 'PHP ' . PHP_VERSION . ' (minimum ' . IQ_MIN_PHP . '; developed and tested on 8.3)')
    : line('FAIL', 'PHP ' . PHP_VERSION . ' is too old — IniqDash needs ' . IQ_MIN_PHP . ' or newer');
foreach (IQ_REQUIRED as $ext => $why) {
    extension_loaded($ext) ? line('OK', "PHP extension {$ext}") : line('FAIL', "PHP extension {$ext} is missing — it {$why}");
}
function_exists('getimagesize') && defined('IMAGETYPE_WEBP') ? line('OK', 'image inspection (getimagesize, WebP)') : line('FAIL', 'getimagesize() / WebP support is missing — image uploads are unavailable');
extension_loaded('zlib') || line('WARN', 'PHP extension zlib is not loaded (optional)');
ini_get('open_basedir') && line('WARN', 'open_basedir is set — the private folder must be inside it');

/* ---- private folder */
$priv = Paths::privateDir();
if ($priv === null) {
    $why = ['not_set' => 'not set — run: php server/setup.php', 'not_found' => 'the configured folder does not exist', 'not_accessible' => 'the folder is not accessible (open_basedir?)',
        'inside_web_root' => 'the folder lies inside a web-served folder — choose one outside the site'][Paths::problem() ?? 'not_set'] ?? 'unusable';
    line('FAIL', 'private folder: ' . $why);
} else {
    line('OK', 'private folder is outside every web root');
    $mode = fileperms($priv) & 0777;
    ($mode & 0077) === 0 ? line('OK', sprintf('private folder permissions %o', $mode)) : line('WARN', sprintf('private folder is readable by other users (mode %o) — use 700', $mode));
    is_writable($priv) ? line('OK', 'private folder is writable') : line('FAIL', 'private folder is not writable by the web server user');
    foreach (['var', 'var/sessions', 'var/ratelimit', 'var/log'] as $d) {
        $p = "{$priv}/{$d}";
        is_dir($p) && is_writable($p) ? line('OK', "{$d}/ is writable") : line($d === 'var' ? 'FAIL' : 'WARN', "{$d}/ is missing or not writable (created on first request when possible)");
    }
    $secrets = "{$priv}/iniqdash-secrets.php";
    if (!is_file($secrets)) {
        line('FAIL', 'no iniqdash-secrets.php — run: php server/setup.php');
    } else {
        $smode = fileperms($secrets) & 0777;
        ($smode & 0077) === 0 ? line('OK', sprintf('secrets file permissions %o', $smode)) : line('WARN', sprintf('secrets file is readable by other users (mode %o) — use 600', $smode));
        $d = require $secrets;
        $a = is_array($d) ? ($d['admin'] ?? null) : null;
        is_array($a) && is_string($a['user'] ?? null) && $a['user'] !== '' && is_string($a['hash'] ?? null) && str_starts_with($a['hash'], '$')
            ? line('OK', 'administrator account is set (password stored as a hash)')
            : line('FAIL', 'no valid administrator account — run: php server/setup.php');
        $ha = is_array($d) ? ($d['ha'] ?? null) : null;
        is_array($ha) && !empty($ha['url']) && strlen((string) ($ha['token'] ?? '')) >= 20
            ? line('OK', 'Home Assistant connection is configured (address and token are not shown; test it in Settings → Home Assistant connection)')
            : line('WARN', 'Home Assistant is not configured — widgets show demo data until it is (php server/setup.php --ha, or Settings in the editor)');
    }
}

/* ---- web server hints that cannot be verified from the command line */
is_file(APP_ROOT . '/.htaccess') ? line('OK', '.htaccess present (Apache routes every request through gate.php)') : line('WARN', '.htaccess is missing — every request must be routed through gate.php by your web server');
$cfg = require __DIR__ . '/config.php';
(iq_local()['require_https'] ?? $cfg['require_https']) ? line('OK', 'plain HTTP is refused (require_https)') : line('WARN', 'require_https is off — only acceptable on a trusted local network');
fwrite(STDOUT, "\nNot checked here: that /server, /api/*.php (without a session), /tests and dotfiles are NOT served by your web server — request them in a browser while signed out.\n");
fwrite(STDOUT, sprintf("\n%s (%d failure%s, %d warning%s)\n", $fails ? 'NOT READY' : 'READY', $fails, $fails === 1 ? '' : 's', $warns, $warns === 1 ? '' : 's'));
exit($fails ? 1 : 0);
