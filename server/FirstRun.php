<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

require_once __DIR__ . '/ha/HaSettings.php';
require_once __DIR__ . '/Dashboards.php';
require_once __DIR__ . '/DemoInstall.php';

/**
 * FIRST-RUN SETUP through the browser (setup.php + the wizard in the application). The SSH route (php server/setup.php) keeps working.
 *
 *   Step 1  setup.php: the administrator account. Offered ONLY while there is no account at all (no private folder configured, or no
 *           secrets file yet) — never for an installation that has one, never for a broken one (a misplaced private folder, a
 *           damaged account: those keep their own messages and the SSH route). The account is written under a lock, re-checked
 *           inside it (two simultaneous first visitors: exactly one wins), with the same hashing as the SSH setup.
 *   2–4     the application: Home Assistant (test, save — HaSettings), the dashboard (the generator), finish. Shown only while the
 *           secrets say setup.state = 'pending' — which only a browser setup writes. An installation set up before this version,
 *           or over SSH, has no such state: it is never sent through the wizard.
 *   Finish  one server request: the dashboard is created, made the default and setup is marked done — or nothing remains
 *           (the dashboard is deleted again when a later part fails). The demo choice does the same with the official demo.
 *
 * The new administrator is signed in by a ONE-TIME ticket: random, kept only as a hash in the secrets file, valid 10 minutes, sent to
 * the creating browser alone (an HttpOnly cookie) and deleted when used.
 */
final class Setup
{
    public const TICKET_COOKIE = 'iniqdash_setup';
    private const TICKET_TTL = 600;
    private const FILE = 'iniqdash-secrets.php';
    private const USER_RE = '/^[A-Za-z0-9._@-]{3,64}$/';

    /** May step 1 (create the administrator) be offered? */
    public static function allowed(): bool
    {
        return in_array(Auth::problem(), ['private_dir_not_set', 'account_missing'], true);
    }

    /** Is the wizard (steps 2–4) still to be completed? */
    public static function pending(): bool
    {
        $s = self::load()['setup'] ?? null;
        return is_array($s) && ($s['state'] ?? null) === 'pending';
    }

    /** where the private folder is / will be: the configured one, else next to the site folder (like the SSH setup) */
    private static function target(): string
    {
        $have = Paths::privateDir();
        if ($have !== null) {
            return $have;
        }
        $cfg = getenv('INIQDASH_PRIVATE');
        if (!is_string($cfg) || $cfg === '') {
            $cfg = (string) (iq_local()['private_dir'] ?? '');
        }
        return $cfg !== '' ? $cfg : dirname(APP_ROOT, 2) . DIRECTORY_SEPARATOR . 'iniqdash-private';
    }

