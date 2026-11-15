<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * IniqDash User Assets — images a signed-in user uploads for dashboards (e.g. a Light Switch ON / OFF artwork).
 * NOT widget-package assets (those live in widgets/<source>/…/assets/ and are never written by the server).
 *
 * Storage   <private>/assets/<id>.<png|jpg|webp>   — the PRIVATE folder (outside the web root, see server/Paths.php):
 *           never served by the web server directly, only through api/asset.php after the session check (gate.php).
 * Id        32 lowercase hex characters from random_bytes(16): the physical name is chosen by the server; the uploaded
 *           file name is never used (not stored, not logged). The extension comes from the VALIDATED content type.
 * Formats   PNG, JPEG, WebP only (no SVG, no GIF). A file is accepted only when three independent checks agree:
 *             1. its first bytes are that format's signature,
 *             2. fileinfo (libmagic) reports the same MIME type,
 *             3. getimagesize() parses it as the same image type with sane dimensions (1–12000 px a side, ≤ 50 MP).
 *           The browser's file name, extension and MIME header are ignored. Nothing is decoded / re-encoded.
 * Size      at most MAX_BYTES (5 MiB), enforced here — independently of PHP's upload_max_filesize / post_max_size.
 * Reference what a dashboard stores: "api/asset.php?id=<id>" (relative, like every other image location; no path).
 */
final class UserAssets
{
    public const MAX_BYTES = 5 * 1024 * 1024;
    public const MAX_SIDE = 12000;
    public const MAX_PIXELS = 50_000_000;
    /** type → [extension, Content-Type, IMAGETYPE_*] */
    public const TYPES = [
        'png'  => ['png', 'image/png', IMAGETYPE_PNG],
        'jpeg' => ['jpg', 'image/jpeg', IMAGETYPE_JPEG],
        'webp' => ['webp', 'image/webp', IMAGETYPE_WEBP],
    ];
    public const ID = '/^[0-9a-f]{32}$/';

    /** <private>/assets (created 0700 on first use), or null when there is no usable private folder. */
    public static function dir(): ?string
    {
        $p = Paths::privateDir();
        if ($p === null) {
            return null;
        }
        $d = $p . DIRECTORY_SEPARATOR . 'assets';
        if (!is_dir($d) && !@mkdir($d, 0700, true) && !is_dir($d)) {
            return null;
        }
        return $d;
    }

    /** What is missing on this server for safe validation, or null when everything is there. */
    public static function missing(): ?string
    {
        if (!function_exists('finfo_open') || !class_exists('finfo')) {
            return 'PHP fileinfo extension';
        }
        if (!function_exists('getimagesize')) {
            return 'PHP getimagesize()';
        }
        if (!defined('IMAGETYPE_WEBP')) {
            return 'IMAGETYPE_WEBP (PHP ≥ 7.1)';
        }
        return null;
    }

