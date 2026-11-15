<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * IniqDash setup — run over SSH on the server (never through the web: server/ is denied).
 *
 *   php server/setup.php                     create / update the private folder and the admin account
 *   php server/setup.php --status            show what is configured (never prints secrets)
 *   php server/setup.php --password          change the administrator password
 *   php server/setup.php --ha                set the Home Assistant URL + long-lived token
 *   php server/setup.php --private=/path     private folder to use (default: ../iniqdash-private
 *                                            next to the site folder; must be outside every web root)
 *
 * Writes:
 *   <private>/iniqdash-secrets.php  (mode 600)  admin user + password HASH, Home Assistant URL + token
 *   <private>/var/                  (mode 700)  sessions, login rate limits, log
 *   server/local.php                            only WHERE the private folder is (not secret)
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

function out(string $s): void { fwrite(STDOUT, $s . PHP_EOL); }
function fail(string $s): never { fwrite(STDERR, 'Error: ' . $s . PHP_EOL); exit(1); }
function ask(string $q, string $default = ''): string
{
    fwrite(STDOUT, $q . ($default !== '' ? " [{$default}]" : '') . ': ');
    $a = trim((string) fgets(STDIN));
    return $a === '' ? $default : $a;
}
function askHidden(string $q): string
{
    fwrite(STDOUT, $q . ': ');
    $tty = function_exists('posix_isatty') ? @posix_isatty(STDIN) : true;
    if ($tty && PHP_OS_FAMILY !== 'Windows') {
        shell_exec('stty -echo 2>/dev/null');
    }
    $a = rtrim((string) fgets(STDIN), "\r\n");
    if ($tty && PHP_OS_FAMILY !== 'Windows') {
        shell_exec('stty echo 2>/dev/null');
    }
    fwrite(STDOUT, PHP_EOL);
    return $a;
}
function writePrivate(string $path, array $data): void
{
    $php = "<?php\n// IniqDash private settings. Outside the web root. Never commit, never copy into the site folder.\nreturn " . var_export($data, true) . ";\n";
    $tmp = $path . '.tmp';
    if (@file_put_contents($tmp, $php, LOCK_EX) === false) {
        fail("cannot write {$path}");
    }
    @chmod($tmp, 0600);
    rename($tmp, $path);
    @chmod($path, 0600);
}

$opts = getopt('', ['status', 'password', 'ha', 'private:']);

/* ---- private folder */
$current = Paths::privateDir();
$dir = $opts['private'] ?? ($current ?? dirname(APP_ROOT, 2) . '/iniqdash-private');
if (!isset($opts['status'])) {
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        fail("cannot create {$dir}");
    }
    @chmod($dir, 0700);
}
$real = realpath($dir);
if ($real === false) {
    isset($opts['status']) ? out('private folder: not set up') : fail("{$dir} does not exist");
    exit(isset($opts['status']) ? 0 : 1);
}
if (Paths::isInsidePublic($real)) {
    fail("{$real} is inside a web-served folder. Choose a folder outside the site, e.g. next to it.");
}
$secretsPath = $real . '/iniqdash-secrets.php';
$data = is_file($secretsPath) ? (require $secretsPath) : [];
$data = is_array($data) ? $data : [];

if (isset($opts['status'])) {
    out('private folder: ' . $real . sprintf(' (mode %o)', fileperms($real) & 0777));
    out('server/local.php: ' . (is_file(__DIR__ . '/local.php') ? 'present' : 'missing'));
    out('admin account: ' . (!empty($data['admin']['user']) && !empty($data['admin']['hash']) ? 'set (user "' . $data['admin']['user'] . '")' : 'missing'));
    out('Home Assistant: ' . (!empty($data['ha']['url']) && !empty($data['ha']['token']) ? 'URL ' . $data['ha']['url'] . ', token set' : 'not configured (demo data only)'));
    exit(0);
}

foreach (['var', 'var/sessions', 'var/ratelimit', 'var/log'] as $d) {
    if (!is_dir($real . '/' . $d)) {
        @mkdir($real . '/' . $d, 0700, true);
    }
}

/* ---- administrator account */
if (isset($opts['password']) || empty($data['admin']['hash'])) {
    $user = isset($opts['password']) && !empty($data['admin']['user']) ? $data['admin']['user'] : ask('Administrator user name', (string) ($data['admin']['user'] ?? 'admin'));
    if (!preg_match('/^[A-Za-z0-9._@-]{3,64}$/', $user)) {
        fail('user name: 3–64 letters, digits or . _ @ -');
    }
    for ($i = 0; ; $i++) {
        $p1 = askHidden('Password (at least 12 characters)');
        $p2 = askHidden('Repeat password');
        if (strlen($p1) >= 12 && hash_equals($p1, $p2)) {
            break;
        }
        out(strlen($p1) < 12 ? 'Too short.' : 'The passwords do not match.');
        if ($i >= 2) {
            fail('no password set');
        }
    }
    $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    $data['admin'] = ['user' => $user, 'hash' => password_hash($p1, $algo)];
    out('Administrator account saved (password stored as a hash only).');
}

/* ---- Home Assistant connection (optional; without it IniqDash uses demo data) */
if (isset($opts['ha']) || (!isset($opts['password']) && empty($data['ha']['url']) && strtolower(ask('Connect Home Assistant now? (y/n)', 'n')) === 'y')) {
    $url = rtrim(ask('Home Assistant URL (e.g. https://xxxx.ui.nabu.casa)', (string) ($data['ha']['url'] ?? '')), '/');
    if (!preg_match('#^https?://[^\s/]+(:\d+)?(/.*)?$#i', $url)) {
        fail('not a valid http(s) URL');
    }
    $token = askHidden('Long-lived access token (Home Assistant: Profile → Security)');
    if (strlen($token) < 20) {
        fail('that does not look like a long-lived token');
    }
    $data['ha'] = ['url' => $url, 'token' => $token, 'verify_tls' => true];
    out('Home Assistant connection saved (token stored in the private folder only).');
}

writePrivate($secretsPath, $data);

/* ---- server/local.php: where the private folder is (not secret) */
$local = iq_local();
$local['private_dir'] = $real;
file_put_contents(__DIR__ . '/local.php', "<?php\n// Written by server/setup.php. Deployment-specific, never committed.\nreturn " . var_export($local, true) . ";\n", LOCK_EX);
@chmod(__DIR__ . '/local.php', 0644);
out("Done. Private folder: {$real}");
