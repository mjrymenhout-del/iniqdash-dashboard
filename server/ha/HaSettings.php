<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Settings → Home Assistant connection: read, test and save the HA URL + long-lived token.
 *
 * ONE source of truth: the private settings file <private>/iniqdash-secrets.php, key 'ha'
 * ({ url, token, verify_tls?, ca_file? }) — the same file and key server/setup.php writes and HaClient::config() reads.
 * This class only adds a safe way to change it from the UI:
 *   - the token is NEVER returned: read() reports tokenConfigured only;
 *   - a test uses the CANDIDATE values in memory (a blank token = the saved one, server side, and only for the SAVED
 *     address: a changed address needs the token again) and returns a
 *     normalised result (no response bodies, no cURL messages, no token);
 *   - save() re-tests the candidate and writes only when Home Assistant accepted it; the write is atomic
 *     (temporary file in the same private folder, 0600, verified, then rename) and keeps every other value
 *     (e.g. the admin password hash) exactly as it was. A failed write leaves the existing file untouched.
 */
final class HaSettings
{
    private const FILE = 'iniqdash-secrets.php';
    private const TOKEN_MIN = 20;
    private const TOKEN_MAX = 2048;
    private const URL_MAX = 300;

    /** cURL error numbers → a cause the user can act on (the numbers only; cURL's own messages are never used) */
    private const TLS_ERRNOS = [35, 51, 53, 54, 58, 59, 60, 64, 66, 77, 80, 82, 83, 90, 91];   // SSL connect / certificate / CA errors
    private const DNS_ERRNOS = [6];                                                            // could not resolve host

    /** What the settings screen may show. Never the token. */
    public static function read(): array
    {
        $ha = self::load()['ha'] ?? null;
        $ha = is_array($ha) ? $ha : [];
        $url = isset($ha['url']) && is_string($ha['url']) ? rtrim($ha['url'], '/') : '';
        $tokenSet = isset($ha['token']) && is_string($ha['token']) && strlen($ha['token']) >= self::TOKEN_MIN;
        return [
            'configured'      => HaClient::config() !== null,     // exactly what the running HA layer uses
            'url'             => $url !== '' ? $url : null,
            'tokenConfigured' => $tokenSet,
            'storage'         => Paths::privateDir() !== null,
        ];
    }

