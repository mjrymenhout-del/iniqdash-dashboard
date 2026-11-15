<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Common bootstrap for gate.php, login.php and logout.php. This folder is never served
 * (server/.htaccess + the root .htaccess).
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');      // never leak paths or values to the browser
ini_set('log_errors', '1');

define('APP_ROOT', dirname(__DIR__));

/* FIRST-INSTALL SAFETY NET: a PHP fatal error or an uncaught exception would otherwise end in an empty "HTTP 500" page. While no
   administrator exists yet (a fresh install) the reason is shown — the message with the server's folders removed, file name and
   line only; once an account exists only a generic notice is shown and the details go to the PHP error log. */
function iq_fail_page(string $msg, string $file, int $line): void
{
    static $shown = false;                 // once: an exception can be reported by both handlers
    if ($shown) {
        return;
    }
    $shown = true;
    $first = true;
    try {
        $first = !class_exists('Auth', false) || in_array(Auth::problem(), ['private_dir_not_set', 'account_missing'], true);
    } catch (\Throwable $t) {
        $first = true;
    }
    $strip = static fn (string $x): string => str_replace([APP_ROOT, dirname(APP_ROOT, 2)], ['…', '…'], $x);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
    }
    $h = static fn (string $x): string => htmlspecialchars($x, ENT_QUOTES, 'UTF-8');
    $detail = $first ? '<p>' . $h(mb_substr($strip($msg), 0, 400)) . '</p><p><small>' . $h(basename($file)) . ':' . $line . ' · PHP ' . $h(PHP_VERSION) . '</small></p>'
        : '<p>Details are in the server\'s PHP error log.</p>';
    echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>IniqDash could not start</title>'
        . '<body style="font:15px/1.5 system-ui,sans-serif;background:#1c1d22;color:#e8e8ec;padding:40px;max-width:640px;margin:auto">'
        . '<h1 style="font-size:20px">IniqDash could not start</h1>' . $detail . '</body>';
}
set_exception_handler(static function (\Throwable $e): void {
    error_log('IniqDash: ' . get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    iq_fail_page(get_class($e) . ': ' . $e->getMessage(), $e->getFile(), $e->getLine());
});
register_shutdown_function(static function (): void {
    $e = error_get_last();
    if ($e !== null && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        iq_fail_page((string) $e['message'], (string) $e['file'], (int) $e['line']);
    }
});

/** Deployment-specific settings (server/local.php, written by server/setup.php, never committed). */
function iq_local(): array
{
    static $local = null;
    if ($local === null) {
        $f = __DIR__ . '/local.php';
        $v = is_file($f) ? (require $f) : [];
        $local = is_array($v) ? $v : [];
    }
    return $local;
}

require __DIR__ . '/Paths.php';
require __DIR__ . '/Auth.php';

/** The private settings file (<private>/iniqdash-secrets.php), read once. Never sent anywhere. */
function iq_secrets(): array
{
    static $data = null;
    if ($data === null) {
        $dir = Paths::privateDir();
        $f = $dir !== null ? $dir . '/iniqdash-secrets.php' : null;
        $v = $f !== null && is_file($f) && is_readable($f) ? (require $f) : [];
        $data = is_array($v) ? $v : [];
    }
    return $data;
}

$IQ = array_merge(require __DIR__ . '/config.php', array_intersect_key(iq_local(), array_flip(['require_https', 'idle_timeout', 'absolute_timeout'])));

/* Runtime data lives in <private>/var. Without a private folder nothing works (fail closed). */
$privateDir = Paths::privateDir();
define('IQ_VAR', $privateDir !== null ? $privateDir . '/var' : null);
if (IQ_VAR !== null) {
    foreach (['sessions', 'ratelimit', 'log', 'cache'] as $d) {
        if (!is_dir(IQ_VAR . '/' . $d)) {
            @mkdir(IQ_VAR . '/' . $d, 0700, true);
        }
    }
}

/** Minimal server log (never passwords, hashes, tokens or session ids). */
function iq_log(string $event, array $context = []): void
{
    if (IQ_VAR === null) {
        return;
    }
    $line = sprintf("%s %s %s\n", gmdate('c'), $event, $context ? json_encode($context, JSON_UNESCAPED_SLASHES) : '');
    @file_put_contents(IQ_VAR . '/log/auth.log', $line, FILE_APPEND | LOCK_EX);
}

/**
 * Reverse proxies whose forwarding headers (X-Forwarded-Proto, X-Forwarded-For) are believed: server/local.php 'trusted_proxies'
 * (list of IP addresses or CIDR ranges) plus the environment variable INIQDASH_TRUSTED_PROXIES (comma-separated). Default: NONE —
 * a forwarding header from anyone else is ignored, so a client cannot claim HTTPS or another address by sending it.
 * @return list<string>
 */
function iq_trusted_proxies(): array
{
    static $list = null;
    if ($list === null) {
        $raw = iq_local()['trusted_proxies'] ?? [];
        $raw = is_array($raw) ? $raw : [$raw];
        $env = getenv('INIQDASH_TRUSTED_PROXIES');
        if (is_string($env) && $env !== '') {
            $raw = array_merge($raw, explode(',', $env));
        }
        $list = [];
        foreach ($raw as $r) {
            $r = is_string($r) ? trim($r) : '';
            [$ip, $bits] = array_pad(explode('/', $r, 2), 2, null);
            $bin = $ip !== null && $ip !== '' ? @inet_pton($ip) : false;
            $max = $bin === false ? 0 : strlen($bin) * 8;
            if ($bin !== false && ($bits === null || (ctype_digit($bits) && (int) $bits <= $max))) {
                $list[] = $r;
            }
        }
    }
    return $list;
}

/** Is $ip inside one of the CIDR ranges / addresses in $list? (IPv4 and IPv6; no cross-family matches) */
function iq_ip_in(string $ip, array $list): bool
{
    $a = @inet_pton($ip);
    if ($a === false) {
        return false;
    }
    foreach ($list as $entry) {
        [$net, $bits] = array_pad(explode('/', $entry, 2), 2, null);
        $b = @inet_pton((string) $net);
        if ($b === false || strlen($a) !== strlen($b)) {
            continue;
        }
        $bits = $bits === null ? strlen($a) * 8 : (int) $bits;
        $bytes = intdiv($bits, 8);
        $rest = $bits % 8;
        if (substr($a, 0, $bytes) !== substr($b, 0, $bytes)) {
            continue;
        }
        if ($rest === 0 || ((ord($a[$bytes]) ^ ord($b[$bytes])) & (0xFF << (8 - $rest)) & 0xFF) === 0) {
            return true;
        }
    }
    return false;
}

/** The request came straight from a trusted reverse proxy. */
function iq_from_trusted_proxy(): bool
{
    $list = iq_trusted_proxies();
    return $list !== [] && iq_ip_in((string) ($_SERVER['REMOTE_ADDR'] ?? ''), $list);
}

function iq_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (strtolower((string) ($_SERVER['REQUEST_SCHEME'] ?? '')) === 'https' || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443') {
        return true;
    }
    if (!iq_from_trusted_proxy()) {
        return false;                                   // X-Forwarded-Proto from anyone else is ignored
    }
    // the value the nearest (trusted) proxy set: the last one in a list
    $parts = array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')));
    return strtolower((string) end($parts)) === 'https';
}

