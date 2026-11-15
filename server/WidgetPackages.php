<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Widget packages — discovery and validation of widgets/<source>/<folder>/widget.json.
 *
 * Used by
 *   - server/build-widget-index.php   default (factory) widgets → widgets/index.js (a release-time build step)
 *   - gate.php                        CUSTOM widgets, discovered on every editor page load: installing one is
 *                                     "copy its folder into widgets/custom/ and refresh" — no build, no edits.
 *
 * Layout of widgets/custom/ (each directory is recognised by its CONTENTS, never by its name):
 *   widgets/custom/<widget>/widget.json                          a standalone widget   → virtual collection "General"
 *   widgets/custom/<collection>/collection.json                  a COLLECTION (a design family / distribution unit),
 *   widgets/custom/<collection>/<widget>/widget.json               holding widget packages one level down
 *   A directory with both files, or neither, is rejected. Collections do not nest. Factory widgets (widgets/default/)
 *   are the virtual collection "Built-in".
 *
 * Collection manifest (collection.json, schema 1 — later versions may add keys under a new schema number):
 *   schema       1
 *   id           lowercase letters, digits, hyphens (need not equal the folder, so "maison-main/" from a GitHub archive
 *                still works); unique; not a reserved name (general, built-in, all, …)
 *   name         plain text, 1–60 characters
 *   description  optional, plain text, up to 200 characters
 *   Membership comes from the folder: a widget never names its collection.
 *
 * Widget manifest (widget.json, schema 1):
 *   schema   1
 *   id       default: the folder name · custom: "custom.<folder>" (so a custom widget can never take a factory id).
 *            The id is the type stored in dashboards: it does NOT include the collection, so moving a widget into or out
 *            of a collection keeps every saved dashboard working. Ids are unique across General and all collections.
 *   name     plain text, 1–60 characters
 *   source   the folder it lives in: "default" | "custom"
 *   version  x.y.z
 *   entry    the package's .js file (a file name inside the package)
 *   style    the package's .css file (a file name inside the package)
 *   assets   "assets/"
 *   api      the global object the entry defines (e.g. MaisonLight, IniqSunriseSunset); unique across packages
 *   category optional, custom only: the gallery category id (CATEGORIES, e.g. "controls"; a new lowercase id is allowed
 *            and becomes its own heading). Without it the widget is listed under "Custom". The provisional ids
 *            (lighting, information, environment, actions, content) are still accepted: the editor files them under
 *            their final category (components/editor/registry.js LEGACY_CATEGORY).
 *   basedOn  optional, custom only: the default widget it was derived from (lineage)
 *   ha       optional, custom only: the Home Assistant data the widget uses, through the SHARED HA layer:
 *              { "binding": "entity" | "gauge" | "sensor" | "text"   (default "entity": the normalised entity itself),
 *                "domains": ["sun"], "deviceClasses": ["temperature"],   (both optional; filters for the entity picker)
 *                "actions": ["turn_on", "turn_off"] }                    (optional: the actions the widget may REQUEST)
 *            ROLES binding ("binding": "roles"): several named entity roles and named action slots, declared in the manifest:
 *              "roles":       { "<role>": { label, domains[], deviceClasses?[], multiple?, max?, required?, area? } }
 *                             area: true (with multiple) — once the widget's configuration names a Home Assistant AREA (config.area), the role
 *                             is every entity of its domains HA places in that area (read-only, like every role); its own mapping is the fallback
 *              "actionSlots": { "<slot>": { label, domains[], actions[], max?, required?, section? } }   (actions from ACTIONS only)
 *            Nothing in the core knows a role or slot name; see docs/CUSTOM-WIDGETS.md.
 *            Actions: only with the "entity" binding, only from ACTIONS (per domain), and every declared domain must
 *            support every declared action. The server chooses and checks the HA service (HaService::plan()) and
 *            re-checks the declaration on every request (api/ha_call.php). Never credentials, endpoints or services.
 *
 * Every path the browser receives is relative ("widgets/custom/[<collection>/]<folder>/"); no server filesystem path
 * leaves this class.
 */
