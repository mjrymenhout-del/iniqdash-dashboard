<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Server-side dashboard storage (private, file per dashboard, no database).
 *
 *   <private>/dashboards/<id>.json      { format: 1, id, name, created, updated, revision, dashboard: <model> }
 *
 * - id        "d" + 16 hex characters (random). Chosen by the server; never derived from the name; never changes
 *             (rename only changes `name`). The browser only ever sends ids matching ID — no path is ever accepted.
 * - name      display name, plain text (rendered as text by the browser), 1–60 characters, unique
 *             case-insensitively (so "Open" / the list are never ambiguous).
 * - revision  an integer, +1 on every save (optimistic concurrency): a save names the revision it was based on and
 *             is refused with "conflict" when the stored one is newer — another device's work is never overwritten.
 * - dashboard the editor's model (MaisonModel, version ≤ MODEL_VERSION). The complete schema is validated by the
 *             editor's own validator (components/editor/model.js — the one Import uses) before anything is sent;
 *             the server checks independently that it is a dashboard-shaped JSON object within the limits and free
 *             of markup / reserved keys (it never stores arbitrary JSON).
 * Limits    MAX_BYTES = 2 MiB of JSON per dashboard (uploaded images are references — api/asset.php?id=… — never
 *             embedded), MAX_DASHBOARDS = 200.
 * Writes    under one lock (flock on <private>/dashboards/.lock): temporary file in the same folder (0600), read back
 *             and compared, then rename() over the old file. A failed write leaves the previous file untouched;
 *             temporary files are removed.
 */
final class Dashboards
{
    public const MAX_BYTES = 2 * 1024 * 1024;
    public const MAX_DASHBOARDS = 200;
    public const MODEL_VERSION = 3;
    public const ID = '/^d[0-9a-f]{16}$/';
    private const NAME_MAX = 60;
    private const DEPTH = 16;

    /** <private>/dashboards (created 0700), or null. */
    public static function dir(): ?string
    {
        $p = Paths::privateDir();
        if ($p === null) {
            return null;
        }
        $d = $p . DIRECTORY_SEPARATOR . 'dashboards';
        if (!is_dir($d) && !@mkdir($d, 0700, true) && !is_dir($d)) {
            return null;
        }
        return $d;
    }

    private static function file(string $dir, string $id): string
    {
        return $dir . DIRECTORY_SEPARATOR . $id . '.json';
    }

    /* ------------------------------------------------------------------ reads */

    /** [{ id, name, updated, revision }] sorted by name. Unreadable files are skipped (never deleted). */
    public static function list(): array
    {
        $dir = self::dir();
        if ($dir === null) {
            return [];
        }
        $out = [];
        foreach (glob($dir . DIRECTORY_SEPARATOR . 'd*.json') ?: [] as $f) {
            $id = basename($f, '.json');
            if (!preg_match(self::ID, $id)) {
                continue;
            }
            $e = self::readFile($f);
            if ($e === null) {
                continue;
            }
            $out[] = ['id' => $id, 'name' => $e['name'], 'updated' => $e['updated'], 'revision' => $e['revision']];
        }
        usort($out, static fn ($a, $b) => strcasecmp($a['name'], $b['name']) ?: strcmp($a['id'], $b['id']));
        return $out;
    }

    /** One dashboard { id, name, created, updated, revision, dashboard } or null with $why (not_found | corrupt). */
    public static function get(mixed $id, ?string &$why = null): ?array
    {
        if (!is_string($id) || !preg_match(self::ID, $id)) {
            $why = 'not_found';
            return null;
        }
        $dir = self::dir();
        $f = $dir !== null ? self::file($dir, $id) : null;
        if ($f === null || !is_file($f)) {
            $why = 'not_found';
            return null;
        }
        $e = self::readFile($f);
        if ($e === null) {
            $why = 'corrupt';                                  // kept on disk as it is (never replaced or emptied)
            return null;
        }
        return $e;
    }