    /** the secrets file as it is on disk NOW (never the per-request cache) */
    private static function load(?string $dir = null): array
    {
        $dir = $dir ?? Paths::privateDir();
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

    /**
     * Step 1. → ['ok' => true, 'ticket' => …] | ['ok' => false, 'error' => code]
     *   errors: already_set_up · user_invalid · password_short · password_long · password_mismatch · storage_unavailable · inside_web_root ·
     *           write_failed · local_not_writable · busy
     */
    public static function createAdmin(string $user, string $password, string $repeat): array
    {
        if (!self::allowed()) {
            return ['ok' => false, 'error' => 'already_set_up'];
        }
        if (!preg_match(self::USER_RE, $user)) {
            return ['ok' => false, 'error' => 'user_invalid'];
        }
        if (strlen($password) < 12) {
            return ['ok' => false, 'error' => 'password_short'];
        }
        if (strlen($password) > 1024) {
            return ['ok' => false, 'error' => 'password_long'];
        }
        if (!hash_equals($password, $repeat)) {
            return ['ok' => false, 'error' => 'password_mismatch'];
        }
        $real = self::usableDir();
        if (is_array($real)) {
            return $real;                                   // ['ok' => false, 'error' => …]
        }
        @chmod($real, 0700);
        $lock = @fopen($real . DIRECTORY_SEPARATOR . '.setup.lock', 'c');
        if ($lock === false) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        if (!flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            return ['ok' => false, 'error' => 'busy'];
        }
        try {
            // inside the lock, from disk: another visitor may have finished a moment ago
            $data = self::load($real);
            if (!empty($data['admin']['hash'])) {
                return ['ok' => false, 'error' => 'already_set_up'];
            }
            foreach (['var', 'var/sessions', 'var/ratelimit', 'var/log', 'var/cache'] as $d) {
                if (!is_dir($real . '/' . $d)) {
                    @mkdir($real . '/' . $d, 0700, true);
                }
            }
            $ticket = bin2hex(random_bytes(32));
            $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
            $data['admin'] = ['user' => $user, 'hash' => password_hash($password, $algo)];
            $data['setup'] = ['state' => 'pending', 'since' => gmdate('c'), 'ticket' => hash('sha256', $ticket), 'until' => time() + self::TICKET_TTL];
            $file = $real . DIRECTORY_SEPARATOR . self::FILE;
            $existed = is_file($file);
            if (!HaSettings::write($file, $data)) {
                return ['ok' => false, 'error' => 'write_failed'];
            }
            // the application must find the private folder from now on: server/local.php (kept: every other key in it)
            if (Paths::privateDir() === null && (getenv('INIQDASH_PRIVATE') === false || getenv('INIQDASH_PRIVATE') === '')) {
                if (!self::writeLocal(['private_dir' => $real])) {
                    if (!$existed) {
                        @unlink($file);                          // nothing half-made: no account the application cannot find
                    }
                    return ['ok' => false, 'error' => 'local_not_writable'];
                }
            }
            return ['ok' => true, 'ticket' => $ticket, 'dir' => $real];
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * The private folder for a NEW installation, chosen without asking anything: the configured one when there is one; otherwise the
     * first of these that is outside the web site and can be created and written by PHP —
     *   1. "iniqdash-private" two folders above IniqDash (beside the site's folder, as the SSH setup does);
     *   2. "iniqdash-private" in each folder the host allows PHP to reach (open_basedir) that is outside the web site;
     *   3. "iniqdash-private" in the hosting account's home folder.
     * A shared host often limits PHP to the account or the site (open_basedir): the first place may be refused there.
     * @return string|array{ok:false, error:string}  the real path, or the reason none could be used
     */
    private static function usableDir(): string|array
    {
        if (Paths::privateDir() !== null || (getenv('INIQDASH_PRIVATE') ?: '') !== '' || (string) (iq_local()['private_dir'] ?? '') !== '') {
            $cand = [self::target()];
        } else {
            $cand = Paths::candidates();
        }
        $why = 'storage_unavailable';
        foreach (array_unique($cand) as $dir) {
            $parent = @realpath(dirname($dir));
            if ($parent === false || Paths::isInsidePublic($parent . DIRECTORY_SEPARATOR . 'x')) {
                $why = $parent === false ? $why : 'inside_web_root';
                continue;
            }
            if (!@is_dir($dir) && !@mkdir($dir, 0700, true)) {
                continue;
            }
            $real = @realpath($dir);
            if ($real === false || !@is_writable($real)) {
                continue;
            }
            if (Paths::isInsidePublic($real)) {
                $why = 'inside_web_root';
                continue;
            }
            return $real;
        }
        return ['ok' => false, 'error' => $why];
    }

    /** server/local.php: merge keys in, atomically */
    private static function writeLocal(array $patch): bool
    {
        $f = __DIR__ . DIRECTORY_SEPARATOR . 'local.php';
        $cur = is_file($f) ? (static fn ($p) => require $p)($f) : [];
        $cur = is_array($cur) ? $cur : [];
        $php = "<?php\n// Where IniqDash's private folder is (not secret). Written by the setup.\nreturn " . var_export(array_merge($cur, $patch), true) . ";\n";
        $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, $php, LOCK_EX) !== strlen($php)) {
            @unlink($tmp);
            return false;
        }
        if (!@rename($tmp, $f)) {
            @unlink($tmp);
            return false;
        }
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate($f, true);
        }
        return true;
    }

    /** The administrator's name when this browser's ticket is valid (the ticket is then used up), else null. */
    public static function redeem(?string $ticket): ?string
    {
        if (!is_string($ticket) || !preg_match('/^[0-9a-f]{64}$/', $ticket)) {
            return null;
        }
        $dir = Paths::privateDir();
        if ($dir === null) {
            return null;
        }
        $data = self::load($dir);
        $s = $data['setup'] ?? null;
        if (!is_array($s) || !is_string($s['ticket'] ?? null) || (int) ($s['until'] ?? 0) < time() || !hash_equals($s['ticket'], hash('sha256', $ticket))) {
            return null;
        }
        unset($data['setup']['ticket'], $data['setup']['until']);
        if (!HaSettings::write($dir . DIRECTORY_SEPARATOR . self::FILE, $data)) {
            return null;
        }
        return is_string($data['admin']['user'] ?? null) ? $data['admin']['user'] : null;
    }

    private static function markDone(string $how): bool
    {
        $dir = Paths::privateDir();
        if ($dir === null) {
            return false;
        }
        $data = self::load($dir);
        $data['setup'] = ['state' => 'done', 'how' => $how, 'at' => gmdate('c')];
        return HaSettings::write($dir . DIRECTORY_SEPARATOR . self::FILE, $data);
    }

    /** Finish: create the generated dashboard, make it the default, mark setup done — all or nothing. */
    public static function finish(mixed $name, mixed $model): array
    {
        if (!self::pending()) {
            return ['ok' => false, 'error' => 'not_pending'];
        }
        $r = Dashboards::create($name, $model, true);
        if (!($r['ok'] ?? false)) {
            return $r;
        }
        $id = $r['entry']['id'];
        $before = Dashboards::settings()['default'] ?? null;
        $d = Dashboards::setSettings(['default' => $id]);
        if (!($d['ok'] ?? false)) {
            Dashboards::delete($id);
            return ['ok' => false, 'error' => 'write_failed'];
        }
        if (!self::markDone('generated')) {
            Dashboards::setSettings(['default' => $before]);
            Dashboards::delete($id);
            return ['ok' => false, 'error' => 'write_failed'];
        }
        iq_log('setup_finished', ['how' => 'generated']);
        return ['ok' => true, 'entry' => $r['entry']];
    }

    /** Finish with the official demo (simulated, isolated from Home Assistant): it is installed when missing, made the default. */
    public static function demo(): array
    {
        if (!self::pending()) {
            return ['ok' => false, 'error' => 'not_pending'];
        }
        DemoInstall::ensure();
        $id = null;
        foreach (Dashboards::list() as $e) {
            if (($e['name'] ?? '') === DemoInstall::NAME) {
                $id = $e['id'];
                break;
            }
        }
        $created = false;
        if ($id === null) {
            $raw = @file_get_contents(dirname(__DIR__) . '/assets/demo/iniqdash-demo.json');
            $model = is_string($raw) ? json_decode($raw, false, 128) : null;
            $r = is_object($model) ? Dashboards::create(DemoInstall::NAME, $model, true) : ['ok' => false, 'error' => 'unreadable'];
            if (!($r['ok'] ?? false)) {
                return ['ok' => false, 'error' => (string) ($r['error'] ?? 'failed')];
            }
            $id = $r['entry']['id'];
            $created = true;
        }
        $before = Dashboards::settings()['default'] ?? null;
        $d = Dashboards::setSettings(['default' => $id]);
        if (!($d['ok'] ?? false) || !self::markDone('demo')) {
            Dashboards::setSettings(['default' => $before]);
            if ($created) {
                Dashboards::delete($id);
            }
            return ['ok' => false, 'error' => 'write_failed'];
        }
        iq_log('setup_finished', ['how' => 'demo']);
        return ['ok' => true, 'entry' => ['id' => $id, 'name' => DemoInstall::NAME]];
    }
}