final class WidgetPackages
{
    public const SOURCES = ['default', 'custom'];
    public const HA_BINDINGS = ['entity', 'gauge', 'sensor', 'text', 'roles'];
    /** the actions a custom widget may declare, per domain (deliberately small; widen per domain when needed) */
    public const ACTIONS = ['light' => ['turn_on', 'turn_off'], 'switch' => ['turn_on', 'turn_off'], 'fan' => ['turn_on', 'turn_off'],
        // fixed, stateless triggers (HaService::plan() chooses the HA service: scene / script → turn_on, button → press)
        'scene' => ['trigger'], 'script' => ['trigger'], 'button' => ['trigger'], 'input_button' => ['trigger']];
    private const ROLE_NAME = '/^[a-z][a-z0-9_]{0,29}$/';
    private const ROLE_KEYS = ['label', 'domains', 'deviceClasses', 'multiple', 'max', 'required', 'area'];
    private const SLOT_KEYS = ['label', 'domains', 'actions', 'max', 'required', 'section'];
    private const CUSTOM_ID = '/^custom\.([a-z][a-z0-9-]{0,39})$/';
    private const KEYS = ['schema', 'id', 'name', 'source', 'version', 'entry', 'style', 'assets', 'api', 'category', 'basedOn', 'ha'];
    private const FOLDER = '/^[a-z][a-z0-9-]{0,39}$/';
    /** the gallery categories (ids → headings): the factory groups first, then the finer ones custom widgets may use */
    public const CATEGORIES = ['controls' => 'Controls', 'climate' => 'Climate & Environment', 'security' => 'Security', 'media' => 'Media',
        'sensors' => 'Sensors & Data', 'energy' => 'Energy', 'appliances' => 'Appliances & Robots', 'people' => 'People',
        'time' => 'Time & Calendar', 'navigation' => 'Navigation & Content', 'containers' => 'Containers'];
    private const CATEGORY = '/^[a-z][a-z0-9-]{1,23}$/';
    private const COLLECTION_KEYS = ['schema', 'id', 'name', 'description'];
    /** collection ids that would clash with the gallery's own choices / the sources */
    /** the list of packages IniqDash itself ships in widgets/custom/ (standalone): SOURCE built-in, Collection "IniqDash" in the gallery (not
        "General"). It lives in widgets/custom/first-party.json — release-owned, OUTSIDE every package folder — so (1) core code names no custom
        widget (the drop-in rule) and (2) a package can never declare itself first-party: copying a package folder in does not change the list. */
    public const FIRST_PARTY_FILE = 'first-party.json';

    /** the first-party package ids (validated; a missing / invalid file → none) */
    public static function firstParty(string $appRoot): array
    {
        $f = $appRoot . '/widgets/custom/' . self::FIRST_PARTY_FILE;
        $raw = is_file($f) ? @file_get_contents($f, false, null, 0, 8192) : false;
        $j = is_string($raw) ? json_decode($raw, true) : null;
        $ids = is_array($j) && is_array($j['packages'] ?? null) ? array_values(array_filter($j['packages'], static fn ($x) => is_string($x) && preg_match('/^custom\.[a-z][a-z0-9-]{0,39}$/', $x))) : [];
        return $ids;
    }
    private const RESERVED = ['all', 'general', 'built-in', 'iniqdash', 'builtin', 'default', 'custom', 'none'];