    /** LIVE SYNC (a viewing screen asks every few seconds whether its dashboard was saved elsewhere): the revision only, read from the
        START of the file (store() writes revision before the dashboard, and every string in it is JSON-escaped, so the sequence below
        can only be the real field). A few hundred bytes, never the whole dashboard. null: no such dashboard. */
    public static function revisionOf(mixed $id): ?int
    {
        if (!is_string($id) || !preg_match(self::ID, $id)) {
            return null;
        }
        $dir = self::dir();
        $f = $dir !== null ? self::file($dir, $id) : null;
        if ($f === null || !is_file($f)) {
            return null;
        }
        $h = @fopen($f, 'rb');
        if ($h === false) {
            return null;
        }
        $head = (string) fread($h, 4096);
        fclose($h);
        if (preg_match('/,"revision":(\d{1,9}),"dashboard":/', $head, $m)) {
            return (int) $m[1];
        }
        $e = self::readFile($f);                       // an older file layout: read it whole (rare)
        return $e !== null ? $e['revision'] : null;
    }

    private static function readFile(string $f): ?array
    {
        $raw = @file_get_contents($f);
        if (!is_string($raw) || strlen($raw) > self::MAX_BYTES + 4096) {
            return null;
        }
        // objects stay objects (stdClass): an empty {} is written back as {}, never as []
        $e = json_decode($raw, false, 512);
        if (!is_object($e) || ($e->format ?? null) !== 1 || !is_string($e->id ?? null) || !is_string($e->name ?? null)
            || !is_int($e->revision ?? null) || !is_object($e->dashboard ?? null)) {
            return null;
        }
        return ['id' => $e->id, 'name' => $e->name, 'created' => (string) ($e->created ?? ''), 'updated' => (string) ($e->updated ?? ''),
            'revision' => $e->revision, 'dashboard' => $e->dashboard];
    }

    /* ------------------------------------------------------------------ validation */

    /** A clean display name, or null with $why = name_invalid. */
    public static function cleanName(mixed $name, ?string &$why = null): ?string
    {
        $n = is_string($name) ? trim(preg_replace('/\s+/u', ' ', $name) ?? '') : '';
        $len = function_exists('mb_strlen') ? mb_strlen($n, 'UTF-8') : strlen($n);
        if ($n === '' || $len > self::NAME_MAX || !mb_check_encoding($n, 'UTF-8') || preg_match('/[\x00-\x1f\x7f]/', $n)) {
            $why = 'name_invalid';
            return null;
        }
        return $n;
    }

    private static function key(string $name): string
    {
        return function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
    }

    /**
     * Independent server check of a dashboard model (the editor validates the full schema first): a JSON object
     * shaped like a dashboard, within the limits, no markup in any text, no reserved keys. Never "repairs" anything.
     */
    public static function checkModel(mixed $m, ?string &$why = null): bool
    {
        // $m is decoded with objects as stdClass (so {} and [] stay distinct)
        if (!is_object($m)) {
            $why = 'not a dashboard (expected a JSON object)';
            return false;
        }
        $v = get_object_vars($m);
        $unknown = array_diff(array_keys($v), ['version', 'app', 'pages', 'popups', 'notifications']);
        if ($unknown) {
            $why = 'unknown key "' . self::safe((string) reset($unknown)) . '"';
            return false;
        }
        if (!is_int($v['version'] ?? null) || $v['version'] < 1 || $v['version'] > self::MODEL_VERSION) {
            $why = 'missing or unsupported "version"';
            return false;
        }
        if (array_key_exists('app', $v) && !is_object($v['app'])) {
            $why = '"app" must be an object';
            return false;
        }
        if (is_object($v['app'] ?? null) && property_exists($v['app'], 'theme') && !self::checkTheme($v['app']->theme, $why)) {
            return false;
        }
        // the dashboard's THEME LIBRARY (Theme Studio): at most 20 themes, each a valid theme with a unique id and a name
        if (is_object($v['app'] ?? null) && property_exists($v['app'], 'themes')) {
            $lib = $v['app']->themes;
            if (!is_array($lib) || !array_is_list($lib) || count($lib) > 20) {
                $why = 'app.themes must be a list of at most 20 themes';
                return false;
            }
            $ids = [];
            foreach ($lib as $t) {
                if (!self::checkTheme($t, $why)) {
                    return false;
                }
                $id = is_object($t) ? ($t->id ?? null) : null;
                if (!is_string($id) || isset($ids[$id]) || !is_string($t->name ?? null) || trim($t->name) === '') {
                    $why = 'app.themes: every theme needs a unique id and a name';
                    return false;
                }
                $ids[$id] = true;
            }
        }
        $pages = $v['pages'] ?? null;
        if (!is_array($pages) || !array_is_list($pages) || count($pages) < 1 || count($pages) > 50) {
            $why = '"pages" must be a list of 1–50 pages';
            return false;
        }
        foreach ($pages as $i => $p) {
            foreach (is_object($p) && is_array($p->items ?? null) ? $p->items : [] as $it) {
                if (is_object($it) && is_object($it->config ?? null) && property_exists($it->config, 'theme') && !self::checkTheme($it->config->theme, $why)) {
                    return false;
                }
            }
            if (!is_object($p) || !is_string($p->id ?? null) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/', $p->id)
                || !is_array($p->items ?? null) || !array_is_list($p->items) || count($p->items) > 500) {
                $why = 'page ' . ($i + 1) . ': needs an id and a list of items';
                return false;
            }
        }
        if (array_key_exists('popups', $v) && (!is_array($v['popups']) || !array_is_list($v['popups']) || count($v['popups']) > 50)) {
            $why = '"popups" must be a list';
            return false;
        }
        if (array_key_exists('notifications', $v) && !is_object($v['notifications'])) {
            $why = '"notifications" must be an object';
            return false;
        }
        return self::walk($m, 0, $why);
    }

