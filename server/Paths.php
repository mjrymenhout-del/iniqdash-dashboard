<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Locates IniqDash's PRIVATE folder: everything that must never be served by the web server.
 *
 *   <private>/iniqdash-secrets.php   administrator account (password HASH); later the HA URL + token
 *   <private>/var/                   sessions, login rate limits, log
 *
 * Resolution order: environment variable INIQDASH_PRIVATE, then server/local.php
 * ['private_dir' => '/absolute/path'] (written by server/setup.php).
 *
 * Refused when it lies inside the IniqDash folder, inside the folder above it (the site's web
 * root when IniqDash is a sub-folder), or inside the web server's DOCUMENT_ROOT.
 */
final class Paths
{
    private static ?string $dir = null;
    private static bool $resolved = false;
    private static ?string $problem = null;

    public static function privateDir(): ?string
    {
        if (self::$resolved) {
            return self::$dir;
        }
        self::$resolved = true;
        $dir = getenv('INIQDASH_PRIVATE');
        if (!is_string($dir) || $dir === '') {
            $dir = (string) (iq_local()['private_dir'] ?? '');
        }
        if ($dir === '') {
            // not configured (a fresh install — or an update that replaced the folder and lost server/local.php): an EXISTING private
            // folder in one of the places the browser setup uses is found again, so an update never looks like a new installation
            $dir = self::existing() ?? '';
        }
        if ($dir === '') {
            self::$problem = 'not_set';
            return null;
        }
        if (!str_starts_with($dir, '/') && !preg_match('#^[A-Za-z]:[\\\\/]#', $dir)) {
            $dir = APP_ROOT . '/' . $dir;
        }
        $real = @realpath($dir);
        if ($real === false || !@is_dir($real)) {
            self::$problem = ini_get('open_basedir') ? 'not_accessible' : 'not_found';
            return null;
        }
        if (self::isInsidePublic($real)) {
            self::$problem = 'inside_web_root';
            return null;
        }
        self::$dir = $real;
        return $real;
    }

    /**
     * The places the browser setup may have created the private folder in (server/FirstRun.php uses the same list, in this order):
     * beside the site's folder, each folder PHP may use (open_basedir), the home folder — each as "iniqdash-private".
     * @return list<string>
     */
    public static function candidates(): array
    {
        $out = [dirname(APP_ROOT, 2) . DIRECTORY_SEPARATOR . 'iniqdash-private'];
        foreach (array_filter(explode(PATH_SEPARATOR, (string) ini_get('open_basedir'))) as $base) {
            $b = rtrim($base, '/\\');
            // never the system's temporary folder (cleared, shared) or system folders
            if ($b !== '' && $b !== '/tmp' && $b !== rtrim(sys_get_temp_dir(), '/\\') && !str_starts_with($b, '/usr') && !str_starts_with($b, '/var/lib') && !str_starts_with($b, '/proc')) {
                $out[] = $b . DIRECTORY_SEPARATOR . 'iniqdash-private';
            }
        }
        $home = getenv('HOME');
        if (is_string($home) && $home !== '' && $home !== '/') {
            $out[] = rtrim($home, '/') . DIRECTORY_SEPARATOR . 'iniqdash-private';
        }
        return array_values(array_unique($out));
    }

    /** an existing private folder (it holds the secrets file) in one of the candidate places, outside the web site — or null */
    private static function existing(): ?string
    {
        foreach (self::candidates() as $c) {
            $real = @realpath($c);
            if ($real !== false && @is_file($real . DIRECTORY_SEPARATOR . 'iniqdash-secrets.php') && !self::isInsidePublic($real)) {
                return $real;
            }
        }
        return null;
    }

    /** Why privateDir() returned null (short code, safe to show). */
    public static function problem(): ?string
    {
        self::privateDir();
        return self::$problem;
    }

    public static function isInsidePublic(string $path): bool
    {
        $path = self::norm($path);
        $roots = [APP_ROOT, dirname(APP_ROOT)];
        $doc = $_SERVER['DOCUMENT_ROOT'] ?? '';
        if (is_string($doc) && $doc !== '') {
            $roots[] = $doc;
        }
        foreach ($roots as $root) {
            $r = @realpath($root);
            if ($r !== false && str_starts_with($path . '/', self::norm($r) . '/')) {
                return true;
            }
        }
        return false;
    }

    private static function norm(string $p): string
    {
        $p = rtrim(str_replace('\\', '/', $p), '/');
        return PHP_OS_FAMILY === 'Windows' ? strtolower($p) : $p;
    }
}