    /**
     * All valid packages of one source, plus a diagnostic per rejected folder (a rejected package never stops the others).
     * For "custom": standalone widgets first (collection null = "General"), then each collection in folder order; the
     * first package with an id / api wins and a later one is REJECTED with a diagnostic (never silently shadowed).
     * @param string[] $takenApis  API names already used (e.g. by the default widgets) — a package may not reuse one
     * @return array{packages: list<array<string,mixed>>, collections: list<array<string,string>>, errors: list<array{folder: string, error: string}>}
     */
    public static function scan(string $appRoot, string $source, array $takenApis = []): array
    {
        $out = ['packages' => [], 'collections' => [], 'errors' => []];
        if (!in_array($source, self::SOURCES, true)) {
            return $out;
        }
        $base = realpath("$appRoot/widgets/$source");
        if ($base === false || !is_dir($base)) {
            return $out;
        }
        $apis = array_fill_keys($takenApis, true);
        $ids = [];
        $err = static function (string $rel, string $folder, string $why) use (&$out) {
            $out['errors'][] = ['folder' => $rel . (preg_match(self::FOLDER, $folder) ? $folder : '(invalid folder name)') . '/', 'error' => $why];
        };
        // one package: validate it, then the global uniqueness of its id and api
        $add = static function (string $dir, string $rel, string $folder, ?array $col) use ($appRoot, $source, &$apis, &$ids, &$out, $err) {
            $why = null;
            $m = self::read($appRoot, $dir, $source, $folder, $why, $rel);
            if ($m !== null && isset($ids[$m['id']])) {
                $why = "duplicate widget id \"{$m['id']}\" (already installed from {$ids[$m['id']]})";
                $m = null;
            } elseif ($m !== null && isset($apis[$m['api']])) {
                $why = "api \"{$m['api']}\" is already used by another widget";
                $m = null;
            }
            if ($m === null) {
                $err($rel, $folder, (string) $why);
                return;
            }
            if ($source === 'custom') {
                $m['collection'] = $col['id'] ?? null;                   // null: a standalone widget ("General")
                // a FIRST-PARTY package (shipped with IniqDash, standalone in widgets/custom/): source built-in, the gallery's "IniqDash" collection
                // (organisation only — its id, path and behaviour are those of any package)
                $m['firstParty'] = $col === null && in_array($m['id'], self::firstParty($appRoot), true);
            }
            $ids[$m['id']] = $m['path'];
            $apis[$m['api']] = true;
            $out['packages'][] = $m;
        };
        $folders = self::folders($base);
        if ($source === 'default') {
            foreach ($folders as $folder) {
                $add($base, "widgets/$source/", $folder, null);
            }
            return $out;
        }
        // custom: tell standalone widgets and collections apart by their contents
        $standalone = $collections = [];
        foreach ($folders as $folder) {
            $hasW = is_file("$base/$folder/widget.json");
            $hasC = is_file("$base/$folder/collection.json");
            if ($hasW && $hasC) {
                $err('widgets/custom/', $folder, 'has both widget.json and collection.json (a folder is a widget OR a collection)');
            } elseif ($hasW) {
                $standalone[] = $folder;
            } elseif ($hasC) {
                $collections[] = $folder;
            } else {
                $err('widgets/custom/', $folder, 'no widget.json (widget) or collection.json (collection)');
            }
        }
        foreach ($standalone as $folder) {
            $add($base, 'widgets/custom/', $folder, null);
        }
        $colIds = [];
        foreach ($collections as $folder) {
            $why = null;
            $c = self::readCollection($base, $folder, $why);
            if ($c !== null && isset($colIds[$c['id']])) {
                $why = "duplicate collection id \"{$c['id']}\" (already used by {$colIds[$c['id']]})";
                $c = null;
            }
            if ($c === null) {
                $err('widgets/custom/', $folder, (string) $why);         // the whole collection is skipped; nothing else is
                continue;
            }
            $colIds[$c['id']] = $c['path'];
            $out['collections'][] = $c;
            $cdir = $base . DIRECTORY_SEPARATOR . $folder;
            foreach (self::folders($cdir) as $w) {
                if (is_file("$cdir/$w/collection.json")) {
                    $err($c['path'], $w, 'collections do not nest');
                    continue;
                }
                $add(realpath($cdir), $c['path'], $w, $c);
            }
        }
        return $out;
    }

    /** the sub-directories of a directory, sorted (hidden entries ignored) */
    private static function folders(string $dir): array
    {
        $f = array_values(array_filter(scandir($dir) ?: [], static fn ($x) => $x[0] !== '.' && is_dir("$dir/$x")));
        sort($f);
        return $f;
    }

