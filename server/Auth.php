<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * IniqDash access protection: one administrator account, server-side sessions, CSRF tokens and
 * login rate limiting. Nothing here is ever sent to the browser except the session cookie
 * (HttpOnly) and the per-session CSRF token.
 *
 * The account lives in <private>/iniqdash-secrets.php:
 *   return ['admin' => ['user' => 'name', 'hash' => '<password_hash() output>']];
 * Only the HASH is stored; server/setup.php creates it. The password itself is never stored.
 */
final class Auth
{
    private static array $cfg = [];
    private static ?array $admin = null;
    private static ?string $problem = null;
    private static bool $started = false;

    public static function boot(array $cfg): void
    {
        self::$cfg = $cfg;
        self::$admin = null;
        $dir = Paths::privateDir();
        if ($dir === null) {
            self::$problem = 'private_dir_' . (Paths::problem() ?? 'unknown');
            return;
        }
        $data = iq_secrets();
        if ($data === []) {
            self::$problem = 'account_missing';
            return;
        }
        $a = is_array($data) ? ($data['admin'] ?? null) : null;
        if (!is_array($a) || !is_string($a['user'] ?? null) || $a['user'] === '' || !is_string($a['hash'] ?? null) || !str_starts_with($a['hash'], '$')) {
            self::$problem = 'account_invalid';
            return;
        }
        self::$admin = ['user' => $a['user'], 'hash' => $a['hash']];
    }

    /** null when IniqDash is ready to sign in; otherwise a short reason code (safe to show). */
    public static function problem(): ?string
    {
        return self::$admin === null ? (self::$problem ?? 'account_missing') : null;
    }

    /* ------------------------------------------------------------------ sessions */

    /**
     * @param bool $write false = read the session and release its lock at once (static files,
     *                    so parallel asset requests are not serialised)
     */
    public static function startSession(bool $write = true): void
    {
        if (self::$started || IQ_VAR === null) {
            return;
        }
        self::$started = true;
        $https = iq_https();
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.gc_maxlifetime', (string) self::$cfg['absolute_timeout']);
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        session_save_path(IQ_VAR . '/sessions');
        session_name($https ? '__Host-iniqdash' : 'iniqdash_sid');
        session_set_cookie_params([
            'lifetime' => 0,                      // a browser-session cookie; the server enforces expiry
            'path'     => $https ? '/' : iq_base(), // __Host- cookies must use path "/"
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax',                  // sent on normal navigation, never on cross-site POSTs
        ]);
        session_start($write ? [] : ['read_and_close' => true]);
    }

    /**
     * The signed-in administrator, or null. Expired sessions (idle or absolute) are destroyed here.
     * @param bool $touch record activity (pages and API calls; not every image)
     */
    public static function user(bool $touch = false): ?string
    {
        $u = $_SESSION['iq_user'] ?? null;
        if (!is_string($u) || self::$admin === null || !hash_equals(self::$admin['user'], $u)) {
            return null;
        }
        $now = time();
        $seen = (int) ($_SESSION['iq_seen'] ?? 0);
        $since = (int) ($_SESSION['iq_since'] ?? 0);
        if ($now - $seen > self::$cfg['idle_timeout'] || $now - $since > self::$cfg['absolute_timeout']) {
            self::$expired = true;
            if (session_status() === PHP_SESSION_ACTIVE) {
                $_SESSION = [];                    // the expired session is wiped on the server
                session_regenerate_id(true);       // and its id retired (the old session file is deleted)
            }
            return null;
        }
        if ($touch && session_status() === PHP_SESSION_ACTIVE && $now - $seen > 30) {
            $_SESSION['iq_seen'] = $now;
        }
        return $u;
    }

    public static bool $expired = false;

    public static function csrfToken(): string
    {
        if (empty($_SESSION['iq_csrf']) && session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION['iq_csrf'] = bin2hex(random_bytes(32));
        }
        return (string) ($_SESSION['iq_csrf'] ?? '');
    }

