<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
declare(strict_types=1);

/**
 * THE INIQDASH DEMO ON A NEW INSTALLATION (assets/demo/iniqdash-demo.json — five pages of the simulated home): the first time the
 * dashboard list of a NEW installation is read, the demo is added as a dashboard and becomes the default dashboard, so a new user
 * starts on its Home page instead of an empty screen.
 *
 * Decided ONCE per installation and recorded in <private>/demo.json:
 *   - a new installation (no dashboard, no Widget Studio widget, never set up before): the demo is added and made the default;
 *   - an existing installation (anything of the above exists): nothing is added or changed — the demo stays available from
 *     Dashboards → "Add the INIQDASH demo";
 *   - once recorded, never again: a demo the user deletes does not come back.
 * INIQDASH_DEMO_INSTALL=off turns it off (the test suite's throwaway installations, unless a test asks for it).
 */
require_once __DIR__ . '/Dashboards.php';
require_once __DIR__ . '/StudioWidgets.php';

final class DemoInstall
{
    public const NAME = 'INIQDASH demo';
    private const MAX = 2 * 1024 * 1024;

    private static function marker(): ?string
    {
        $p = Paths::privateDir();
        return $p === null ? null : $p . DIRECTORY_SEPARATOR . 'demo.json';
    }

    /** → ['added' => id] | ['existing' => true] | [] (nothing to do, or not possible here) */
    public static function ensure(): array
    {
        $m = self::marker();
        if (getenv('INIQDASH_DEMO_INSTALL') === 'off' || $m === null || is_file($m) || Dashboards::dir() === null) {
            return [];
        }
        $h = @fopen($m . '.lock', 'c');
        if ($h === false || !flock($h, LOCK_EX | LOCK_NB)) {
            return [];
        }
        try {
            clearstatcache(true, $m);
            if (is_file($m)) {
                return [];
            }
            $p = (string) Paths::privateDir();
            // anything that shows this installation was used before: dashboards, Studio widgets, the earlier showcase marker
            $used = Dashboards::list() !== [] || (StudioWidgets::dir() !== null && StudioWidgets::list() !== []) || is_file($p . DIRECTORY_SEPARATOR . 'showcase.json');
            if ($used) {
                self::write($m, ['format' => 1, 'existing' => true, 'at' => gmdate('c')]);
                return ['existing' => true];
            }
            $raw = @file_get_contents(dirname(__DIR__) . '/assets/demo/iniqdash-demo.json', false, null, 0, self::MAX + 1);
            $model = is_string($raw) && strlen($raw) <= self::MAX ? json_decode($raw, false, 128) : null;
            $r = is_object($model) ? Dashboards::create(self::NAME, $model, true) : ['ok' => false, 'error' => 'unreadable'];
            if (!$r['ok']) {
                // recorded: an installation that cannot take it is not retried on every page load
                self::write($m, ['format' => 1, 'error' => (string) ($r['error'] ?? 'failed'), 'at' => gmdate('c')]);
                return ['error' => (string) ($r['error'] ?? 'failed')];
            }
            $id = $r['entry']['id'];
            if ((Dashboards::settings()['default'] ?? null) === null) {
                Dashboards::setSettings(['default' => $id]);
            }
            self::write($m, ['format' => 1, 'added' => $id, 'at' => gmdate('c')]);
            return ['added' => $id];
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }

    private static function write(string $file, array $data): void
    {
        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        $old = umask(0077);
        try {
            $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
            if (is_string($json) && @file_put_contents($tmp, $json) === strlen($json)) {
                @rename($tmp, $file);
            } else {
                @unlink($tmp);
            }
        } finally {
            umask($old);
        }
    }
}