    /** One collection's validated manifest (+ its relative path), or null with $why. */
    private static function readCollection(string $base, string $folder, ?string &$why): ?array
    {
        if (!preg_match(self::FOLDER, $folder)) {
            $why = 'folder name must be lowercase letters, digits, hyphens';
            return null;
        }
        $dir = realpath("$base/$folder");
        if ($dir === false || !str_starts_with($dir, $base . DIRECTORY_SEPARATOR) || dirname($dir) !== $base) {
            $why = 'collection folder is outside widgets/custom';            // e.g. a symlink pointing elsewhere
            return null;
        }
        $file = "$dir/collection.json";
        $real = realpath($file);
        if ($real === false || dirname($real) !== $dir || !is_file($real) || filesize($real) > 4096) {
            $why = $real !== false && dirname($real) === $dir && is_file($real) ? 'collection.json is too large' : 'collection.json is outside the collection';
            return null;
        }
        $c = json_decode((string) file_get_contents($real), true);
        if (!is_array($c) || array_is_list($c)) {
            $why = 'collection.json is not a valid JSON object';
            return null;
        }
        $unknown = array_diff(array_keys($c), self::COLLECTION_KEYS);
        if ($unknown) {
            $why = 'collection.json: unknown key "' . implode('", "', $unknown) . '"';
            return null;
        }
        if (($c['schema'] ?? null) !== 1) {
            $why = 'collection.json: unsupported schema (must be 1)';
            return null;
        }
        if (!is_string($c['id'] ?? null) || !preg_match(self::FOLDER, $c['id']) || in_array($c['id'], self::RESERVED, true)) {
            $why = 'collection.json: id must be lowercase letters, digits, hyphens and not one of ' . implode(', ', self::RESERVED);
            return null;
        }
        if (!self::plain($c['name'] ?? null, 60)) {
            $why = 'collection.json: name: plain text, 1-60 characters';
            return null;
        }
        if (isset($c['description']) && !self::plain($c['description'], 200)) {
            $why = 'collection.json: description: plain text, up to 200 characters';
            return null;
        }
        return ['id' => $c['id'], 'name' => trim($c['name']), 'description' => isset($c['description']) ? trim($c['description']) : '',
            'path' => "widgets/custom/$folder/"];
    }

    private static function plain(mixed $v, int $max): bool
    {
        return is_string($v) && trim($v) !== '' && strlen($v) <= $max && !preg_match('/[<>\x00-\x1f]/', $v);
    }