    public static function checkCsrf(?string $token): bool
    {
        $mine = (string) ($_SESSION['iq_csrf'] ?? '');
        return is_string($token) && $token !== '' && $mine !== '' && hash_equals($mine, $token);
    }

    /** State-changing requests must come from this site: Origin (or Referer) must match Host. */
    public static function sameOrigin(): bool
    {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
        if ($host === '' || $origin === '' || $origin === 'null') {
            return false;
        }
        $h = parse_url($origin, PHP_URL_HOST);
        $p = parse_url($origin, PHP_URL_PORT);
        return is_string($h) && strcasecmp($h . ($p ? ':' . $p : ''), $host) === 0;
    }

    /* ------------------------------------------------------------------ login / logout */

    /**
     * @return true | 'locked:<seconds>' | false
     *
     * Rate limits (sliding window, files in var/ratelimit):
     *   - per visitor address (iq_client_ip(): behind a TRUSTED proxy the real client, never the proxy for everyone);
     *   - per account name — but a browser that signed in successfully before (a RECOGNISED DEVICE, see below) is limited per device
     *     instead, so a stranger guessing passwords cannot lock the owner out. Responses are the same whether or not the name exists.
     */
    public static function attemptLogin(string $user, string $password): bool|string
    {
        $ipKey = 'ip_' . hash('sha256', iq_client_ip() !== '' ? iq_client_ip() : 'cli');
        $acKey = 'ac_' . hash('sha256', strtolower($user));
        $device = self::knownDevice();
        $win = (int) self::$cfg['login_window'];
        $keys = [[$ipKey, (int) self::$cfg['login_max_per_ip']],
            $device !== null ? ['dv_' . $device, (int) self::$cfg['login_max_per_ip']] : [$acKey, (int) self::$cfg['login_max_per_account']]];
        foreach ($keys as [$k, $max]) {
            $wait = self::lockedFor($k, $max, $win);
            if ($wait > 0) {
                iq_log('login_locked');
                return 'locked:' . $wait;
            }
        }
        if (self::$admin === null) {
            return false;
        }
        // The password is always verified (same work whether or not the name is right).
        $passOk = password_verify($password, self::$admin['hash']);
        $ok = hash_equals(self::$admin['user'], $user) && $passOk;
        if (!$ok) {
            foreach ($keys as [$k]) {
                self::record($k, $win);
            }
            usleep(random_int(300000, 600000));     // slow down guessing; also hides timing
            iq_log('login_failed');
            return false;
        }
        session_regenerate_id(true);               // new session id: a planted id is worthless
        $_SESSION = [];
        $_SESSION['iq_user'] = self::$admin['user'];
        $_SESSION['iq_since'] = $_SESSION['iq_seen'] = time();
        $_SESSION['iq_csrf'] = bin2hex(random_bytes(32));
        @unlink(self::rateFile($ipKey));
        self::rememberDevice($device);
        iq_log('login_ok');
        return true;
    }

    /**
     * FIRST RUN only (server/FirstRun.php): the administrator who has just created the account is signed in without typing the password
     * again. Called only after Setup has verified the one-time setup ticket of this browser. Same session hardening as a normal login.
     */
    public static function signInAfterSetup(string $user): bool
    {
        if (self::$admin === null || !hash_equals(self::$admin['user'], $user) || session_status() !== PHP_SESSION_ACTIVE) {
            return false;
        }
        session_regenerate_id(true);
        $_SESSION = [];
        $_SESSION['iq_user'] = self::$admin['user'];
        $_SESSION['iq_since'] = $_SESSION['iq_seen'] = time();
        $_SESSION['iq_csrf'] = bin2hex(random_bytes(32));
        iq_log('setup_signed_in');
        return true;
    }

    /* ------------------------------------------------------------------ recognised devices (lockout protection only) */