    /**
     * Normalise and validate a Home Assistant address: http(s) only, a host (name, IPv4 or [IPv6]), optional port,
     * optional path (a reverse-proxy sub-path); no user:password@, query or fragment. Trailing slashes are dropped.
     * Local addresses (192.168.x.x, homeassistant.local, localhost) are legitimate and accepted.
     */
    public static function normaliseUrl(mixed $url, ?string &$why = null): ?string
    {
        $u = is_string($url) ? trim($url) : '';
        if ($u === '') {
            $why = 'url_missing';
            return null;
        }
        if (strlen($u) > self::URL_MAX || preg_match('/[\s\x00-\x1f\x7f<>"\'\\\\]/', $u)) {
            $why = 'url_invalid';
            return null;
        }
        if (!preg_match('#^https?://#i', $u)) {
            $why = 'url_scheme';
            return null;
        }
        $p = parse_url($u);
        if (!is_array($p) || !isset($p['scheme'], $p['host']) || !in_array(strtolower($p['scheme']), ['http', 'https'], true)
            || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) {
            $why = 'url_invalid';
            return null;
        }
        $host = $p['host'];
        $ipv6 = str_starts_with($host, '[') && str_ends_with($host, ']');
        if ($ipv6 ? filter_var(substr($host, 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false
            : !preg_match('/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/', $host)) {
            $why = 'url_invalid';
            return null;
        }
        if (isset($p['port']) && ($p['port'] < 1 || $p['port'] > 65535)) {
            $why = 'url_invalid';
            return null;
        }
        $path = rtrim($p['path'] ?? '', '/');
        if ($path !== '' && !preg_match('#^(/[A-Za-z0-9._~%!$&()*+,;=:@-]+)+$#', $path)) {
            $why = 'url_invalid';
            return null;
        }
        $out = strtolower($p['scheme']) . '://' . $host . (isset($p['port']) ? ':' . $p['port'] : '') . $path;
        // HaClient::config() must accept what we store (one rule for both)
        if (!preg_match('#^https?://[^\s/]+(:\d+)?(/.*)?$#i', $out)) {
            $why = 'url_invalid';
            return null;
        }
        return $out;
    }

    private static function tokenOk(string $t): bool
    {
        return strlen($t) >= self::TOKEN_MIN && strlen($t) <= self::TOKEN_MAX && !preg_match('/[\s\x00-\x1f\x7f]/', $t);
    }

    /**
     * The candidate configuration: the URL entered + the NEW token if one was entered, else the saved token (server side).
     * @return array{cfg: ?array, error: ?string}
     */
    private static function candidate(mixed $url, mixed $token): array
    {
        $why = null;
        $u = self::normaliseUrl($url, $why);
        if ($u === null) {
            return ['cfg' => null, 'error' => $why];
        }
        $saved = self::load()['ha'] ?? [];
        $saved = is_array($saved) ? $saved : [];
        $t = is_string($token) ? trim($token) : '';
        if ($t === '') {
            $t = isset($saved['token']) && is_string($saved['token']) ? $saved['token'] : '';
            if ($t === '') {
                return ['cfg' => null, 'error' => 'token_missing'];
            }
            // The saved token is sent ONLY to the saved address. Otherwise anything that can make a signed-in request (a custom
            // widget runs in the page, not sandboxed) could test "https://elsewhere" with a blank token and receive the token as
            // the Authorization header there. A new address needs the token typed again.
            $savedUrl = self::normaliseUrl($saved['url'] ?? null);
            if ($savedUrl === null || !hash_equals($savedUrl, $u)) {
                return ['cfg' => null, 'error' => 'token_required'];
            }
        } elseif (!self::tokenOk($t)) {
            return ['cfg' => null, 'error' => 'token_invalid'];
        }
        return ['cfg' => [
            'url' => $u, 'token' => $t,
            'verify_tls' => (bool) ($saved['verify_tls'] ?? true),
            'ca_file' => isset($saved['ca_file']) ? (string) $saved['ca_file'] : null,
        ], 'error' => null];
    }

    /**
     * Test a candidate connection (nothing is saved).
     * @return array{ok: bool, error: ?string, version?: ?string, entities?: ?int, url?: string}
     *   error: url_missing | url_scheme | url_invalid | token_missing | token_required | token_invalid | auth | unreachable | dns | tls
     *          | timeout | not_home_assistant | http
     */
    public static function test(mixed $url, mixed $token): array
    {
        $c = self::candidate($url, $token);
        if ($c['cfg'] === null) {
            return ['ok' => false, 'error' => $c['error']];
        }
        return self::probe($c['cfg']) + ['url' => $c['cfg']['url']];
    }

    /** /api/config (version) — and, when that works, a cheap count of the entities (optional; never an error). */
    private static function probe(array $cfg): array
    {
        $client = new HaClient($cfg);
        $r = $client->request('GET', '/api/config', null, 6);
        if ($r['error'] !== null) {
            $errno = (int) ($r['errno'] ?? 0);
            $e = $r['error'];
            if ($e === 'unreachable' && in_array($errno, self::TLS_ERRNOS, true)) {
                $e = 'tls';
            } elseif ($e === 'unreachable' && in_array($errno, self::DNS_ERRNOS, true)) {
                $e = 'dns';
            } elseif ($e === 'http' && in_array((int) $r['status'], [404, 405], true)) {
                $e = 'not_home_assistant';
            }
            return ['ok' => false, 'error' => $e];
        }
        $b = $r['body'];
        if (!is_array($b) || !isset($b['version']) || !is_string($b['version'])) {
            return ['ok' => false, 'error' => 'not_home_assistant'];         // something answered, but not Home Assistant's API
        }
        $version = preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $b['version']) ? $b['version'] : null;
        $n = null;
        $s = $client->request('GET', '/api/states', null, 8, 16 * 1024 * 1024);
        if ($s['error'] === null && is_array($s['body']) && array_is_list($s['body'])) {
            $n = count($s['body']);
        }
        return ['ok' => true, 'error' => null, 'version' => $version, 'entities' => $n];
    }

    /**
     * Save after a successful test of the same candidate (checked here again: the server never stores a connection
     * Home Assistant did not accept). Returns the new read() (never the token).
     * @return array{ok: bool, error: ?string, settings?: array, version?: ?string, entities?: ?int}
     *   error: as test(), plus storage_unavailable | write_failed
     */
    public static function save(mixed $url, mixed $token): array
    {
        $c = self::candidate($url, $token);
        if ($c['cfg'] === null) {
            return ['ok' => false, 'error' => $c['error']];
        }
        $t = self::probe($c['cfg']);
        if (!$t['ok']) {
            return $t;
        }
        $dir = Paths::privateDir();
        if ($dir === null) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        $file = $dir . DIRECTORY_SEPARATOR . self::FILE;
        $data = self::load();
        $ha = isset($data['ha']) && is_array($data['ha']) ? $data['ha'] : [];
        $ha['url'] = $c['cfg']['url'];
        $ha['token'] = $c['cfg']['token'];
        $data['ha'] = $ha;                                       // every other key (admin, …) is kept as it is
        if (!self::write($file, $data)) {
            return ['ok' => false, 'error' => 'write_failed'];
        }
        // cached Home Assistant data belongs to the previous connection
        if (IQ_VAR !== null) {
            foreach (glob(IQ_VAR . '/cache/ha_*.json') ?: [] as $f) {
                @unlink($f);
            }
        }
        iq_log('ha_settings_saved', ['host' => (string) parse_url($c['cfg']['url'], PHP_URL_HOST), 'token_changed' => is_string($token) && trim($token) !== '']);
        return ['ok' => true, 'error' => null, 'version' => $t['version'], 'entities' => $t['entities']];
    }

    /** The settings file as it is on disk NOW (not the per-request cache), or [] when there is none. */
    private static function load(): array
    {
        $dir = Paths::privateDir();
        $f = $dir !== null ? $dir . DIRECTORY_SEPARATOR . self::FILE : null;
        if ($f === null || !is_file($f) || !is_readable($f)) {
            return [];
        }
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate($f, true);
        }
        $v = (static fn ($path) => require $path)($f);
        return is_array($v) ? $v : [];
    }

    /** Atomic replace: temp file next to the target (0600), read back and compared, then rename(). */
    public static function write(string $file, array $data): bool
    {
        $php = "<?php\n// IniqDash private settings. Outside the web root. Never commit, never copy into the site folder.\nreturn "
            . var_export($data, true) . ";\n";
        $tmp = dirname($file) . DIRECTORY_SEPARATOR . '.iniqdash-secrets.' . bin2hex(random_bytes(6)) . '.tmp';
        $old = umask(0077);
        try {
            if (@file_put_contents($tmp, $php, LOCK_EX) !== strlen($php)) {
                @unlink($tmp);
                return false;
            }
            @chmod($tmp, 0600);
            if (function_exists('opcache_invalidate')) {
                @opcache_invalidate($tmp, true);
            }
            $check = (static fn ($path) => require $path)($tmp);
            if ($check !== $data) {                                // what will be loaded is exactly what we meant
                @unlink($tmp);
                return false;
            }
            if (!@rename($tmp, $file)) {
                @unlink($tmp);
                return false;
            }
            @chmod($file, 0600);
            if (function_exists('opcache_invalidate')) {
                @opcache_invalidate($file, true);
            }
            return true;
        } finally {
            umask($old);
        }
    }
}