    /** One package's validated manifest (+ path, + a content version for cache busting), or null with $why. */
    private static function read(string $appRoot, string $base, string $source, string $folder, ?string &$why, ?string $rel = null): ?array
    {
        if (!preg_match(self::FOLDER, $folder)) {
            $why = 'folder name must be lowercase letters, digits, hyphens';
            return null;
        }
        $dir = realpath("$base/$folder");
        // the package must really be inside widgets/<source>/ (no symlink pointing elsewhere)
        if ($dir === false || !str_starts_with($dir, $base . DIRECTORY_SEPARATOR)) {
            $why = 'package folder is outside ' . ($rel ?? "widgets/$source/");
            return null;
        }
        $file = "$dir/widget.json";
        if (!is_file($file) || filesize($file) > 16384) {
            $why = is_file($file) ? 'widget.json is too large' : 'no widget.json';
            return null;
        }
        $m = json_decode((string) file_get_contents($file), true);
        if (!is_array($m) || array_is_list($m)) {
            $why = 'widget.json is not a valid JSON object';
            return null;
        }
        $unknown = array_diff(array_keys($m), self::KEYS);
        if ($unknown) {
            $why = 'unknown key "' . implode('", "', $unknown) . '"';
            return null;
        }
        if (($m['schema'] ?? null) !== 1) {
            $why = 'unsupported schema (must be 1)';
            return null;
        }
        $want = $source === 'custom' ? "custom.$folder" : $folder;
        if (($m['id'] ?? null) !== $want) {
            $why = "id must be \"$want\"";
            return null;
        }
        if (!is_string($m['name'] ?? null) || trim($m['name']) === '' || strlen($m['name']) > 60 || preg_match('/[<>]/', $m['name'])) {
            $why = 'name: plain text, 1-60 characters';
            return null;
        }
        if (($m['source'] ?? null) !== $source) {
            $why = "source must be \"$source\" (the folder it lives in)";
            return null;
        }
        if (!is_string($m['version'] ?? null) || !preg_match('/^\d+\.\d+\.\d+$/', $m['version'])) {
            $why = 'version must be like 1.0.0';
            return null;
        }
        $stamp = [filemtime($file), filesize($file)];
        foreach (['entry' => '.js', 'style' => '.css'] as $k => $ext) {
            $f = $m[$k] ?? '';
            if (!is_string($f) || !preg_match('/^[a-z0-9][a-z0-9._-]*' . preg_quote($ext, '/') . '$/', $f) || str_contains($f, '..')) {
                $why = "$k must be a $ext file name inside the package";
                return null;
            }
            $real = realpath("$dir/$f");
            if ($real === false || !is_file($real) || dirname($real) !== $dir) {
                $why = "$k file \"$f\" is missing";
                return null;
            }
            $stamp[] = filemtime($real);
            $stamp[] = filesize($real);
        }
        if (($m['assets'] ?? null) !== 'assets/') {
            $why = 'assets must be "assets/"';
            return null;
        }
        if (!is_string($m['api'] ?? null) || !preg_match('/^[A-Z][A-Za-z0-9]{0,40}$/', $m['api'])) {
            $why = 'api must be the global the entry defines (e.g. MaisonLight)';
            return null;
        }
        if (isset($m['category'])) {
            if ($source !== 'custom' || !is_string($m['category']) || !preg_match(self::CATEGORY, $m['category'])) {
                $why = 'category: custom widgets only, a lowercase id such as ' . implode(', ', array_slice(array_keys(self::CATEGORIES), 0, 6)) . ', …';
                return null;
            }
        }
        if (isset($m['basedOn'])) {
            if ($source !== 'custom' || !is_string($m['basedOn']) || !preg_match(self::FOLDER, $m['basedOn']) || !is_file("$appRoot/widgets/default/{$m['basedOn']}/widget.json")) {
                $why = 'basedOn: only for custom widgets, the id of an existing default widget';
                return null;
            }
        }
        if (isset($m['ha'])) {
            $ha = $m['ha'];
            $list = static fn ($v) => is_array($v) && array_is_list($v) && count($v) >= 1 && count($v) <= 12
                && array_filter($v, static fn ($x) => is_string($x) && preg_match('/^[a-z][a-z0-9_]{0,39}$/', $x)) === $v;
            if (is_array($ha) && ($ha['binding'] ?? null) === 'roles') {
                // the ROLES binding: several named entity roles + named action slots, all declared here (no role name is known to the core)
                if ($source !== 'custom') {
                    $why = 'ha: custom widgets only';
                    return null;
                }
                $why = self::checkRoles($ha, $list);
                if ($why !== null) {
                    return null;
                }
                return $m + ['path' => ($rel ?? "widgets/$source/") . "$folder/", 'v' => substr(hash('sha256', implode('|', $stamp)), 0, 10)];
            }
            if ($source !== 'custom' || !is_array($ha) || array_is_list($ha) || array_diff(array_keys($ha), ['binding', 'domains', 'deviceClasses', 'actions'])
                || (isset($ha['binding']) && !in_array($ha['binding'], self::HA_BINDINGS, true))
                || (isset($ha['domains']) && !$list($ha['domains'])) || (isset($ha['deviceClasses']) && !$list($ha['deviceClasses']))) {
                $why = 'ha: { binding?: ' . implode('|', self::HA_BINDINGS) . ', domains?: [..], deviceClasses?: [..], actions?: [..] } (custom widgets only)';
                return null;
            }
            if (isset($ha['actions'])) {
                $acts = $ha['actions'];
                if (!$list($acts) || count(array_unique($acts)) !== count($acts)) {
                    $why = 'ha.actions: a list of action names';
                    return null;
                }
                if (($ha['binding'] ?? 'entity') !== 'entity') {
                    $why = 'ha.actions: only with the "entity" binding';
                    return null;
                }
                if (!isset($ha['domains'])) {
                    $why = 'ha.actions: needs ha.domains (' . implode(', ', array_keys(self::ACTIONS)) . ')';
                    return null;
                }
                foreach ($ha['domains'] as $d) {
                    $bad = array_diff($acts, self::ACTIONS[$d] ?? []);
                    if ($bad) {
                        $why = "ha.actions: \"" . implode('", "', $bad) . "\" not allowed for domain \"$d\" (allowed: "
                            . (isset(self::ACTIONS[$d]) ? implode(', ', self::ACTIONS[$d]) : 'none') . ')';
                        return null;
                    }
                }
            }
        }
        // the package's location as the pages see it, and a content version (changes when the package files change)
        return $m + ['path' => ($rel ?? "widgets/$source/") . "$folder/", 'v' => substr(hash('sha256', implode('|', $stamp)), 0, 10)];
    }