    private const DEVICE_DAYS = 180;
    private const DEVICE_MAX = 50;

    private static function deviceCookie(): string
    {
        return iq_https() ? '__Host-iniqdash_device' : 'iniqdash_device';
    }

    private static function deviceFile(): string
    {
        return IQ_VAR . '/devices.json';
    }

    /** @param callable(array<string,int>):array<string,int> $fn  read-modify-write under a lock; returns the new list */
    private static function devices(?callable $fn = null): array
    {
        if (IQ_VAR === null) {
            return [];
        }
        $fh = @fopen(self::deviceFile(), 'c+');
        if ($fh === false) {
            return [];
        }
        flock($fh, $fn ? LOCK_EX : LOCK_SH);
        $list = json_decode((string) stream_get_contents($fh), true);
        $list = is_array($list) ? array_filter($list, static fn ($t, $h) => is_int($t) && $t > time() - self::DEVICE_DAYS * 86400 && preg_match('/^[0-9a-f]{64}$/', (string) $h), ARRAY_FILTER_USE_BOTH) : [];
        if ($fn !== null) {
            $list = $fn($list);
            arsort($list);
            $list = array_slice($list, 0, self::DEVICE_MAX, true);
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($list));
        }
        flock($fh, LOCK_UN);
        fclose($fh);
        @chmod(self::deviceFile(), 0600);
        return $list;
    }

    /** The hash of this browser's device cookie when the server issued it after a successful sign-in, else null. */
    private static function knownDevice(): ?string
    {
        $c = $_COOKIE[self::deviceCookie()] ?? null;
        if (!is_string($c) || !preg_match('/^[0-9a-f]{64}$/', $c)) {
            return null;
        }
        $h = hash('sha256', $c);
        return isset(self::devices()[$h]) ? $h : null;
    }

    /** After a successful sign-in: (re)issue the device cookie; the server stores only its hash. It grants no access by itself. */
    private static function rememberDevice(?string $old): void
    {
        $token = bin2hex(random_bytes(32));
        $new = hash('sha256', $token);
        self::devices(static function (array $list) use ($old, $new) {
            if ($old !== null) {
                unset($list[$old]);
            }
            $list[$new] = time();
            return $list;
        });
        $https = iq_https();
        setcookie(self::deviceCookie(), $token, ['expires' => time() + self::DEVICE_DAYS * 86400, 'path' => $https ? '/' : iq_base(),
            'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    }

    /** Sign out: the session is destroyed on the server and its cookie removed. */
    public static function destroy(): void
    {
        $_SESSION = [];
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => $p['samesite']]);
        session_destroy();
    }

    /* ------------------------------------------------------------------ rate limit (sliding window, files) */

    private static function rateFile(string $key): string
    {
        return IQ_VAR . '/ratelimit/' . $key . '.json';
    }

    /** @return array<int> recent failure times */
    private static function events(string $key, int $win, ?int $add = null): array
    {
        $fh = @fopen(self::rateFile($key), 'c+');
        if ($fh === false) {
            return [];
        }
        flock($fh, LOCK_EX);
        $ev = json_decode((string) stream_get_contents($fh), true);
        $now = time();
        $ev = array_values(array_filter(is_array($ev) ? $ev : [], static fn ($t) => is_int($t) && $t > $now - $win));
        if ($add !== null) {
            $ev[] = $add;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($ev));
        flock($fh, LOCK_UN);
        fclose($fh);
        return $ev;
    }

    private static function record(string $key, int $win): void
    {
        self::events($key, $win, time());
    }

    /** Seconds until another attempt is allowed (0 = allowed). */
    private static function lockedFor(string $key, int $max, int $win): int
    {
        $ev = self::events($key, $win);
        if (count($ev) < $max) {
            return 0;
        }
        sort($ev);
        return max(1, $ev[count($ev) - $max] + $win - time());
    }
}