    /**
     * A theme (dashboard app.theme or a widget's config.theme): { id?, name?, tokens } where tokens are allow-listed
     * colour tokens with plain colour values. Mirrors components/theme/theme.js — the server never stores a value
     * that could carry CSS (url(), var(), expressions) even when the editor was bypassed.
     */
    public const THEME_TOKENS = ['page-bg', 'page-bg-darker', 'page-bg-lighter', 'surface-primary', 'surface-primary-top', 'surface-secondary',
        'surface-tertiary', 'border-primary', 'border-subtle', 'edge-highlight', 'text-primary', 'text-secondary', 'text-muted', 'accent',
        'accent-hot', 'accent-soft', 'accent-line', 'success', 'warning', 'danger', 'info', 'cool', 'purple', 'solar', 'neutral', 'nav-bg', 'surface-interactive', 'light-warm', 'light-hot', 'heat-warm', 'heat-hot', 'control-well',
        'device-surface-solid', 'device-surface-top', 'device-surface-mid', 'device-surface-bottom', 'accent-on',
        'nav-active', 'nav-active-bg', 'nav-inactive', 'nav-indicator', 'text-heading', 'card-border', 'slider-track', 'slider-fill',
        'button-bg', 'button-fg', 'control-off-bg', 'control-off-fg', 'focus'];
    /** a theme's LOOK and BACKGROUND: [min, max] numbers, lists of names, or a kind — mirrors LOOK / BACKGROUND in theme.js */
    private const THEME_LOOK = ['font' => ['default', 'system', 'rounded', 'humanist', 'serif', 'mono', 'poppins'], 'titleWeight' => [500, 800], 'textScale' => [0.9, 1.15],
        'radius' => [0, 32], 'borderWidth' => [0, 3], 'shadow' => ['none', 'soft', 'standard', 'strong'], 'shadowStrength' => [0, 150], 'surfaceAlpha' => [40, 100],
        'blur' => [0, 20], 'glass' => 'bool', 'glow' => [0, 100],
        'pagePad' => [0, 48], 'pageMargin' => [0, 48], 'pageRadius' => [0, 40], 'titleSize' => [14, 40], 'headGap' => [0, 64], 'navStyle' => ['labels', 'icons'], 'pageFrame' => ['flat', 'panel']];
    private const THEME_BACKGROUND = ['image' => 'image', 'fit' => ['cover', 'contain', 'original', 'stretch'],
        'position' => ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], 'opacity' => [0, 100],
        'overlay' => 'colour', 'overlayAlpha' => [0, 100], 'blur' => [0, 20], 'attach' => ['scroll', 'fixed'], 'gradient' => 'gradient'];

    private static function themeColour(mixed $val): bool
    {
        $hex = '/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/';
        $fn = '/^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?(?:\s*[, ]\s*[0-9.]+%?){2}(?:\s*[,\/]\s*[0-9.]+%?)?\s*\)$/';
        return is_string($val) && strlen($val) <= 64 && (preg_match($hex, $val) || preg_match($fn, $val));
    }

    /** a background image: a shared asset, a widget package asset or an uploaded user asset reference — never an outside address or data */
    private static function themeImage(mixed $val): bool
    {
        return is_string($val) && strlen($val) <= 300 && !str_contains($val, '..') && (bool) preg_match(
            '#^(assets/[A-Za-z0-9._/-]{1,200}\.(?:png|jpe?g|webp|gif|svg)|widgets/(default|custom)/[a-z0-9][a-z0-9-]*/(?:[a-z0-9][a-z0-9-]*/)?assets/[A-Za-z0-9._/-]{1,200}\.(?:png|jpe?g|webp|gif|svg)|api/asset\.php\?id=[0-9a-f]{32})$#',
            $val
        );
    }

    private static function themePart(mixed $part, array $rules): bool
    {
        if (!is_object($part)) {
            return false;
        }
        foreach (get_object_vars($part) as $k => $val) {
            $rule = $rules[$k] ?? null;
            if ($rule === null) {
                return false;
            }
            $ok = match (true) {
                $rule === 'bool' => is_bool($val),
                $rule === 'colour' => self::themeColour($val),
                $rule === 'image' => self::themeImage($val),
                $rule === 'gradient' => is_object($val) && !array_diff(array_keys(get_object_vars($val)), ['from', 'to', 'angle'])
                    && self::themeColour($val->from ?? null) && self::themeColour($val->to ?? null)
                    && (!property_exists($val, 'angle') || ((is_int($val->angle) || is_float($val->angle)) && $val->angle >= 0 && $val->angle <= 360)),
                is_string($rule[0]) => in_array($val, $rule, true),
                default => (is_int($val) || is_float($val)) && $val >= $rule[0] && $val <= $rule[1],
            };
            if (!$ok) {
                return false;
            }
        }
        return true;
    }

    public static function checkTheme(mixed $t, ?string &$why): bool
    {
        if (!is_object($t)) {
            $why = 'theme must be an object';
            return false;
        }
        $v = get_object_vars($t);
        if (array_diff(array_keys($v), ['id', 'name', 'tokens', 'look', 'background', 'dark', 'base'])) {
            $why = 'theme: unknown key';
            return false;
        }
        if (isset($v['base']) && (!is_string($v['base']) || !preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $v['base']))) {
            $why = 'theme: invalid base';
            return false;
        }
        if (array_key_exists('dark', $v) && !is_bool($v['dark'])) {
            $why = 'theme: dark must be true or false';
            return false;
        }
        if (array_key_exists('look', $v) && !self::themePart($v['look'], self::THEME_LOOK)) {
            $why = 'theme: unsupported look property or value';
            return false;
        }
        if (array_key_exists('background', $v) && !self::themePart($v['background'], self::THEME_BACKGROUND)) {
            $why = 'theme: unsupported background property or value (images: an IniqDash asset only)';
            return false;
        }
        if (isset($v['id']) && (!is_string($v['id']) || !preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $v['id']))) {
            $why = 'theme: invalid id';
            return false;
        }
        if (isset($v['name']) && (!is_string($v['name']) || strlen($v['name']) > 120 || preg_match('/[<>]/', $v['name']))) {
            $why = 'theme: invalid name';
            return false;
        }
        if (!array_key_exists('tokens', $v)) {
            return true;
        }
        if (!is_object($v['tokens'])) {
            $why = 'theme: tokens must be an object';
            return false;
        }
        $tokens = get_object_vars($v['tokens']);
        if (count($tokens) > 60) {
            $why = 'theme: too many tokens';
            return false;
        }
        foreach ($tokens as $k => $val) {
            if (!in_array((string) $k, self::THEME_TOKENS, true) || !self::themeColour($val)) {
                $why = 'theme: "' . self::safe((string) $k) . '" is not an allowed token or colour';
                return false;
            }
        }
        return true;
    }

    private static function walk(mixed $v, int $depth, ?string &$why): bool
    {
        if ($depth > self::DEPTH) {
            $why = 'nested too deeply';
            return false;
        }
        if (is_string($v)) {
            if (strlen($v) > 20000 || preg_match('/^\s*</', $v) || preg_match('/<\s*(script|svg|img|iframe|object|embed|link|style)\b/i', $v)) {
                $why = 'markup is not allowed in dashboard text';
                return false;
            }
            return true;
        }
        if (is_object($v)) {
            foreach (get_object_vars($v) as $k => $x) {
                if (in_array((string) $k, ['__proto__', 'constructor', 'prototype'], true)) {
                    $why = 'reserved key';
                    return false;
                }
                if (!self::walk($x, $depth + 1, $why)) {
                    return false;
                }
            }
            return true;
        }
        if (is_array($v)) {
            if (!array_is_list($v)) {
                $why = 'unexpected value';
                return false;
            }
            foreach ($v as $x) {
                if (!self::walk($x, $depth + 1, $why)) {
                    return false;
                }
            }
            return true;
        }
        if (is_float($v) && !is_finite($v)) {
            $why = 'not a finite number';
            return false;
        }
        return $v === null || is_bool($v) || is_int($v) || is_float($v);
    }

    private static function safe(string $s): string
    {
        return substr(preg_replace('/[^A-Za-z0-9_.-]/', '?', $s) ?? '', 0, 40);
    }

    /* ------------------------------------------------------------------ writes (all under the lock) */

    /** @return array{ok: bool, error?: string, detail?: string, entry?: array, revision?: int} */
    public static function create(mixed $name, mixed $model, bool $unique = false): array
    {
        return self::locked(static function (string $dir) use ($name, $model, $unique) {
            $why = null;
            $n = self::cleanName($name, $why);
            if ($n === null) {
                return ['ok' => false, 'error' => $why];
            }
            if (!self::checkModel($model, $why)) {
                return ['ok' => false, 'error' => 'invalid', 'detail' => $why];
            }
            if (count(self::list()) >= self::MAX_DASHBOARDS) {
                return ['ok' => false, 'error' => 'too_many'];
            }
            if (self::nameTaken($n, null)) {
                if (!$unique) {
                    return ['ok' => false, 'error' => 'name_taken'];
                }
                $n = self::uniqueName($n);                      // e.g. an import or a first save: "Name 2"
            }
            return self::store($dir, self::newId($dir), $n, $model, 1, null);
        });
    }

    public static function save(mixed $id, mixed $revision, mixed $model): array
    {
        return self::locked(static function (string $dir) use ($id, $revision, $model) {
            $why = null;
            $e = self::get($id, $why);
            if ($e === null) {
                return ['ok' => false, 'error' => $why];
            }
            if (!is_int($revision) || $revision !== $e['revision']) {
                return ['ok' => false, 'error' => 'conflict', 'revision' => $e['revision'], 'updated' => $e['updated']];
            }
            if (!self::checkModel($model, $why)) {
                return ['ok' => false, 'error' => 'invalid', 'detail' => $why];
            }
            return self::store($dir, $e['id'], $e['name'], $model, $e['revision'] + 1, $e['created']);
        });
    }

    public static function rename(mixed $id, mixed $name): array
    {
        return self::locked(static function (string $dir) use ($id, $name) {
            $why = null;
            $e = self::get($id, $why);
            if ($e === null) {
                return ['ok' => false, 'error' => $why];
            }
            $n = self::cleanName($name, $why);
            if ($n === null) {
                return ['ok' => false, 'error' => $why];
            }
            if (self::nameTaken($n, $e['id'])) {
                return ['ok' => false, 'error' => 'name_taken'];
            }
            // content and revision unchanged: an open editor can still save its work
            return self::store($dir, $e['id'], $n, $e['dashboard'], $e['revision'], $e['created'], $e['updated']);
        });
    }

    public static function duplicate(mixed $id): array
    {
        return self::locked(static function (string $dir) use ($id) {
            $why = null;
            $e = self::get($id, $why);
            if ($e === null) {
                return ['ok' => false, 'error' => $why];
            }
            if (count(self::list()) >= self::MAX_DASHBOARDS) {
                return ['ok' => false, 'error' => 'too_many'];
            }
            return self::store($dir, self::newId($dir), self::uniqueName($e['name'] . ' Copy'), $e['dashboard'], 1, null);
        });
    }

    public static function delete(mixed $id): array
    {
        return self::locked(static function (string $dir) use ($id) {
            $why = null;
            $e = self::get($id, $why);
            if ($e === null && $why === 'not_found') {
                return ['ok' => false, 'error' => 'not_found'];
            }
            $f = self::file($dir, (string) $id);                 // id already matched ID (get() checked it)
            if (!@unlink($f)) {
                return ['ok' => false, 'error' => 'write_failed'];
            }
            return ['ok' => true, 'id' => $id];
        });
    }

    /* ------------------------------------------------------------------ application settings (this installation, every user)
       <private>/dashboards/settings.json { format: 1, default: <dashboard id> | null, editButton: 'corner' | 'always' }
       default     the dashboard the application opens after signing in (null: the last one opened in this browser, else the most
                   recently saved). A default whose dashboard no longer exists reads as null — never a dead link, never a loop.
       editButton  'corner' (default): the Edit control appears on a 2-second hover / long-press in the top-right corner (and on
                   keyboard focus); 'always': always visible. */
    public const EDIT_BUTTON = ['corner', 'always'];

    /* gallery (optional): how the Add-widget gallery is ORGANISED on this installation — the user's own categories, which widget sits in
       which category, and the widgets marked "not wanted" (hidden from the gallery, nothing deleted):
         { categories: [{ id: 'u-…', name }], assign: { <widget key>: <category id> }, hidden: [<widget key>] }
       A widget key is a registry type ('light') or a library entry ('my:<id>'). Bounded: 40 categories, 600 keys. */
    private const GALLERY_KEY = '/^(my:)?[a-z0-9][a-z0-9_-]{0,79}$/';
    private const GALLERY_CAT = '/^u-[a-z0-9]{1,24}$/';

    /** a gallery organisation, cleaned (unknown keys dropped); null when it is not one */
    public static function cleanGallery($g): ?array
    {
        if (!is_array($g)) {
            return null;
        }
        $cats = [];
        foreach (is_array($g['categories'] ?? null) ? array_slice($g['categories'], 0, 40) : [] as $c) {
            $name = is_array($c) && is_string($c['name'] ?? null) ? trim($c['name']) : '';
            if (!is_array($c) || !is_string($c['id'] ?? null) || !preg_match(self::GALLERY_CAT, $c['id']) || $name === '' || strlen($name) > 120 || preg_match('/[<>]/', $name)) {
                return null;
            }
            $cats[$c['id']] = ['id' => $c['id'], 'name' => function_exists('mb_substr') ? mb_substr($name, 0, 40, 'UTF-8') : substr($name, 0, 40)];
        }
        $assign = [];
        foreach (is_array($g['assign'] ?? null) ? $g['assign'] : [] as $k => $v) {
            if (!is_string($k) || !preg_match(self::GALLERY_KEY, $k) || !is_string($v) || !isset($cats[$v])) {
                return null;
            }
            $assign[$k] = $v;
        }
        $hidden = [];
        foreach (is_array($g['hidden'] ?? null) ? $g['hidden'] : [] as $k) {
            if (!is_string($k) || !preg_match(self::GALLERY_KEY, $k)) {
                return null;
            }
            $hidden[$k] = true;
        }
        if (count($assign) > 600 || count($hidden) > 600) {
            return null;
        }
        return ['categories' => array_values($cats), 'assign' => (object) $assign, 'hidden' => array_keys($hidden)];
    }

    /** @return array{default: ?string, editButton: string, gallery: ?array} */
    public static function settings(): array
    {
        $out = ['default' => null, 'editButton' => 'corner', 'gallery' => null];
        $dir = self::dir();
        if ($dir === null) {
            return $out;
        }
        $f = $dir . DIRECTORY_SEPARATOR . 'settings.json';
        $raw = is_file($f) ? @file_get_contents($f, false, null, 0, 131072) : false;
        $j = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($j)) {
            if (is_string($j['default'] ?? null) && preg_match(self::ID, $j['default']) && is_file(self::file($dir, $j['default']))) {
                $out['default'] = $j['default'];
            }
            if (in_array($j['editButton'] ?? null, self::EDIT_BUTTON, true)) {
                $out['editButton'] = $j['editButton'];
            }
            if (isset($j['gallery'])) {
                $out['gallery'] = self::cleanGallery($j['gallery']);
            }
        }
        return $out;
    }

    /** Change some settings (only the keys given; each validated). default: a dashboard id that exists, or null. */
    public static function setSettings(array $patch): array
    {
        return self::locked(static function (string $dir) use ($patch) {
            $cur = self::settings();
            if (array_key_exists('default', $patch)) {
                $d = $patch['default'];
                if ($d !== null && !(is_string($d) && preg_match(self::ID, $d) && is_file(self::file($dir, $d)))) {
                    return ['ok' => false, 'error' => 'not_found'];
                }
                $cur['default'] = $d;
            }
            if (array_key_exists('editButton', $patch)) {
                if (!in_array($patch['editButton'], self::EDIT_BUTTON, true)) {
                    return ['ok' => false, 'error' => 'bad_request'];
                }
                $cur['editButton'] = $patch['editButton'];
            }
            if (array_key_exists('gallery', $patch)) {
                $g = $patch['gallery'] === null ? null : self::cleanGallery(json_decode(json_encode($patch['gallery']), true));
                if ($patch['gallery'] !== null && $g === null) {
                    return ['ok' => false, 'error' => 'bad_request'];
                }
                $cur['gallery'] = $g;
            }
            $json = json_encode(['format' => 1] + $cur, JSON_UNESCAPED_SLASHES);
            $tmp = $dir . DIRECTORY_SEPARATOR . '.settings.' . bin2hex(random_bytes(4)) . '.tmp';
            if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
                return ['ok' => false, 'error' => 'write_failed'];
            }
            @chmod($tmp, 0600);
            if (!@rename($tmp, $dir . DIRECTORY_SEPARATOR . 'settings.json')) {
                @unlink($tmp);
                return ['ok' => false, 'error' => 'write_failed'];
            }
            return ['ok' => true, 'settings' => $cur];
        });
    }

    /** "<name>", "<name> 2", "<name> 3"… — the first free one (case-insensitive), within the length limit. */
    public static function uniqueName(string $base): string
    {
        $base = function_exists('mb_substr') ? mb_substr($base, 0, self::NAME_MAX, 'UTF-8') : substr($base, 0, self::NAME_MAX);
        if (!self::nameTaken($base, null)) {
            return $base;
        }
        for ($i = 2; $i < 1000; $i++) {
            $suffix = " $i";
            $cut = function_exists('mb_substr') ? mb_substr($base, 0, self::NAME_MAX - strlen($suffix), 'UTF-8') : substr($base, 0, self::NAME_MAX - strlen($suffix));
            if (!self::nameTaken($cut . $suffix, null)) {
                return $cut . $suffix;
            }
        }
        return substr(bin2hex(random_bytes(4)) . ' ' . $base, 0, self::NAME_MAX);
    }

    private static function nameTaken(string $name, ?string $except): bool
    {
        $k = self::key($name);
        foreach (self::list() as $d) {
            if ($d['id'] !== $except && self::key($d['name']) === $k) {
                return true;
            }
        }
        return false;
    }

    private static function newId(string $dir): string
    {
        do {
            $id = 'd' . bin2hex(random_bytes(8));
        } while (is_file(self::file($dir, $id)));
        return $id;
    }

    /** Atomic write of one dashboard file. */
    private static function store(string $dir, string $id, string $name, object $model, int $revision, ?string $created, ?string $updated = null): array
    {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $entry = ['format' => 1, 'id' => $id, 'name' => $name, 'created' => $created ?: $now, 'updated' => $updated ?: $now, 'revision' => $revision, 'dashboard' => $model];
        $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if (!is_string($json) || strlen($json) > self::MAX_BYTES + 4096) {
            return ['ok' => false, 'error' => $json === false ? 'invalid' : 'too_large'];
        }
        $tmp = $dir . DIRECTORY_SEPARATOR . '.' . $id . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $old = umask(0077);
        try {
            if (@file_put_contents($tmp, $json, LOCK_EX) !== strlen($json)) {
                @unlink($tmp);
                return ['ok' => false, 'error' => 'write_failed'];
            }
            @chmod($tmp, 0600);
            if (@file_get_contents($tmp) !== $json) {                // read back: exactly what we meant
                @unlink($tmp);
                return ['ok' => false, 'error' => 'write_failed'];
            }
            if (!@rename($tmp, self::file($dir, $id))) {
                @unlink($tmp);
                return ['ok' => false, 'error' => 'write_failed'];
            }
        } finally {
            umask($old);
        }
        unset($entry['dashboard'], $entry['format']);
        return ['ok' => true, 'entry' => $entry];
    }

    /** Run a mutation under the exclusive lock (one writer at a time: revision checks and unique names hold). */
    private static function locked(callable $fn): array
    {
        $dir = self::dir();
        if ($dir === null) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        $h = @fopen($dir . DIRECTORY_SEPARATOR . '.lock', 'c');
        if ($h === false || !flock($h, LOCK_EX)) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        try {
            return $fn($dir);
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
            foreach (glob($dir . DIRECTORY_SEPARATOR . '.*.tmp') ?: [] as $t) {   // leftovers of an interrupted write
                if (@filemtime($t) < time() - 300) {
                    @unlink($t);
                }
            }
        }
    }
}