    /**
     * Validate a `"ha": { "binding": "roles", "roles": {…}, "actionSlots": {…} }` declaration. Returns the error text, or null when valid.
     *   roles        1–12 named roles: { label, domains[1..12], deviceClasses?[..], multiple?: bool, max?: 2..20 (multiple only), required?: bool }
     *   actionSlots  0–6 named slots:  { label, domains[1..], actions[1..], max?: 1..8, required?: bool, section? ("… {n} …") };
     *                every action must be allowed for EVERY declared domain (ACTIONS) — a slot can never reach beyond the fixed table
     * Anything else (unknown key, wrong type, legacy keys such as domains / deviceClasses / actions next to "roles") is refused.
     */
    private static function checkRoles(array $ha, callable $list): ?string
    {
        if (array_diff(array_keys($ha), ['binding', 'roles', 'actionSlots'])) {
            return 'ha (roles binding): only binding, roles and actionSlots are allowed (the single-entity keys domains / deviceClasses / actions do not combine with "roles")';
        }
        $roles = $ha['roles'] ?? null;
        if (!is_array($roles) || $roles === [] || array_is_list($roles) || count($roles) > 12) {
            return 'ha.roles: an object of 1-12 named roles';
        }
        $text = static fn ($v, int $n) => is_string($v) && trim($v) !== '' && strlen($v) <= $n && !preg_match('/[<>\x00-\x1f]/', $v);
        $seen = [];
        foreach ($roles as $name => $r) {
            $name = (string) $name;
            if (!preg_match(self::ROLE_NAME, $name)) {
                return "ha.roles: role name \"$name\" must be lowercase letters, digits, underscores (starting with a letter)";
            }
            if (!is_array($r) || array_is_list($r) || array_diff(array_keys($r), self::ROLE_KEYS)) {
                return "ha.roles.$name: an object with only " . implode(', ', self::ROLE_KEYS);
            }
            if (!$text($r['label'] ?? null, 40)) {
                return "ha.roles.$name.label: plain text, 1-40 characters";
            }
            if (!$list($r['domains'] ?? null)) {
                return "ha.roles.$name.domains: a list of 1-12 domain names";
            }
            if (isset($r['deviceClasses']) && !$list($r['deviceClasses'])) {
                return "ha.roles.$name.deviceClasses: a list of 1-12 device classes";
            }
            foreach (['multiple', 'required', 'area'] as $b) {
                if (isset($r[$b]) && !is_bool($r[$b])) {
                    return "ha.roles.$name.$b: true or false";
                }
            }
            if (!empty($r['area']) && empty($r['multiple'])) {
                return "ha.roles.$name.area: only together with \"multiple\": true";
            }
            if (isset($r['max'])) {
                if (empty($r['multiple']) || !is_int($r['max']) || $r['max'] < 2 || $r['max'] > 20) {
                    return "ha.roles.$name.max: a whole number 2-20, only together with \"multiple\": true";
                }
            }
            $seen[$name] = true;
        }
        if (isset($ha['actionSlots'])) {
            $slots = $ha['actionSlots'];
            if (!is_array($slots) || $slots === [] || array_is_list($slots) || count($slots) > 6) {
                return 'ha.actionSlots: an object of 1-6 named slots';
            }
            foreach ($slots as $name => $sl) {
                $name = (string) $name;
                if (!preg_match(self::ROLE_NAME, $name) || isset($seen[$name])) {
                    return "ha.actionSlots: slot name \"$name\" must be lowercase letters, digits, underscores and not repeat a role name";
                }
                if (!is_array($sl) || array_is_list($sl) || array_diff(array_keys($sl), self::SLOT_KEYS)) {
                    return "ha.actionSlots.$name: an object with only " . implode(', ', self::SLOT_KEYS);
                }
                if (!$text($sl['label'] ?? null, 40)) {
                    return "ha.actionSlots.$name.label: plain text, 1-40 characters";
                }
                if (!$list($sl['domains'] ?? null) || !$list($sl['actions'] ?? null) || count(array_unique($sl['actions'])) !== count($sl['actions'])) {
                    return "ha.actionSlots.$name: domains and actions are lists of names (no repeats)";
                }
                foreach ($sl['domains'] as $d) {
                    $bad = array_diff($sl['actions'], self::ACTIONS[$d] ?? []);
                    if ($bad) {
                        return "ha.actionSlots.$name: \"" . implode('", "', $bad) . "\" is not allowed for domain \"$d\" (allowed: "
                            . (isset(self::ACTIONS[$d]) ? implode(', ', self::ACTIONS[$d]) : 'none') . ')';
                    }
                }
                if (isset($sl['max']) && (!is_int($sl['max']) || $sl['max'] < 1 || $sl['max'] > 8)) {
                    return "ha.actionSlots.$name.max: a whole number 1-8";
                }
                if (isset($sl['required']) && !is_bool($sl['required'])) {
                    return "ha.actionSlots.$name.required: true or false";
                }
                if (isset($sl['section']) && !$text($sl['section'], 40)) {
                    return "ha.actionSlots.$name.section: plain text up to 40 characters (\"{n}\" becomes the slot number)";
                }
            }
        }
        return null;
    }