/**
 * The visitor's address, for rate limiting. REMOTE_ADDR — or, when that is a trusted proxy, the first address in X-Forwarded-For
 * counted from the right that is not itself a trusted proxy (addresses further left can be invented by the client).
 */
function iq_client_ip(): string
{
    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if (!iq_from_trusted_proxy()) {
        return $remote;
    }
    $chain = array_reverse(array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))));
    foreach ($chain as $ip) {
        if (@inet_pton($ip) === false) {
            break;                                      // malformed: stop, keep the last trustworthy address
        }
        if (!iq_ip_in($ip, iq_trusted_proxies())) {
            return $ip;
        }
    }
    return $remote;
}

/** URL path of the IniqDash folder, with a trailing slash (e.g. "/iniqdash/"). */
function iq_base(): string
{
    $dir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    return rtrim($dir, '/') . '/';
}

function iq_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

const IQ_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
    . "connect-src 'self'; media-src 'self' blob:; frame-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; "
    . "form-action 'self'; frame-ancestors 'self'";

/** Security headers sent with every response IniqDash produces. */
function iq_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header('Cross-Origin-Opener-Policy: same-origin');
    // Content-Security-Policy: scripts only from IniqDash's own files (no inline script, no eval, no other host); styles may be inline
    // (widgets set style attributes); images, fonts and data only from this server. server/local.php 'csp' => 'report-only' (log
    // violations in the browser console instead of blocking — e.g. while checking a custom widget) or 'off'. A file response that
    // sends its own stricter policy (uploaded images) replaces this one.
    $mode = iq_local()['csp'] ?? 'enforce';
    if ($mode !== 'off') {
        header(($mode === 'report-only' ? 'Content-Security-Policy-Report-Only: ' : 'Content-Security-Policy: ') . IQ_CSP);
    }
    if (iq_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

// Internet-facing: refuse plain HTTP.
if (!empty($IQ['require_https']) && PHP_SAPI !== 'cli' && !iq_https()) {
    $host = preg_replace('/[^A-Za-z0-9.\-:\[\]]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && $host !== '') {
        header('Location: https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/'), true, 301);
        exit;
    }
    http_response_code(403);
    exit;
}

Auth::boot($IQ);