    /** The type key ('png' | 'jpeg' | 'webp') of a file whose content is a valid supported raster image, or null + $why. */
    public static function inspect(string $file, ?string &$why = null): ?string
    {
        $size = @filesize($file);
        if ($size === false || $size < 16) {
            $why = 'unsupported_type';
            return null;
        }
        if ($size > self::MAX_BYTES) {
            $why = 'too_large';
            return null;
        }
        $h = @fopen($file, 'rb');
        $head = $h ? (string) fread($h, 16) : '';
        if ($h) {
            fclose($h);
        }
        $sig = str_starts_with($head, "\x89PNG\r\n\x1a\n") ? 'png'
            : (str_starts_with($head, "\xFF\xD8\xFF") ? 'jpeg'
            : (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP' ? 'webp' : null));
        if ($sig === null) {
            $why = 'unsupported_type';
            return null;
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file);
        $info = @getimagesize($file);
        [, $type, $imagetype] = self::TYPES[$sig];
        if ($mime !== $type || !is_array($info) || ($info[2] ?? null) !== $imagetype) {
            $why = 'unsupported_type';                      // signature, libmagic and the image parser must all agree
            return null;
        }
        $w = (int) ($info[0] ?? 0);
        $hgt = (int) ($info[1] ?? 0);
        if ($w < 1 || $hgt < 1 || $w > self::MAX_SIDE || $hgt > self::MAX_SIDE || $w * $hgt > self::MAX_PIXELS) {
            $why = 'bad_dimensions';
            return null;
        }
        return $sig;
    }

    /**
     * Store a validated upload under a new random id. $tmp must be PHP's own uploaded temporary file.
     * @return array{id: string, ref: string, type: string, width: int, height: int}|null  (null + $why)
     */
    public static function store(string $tmp, ?string &$why = null): ?array
    {
        if (!is_uploaded_file($tmp)) {
            $why = 'upload_failed';
            return null;
        }
        $kind = self::inspect($tmp, $why);
        if ($kind === null) {
            return null;
        }
        $dir = self::dir();
        if ($dir === null) {
            $why = 'storage_unavailable';
            return null;
        }
        [$ext, $type] = self::TYPES[$kind];
        for ($i = 0; $i < 5; $i++) {
            $id = bin2hex(random_bytes(16));
            $dest = $dir . DIRECTORY_SEPARATOR . $id . '.' . $ext;
            if (!self::exists($id) && @move_uploaded_file($tmp, $dest)) {
                @chmod($dest, 0600);
                $info = @getimagesize($dest);
                return ['id' => $id, 'ref' => self::ref($id), 'type' => $type, 'width' => (int) ($info[0] ?? 0), 'height' => (int) ($info[1] ?? 0)];
            }
        }
        $why = 'upload_failed';
        return null;
    }

    /* ---- IMAGE LIBRARIES: IMAGE OWNERSHIP = WIDGET TYPE. An uploaded image belongs to the widget type it was uploaded for
       ("light", "custom.<package>"…): every instance of that type can choose it; other types never list it.
       <private>/assets/library.json  { "scopes": { "<widget type>": ["<id>", …] } }  — ids only (no names, no paths).
       Written under a lock, through a temporary file + rename. */
    public const SCOPE = '/^[a-z][a-z0-9._-]{0,63}$/';
    public const LIBRARY_MAX = 500;

    private static function libraryFile(): ?string
    {
        $d = self::dir();
        return $d === null ? null : $d . DIRECTORY_SEPARATOR . 'library.json';
    }

    /** every scope → ids (as recorded; an id whose file is gone is skipped by library()) */
    private static function readLibrary(): array
    {
        $f = self::libraryFile();
        if ($f === null || !is_file($f)) {
            return [];
        }
        $j = json_decode((string) @file_get_contents($f), true);
        $out = [];
        foreach ((is_array($j) && is_array($j['scopes'] ?? null) ? $j['scopes'] : []) as $scope => $ids) {
            if (is_string($scope) && preg_match(self::SCOPE, $scope) && is_array($ids)) {
                $out[$scope] = array_values(array_filter($ids, static fn ($i) => is_string($i) && preg_match(self::ID, $i)));
            }
        }
        return $out;
    }

    /** the ids of the images uploaded for a widget type, oldest first (only those still stored) */
    public static function library(string $scope): array
    {
        if (!preg_match(self::SCOPE, $scope)) {
            return [];
        }
        return array_values(array_filter(self::readLibrary()[$scope] ?? [], static fn ($id) => self::find($id) !== null));
    }

    /** record a STORED image as one of a widget type's (idempotent); false when the scope / id is invalid or unknown */
    public static function addToLibrary(string $scope, string $id): bool
    {
        if (!preg_match(self::SCOPE, $scope) || self::find($id) === null || ($f = self::libraryFile()) === null) {
            return false;
        }
        $lock = @fopen($f . '.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            return false;
        }
        try {
            $all = self::readLibrary();
            $ids = $all[$scope] ?? [];
            if (in_array($id, $ids, true)) {
                return true;
            }
            if (count($ids) >= self::LIBRARY_MAX) {
                return false;
            }
            $ids[] = $id;
            $all[$scope] = $ids;
            $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
            if (@file_put_contents($tmp, json_encode(['scopes' => $all], JSON_UNESCAPED_SLASHES)) === false) {
                @unlink($tmp);
                return false;
            }
            @chmod($tmp, 0600);
            if (!@rename($tmp, $f)) {
                @unlink($tmp);
                return false;
            }
            return true;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public static function ref(string $id): string
    {
        return 'api/asset.php?id=' . $id;
    }

    private static function exists(string $id): bool
    {
        return self::find($id) !== null;
    }

    /** [file, Content-Type] of a stored asset, or null (unknown / invalid id). */
    public static function find(string $id): ?array
    {
        if (!preg_match(self::ID, $id)) {
            return null;
        }
        $dir = self::dir();
        if ($dir === null) {
            return null;
        }
        foreach (self::TYPES as [$ext, $type]) {
            $f = $dir . DIRECTORY_SEPARATOR . $id . '.' . $ext;
            if (is_file($f)) {
                return [$f, $type];
            }
        }
        return null;
    }
}