    /**
     * Server-side re-check of one action request made through the custom-widget action channel: the package must be a
     * valid installed custom widget whose manifest declares this action AND this entity's domain.
     */
    public static function declares(string $appRoot, string $widgetId, string $entityId, string $action): bool
    {
        if (!preg_match(self::CUSTOM_ID, $widgetId) || !preg_match('/^([a-z0-9_]+)\.[a-z0-9_]+$/', $entityId, $em)) {
            return false;
        }
        // the SAME discovery as the editor (standalone or inside a collection; duplicates already rejected)
        $m = null;
        foreach (self::scan($appRoot, 'custom', self::defaultApis($appRoot))['packages'] as $p) {
            if ($p['id'] === $widgetId) {
                $m = $p;
                break;
            }
        }
        $ha = is_array($m) ? ($m['ha'] ?? null) : null;
        if (is_array($ha) && ($ha['binding'] ?? null) === 'roles') {
            // the roles binding: some declared action slot allows this action on this domain (and the fixed table agrees)
            foreach ((array) ($ha['actionSlots'] ?? []) as $sl) {
                if (is_array($sl) && in_array($action, $sl['actions'] ?? [], true) && in_array($em[1], $sl['domains'] ?? [], true)
                    && in_array($action, self::ACTIONS[$em[1]] ?? [], true)) {
                    return true;
                }
            }
            return false;
        }
        return is_array($ha) && in_array($action, $ha['actions'] ?? [], true) && in_array($em[1], $ha['domains'] ?? [], true)
            && in_array($action, self::ACTIONS[$em[1]] ?? [], true);
    }

    /** The default widgets' API names (from widgets/index.js's sources), so a custom package cannot shadow one. */
    public static function defaultApis(string $appRoot): array
    {
        return array_map(static fn ($m) => $m['api'], self::scan($appRoot, 'default')['packages']);
    }
}
