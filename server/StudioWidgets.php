<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * WIDGET STUDIO DEFINITIONS — reusable widgets made in Widget Studio, and the user's COLLECTIONS, stored server-side (private, no database).
 *
 *   <private>/studio-widgets/<id>.json   { format: 1, id, revision, created, updated, definition }
 *
 * - id          "w" + 16 hex characters (random), chosen by the server; never derived from the name and never changed
 *               (renaming a widget changes definition.meta.name only), so dashboard instances that reference it keep working.
 * - revision    +1 on every save (optimistic concurrency, as dashboards): a save names the revision it was based on.
 * - definition  DECLARATIVE data only — never code:
 *     meta       { name (1–60), collection (a COLLECTION id), category (one of CATEGORIES), description (≤ 200), icon ('mdi:…') }
 *                the library metadata. COLLECTION = a user-facing organisational group (IniqDash, Maison, …); CATEGORY = what kind of
 *                widget it is; SOURCE (where it comes from) is implied: every definition here is user-created. None of them changes
 *                what the widget does.
 *
 * USER COLLECTIONS: <private>/studio-widgets/collections.json  { format: 1, collections: [{ id, name }] }
 * - id    "c" + 12 hex characters (random, stable — a later rename keeps every widget in it); name 1–60, unique (case-insensitive),
 *         never the name of the first-party collection (IniqDash). A definition may name a user collection, the first-party one
 *         (FIRST_PARTY_COLLECTION) or an installed package collection (the caller says which ids exist: save($allowed)).
 *         Renaming / deleting collections is not offered yet.
 *     canvas     { w, h }                          its logical design size
 *     components [{ id, name?, type, x, y, w, h, config, data, binding? }]   the CONTROLS (Widget Studio): a stable id, a unique VB-style name
 *     slots      [{ id: 's' + 8 hex (stable), label: its name ("Climate"), family?: the HA family it expects, preview?: the designer's entity }]
 *                the SOURCE GROUPS (internally entity slots) a placed copy assigns (the dashboard item's config.entities); preview: design only
 *     properties [{ id: 'p' + 8 hex (stable), name (unique), group: a slot id, read, attribute? }]   the WIDGET PROPERTIES — never an entity
 *       binding  (a control) { source: 'ha', property: a property id, action?, unit?, unitText? } — or, older:
 *       binding  { source: 'preview' | 'ha', slot: a slot id, inputs: { <role>: { read: 'state' | 'attribute' | 'derived', attribute?,
 *                  unit?, unitText? } }, action?: { action } }   — or, an older definition: each input names its entity:
 *                { source, inputs: { <role>: { entity, read: 'state' | 'attribute' | 'derived', attribute?,
 *                  unit?: 'entity' | 'hide' | 'override', unitText? } }, action?: { entity?, action } }
 *                which Home Assistant entity / value feeds each input, and which NORMALISED action (HaService::plan decides,
 *                from the entity's real capabilities, whether it is allowed and which service it becomes) an interaction asks for.
 * Never stored: Home Assistant credentials (keys that look like one are refused), markup, executable text (javascript: …),
 * service names or service data. The browser validates the component model against its component registry first; the server
 * checks independently that it is this shape, within the limits.
 * Deletion is intentionally not offered yet: dashboard instances reference definitions live, and a deletion that silently breaks
 * them needs dependency handling first (docs/WIDGET-STUDIO-POC.md, "Limitations").
 */
final class StudioWidgets
{
    public const MAX_BYTES = 256 * 1024;
    public const MAX_WIDGETS = 200;
    public const ID = '/^w[0-9a-f]{16}$/';
    /** the gallery's categories (components/editor/registry.js CATEGORIES, without the infrastructure ones) */
    public const CATEGORIES = ['controls', 'climate', 'security', 'media', 'sensors', 'energy', 'appliances', 'people', 'time', 'navigation'];
    /** the first-party collection (IniqDash's own widgets) — selectable, never created or renamed here */
    public const FIRST_PARTY_COLLECTION = ['id' => 'iniqdash', 'name' => 'IniqDash'];
    public const COLLECTION_ID = '/^c[0-9a-f]{12}$/';
    public const MAX_COLLECTIONS = 100;
    /** the NORMALISED actions a binding may ask for (HaService::plan checks each against the entity's domain and capabilities) */
    public const ACTIONS = ['toggle', 'turn_on', 'turn_off', 'trigger', 'open', 'close', 'stop', 'lock', 'unlock', 'play', 'pause', 'play_pause', 'next', 'previous',
        'power', 'start', 'dock', 'cancel', 'finish', 'brightness', 'position', 'volume', 'set_value', 'set_temperature', 'percentage',
        'select_option', 'set_hvac_mode', 'set_preset_mode', 'set_fan_mode', 'source'];
    private const ENTITY = '/^[a-z0-9_]+\.[a-z0-9_]+$/';
    private const SLOT = '/^s[0-9a-f]{8}$/';
    private const ATTR = '/^[A-Za-z0-9_]{1,64}$/';
    private const PROP = '/^p[0-9a-f]{8}$/';
    private const FAMILY = '/^[a-z][a-z_]{1,29}$/';
    private const NAME = '/^[A-Za-z][A-Za-z0-9_]{0,39}$/';
    private const CREDENTIAL = '/token|password|passwd|secret|api_?key|authorization|bearer|credential/i';
    private const DEPTH = 12;

    public static function dir(): ?string
    {
        $p = Paths::privateDir();
        if ($p === null) {
            return null;
        }
        $d = $p . DIRECTORY_SEPARATOR . 'studio-widgets';
        if (!is_dir($d) && !@mkdir($d, 0700, true) && !is_dir($d)) {
            return null;
        }
        return $d;
    }

    private static function file(string $dir, string $id): string
    {
        return $dir . DIRECTORY_SEPARATOR . $id . '.json';
    }

    /** every readable definition { id, revision, updated, definition }, by name (unreadable files are skipped, never deleted) */
    public static function list(): array
    {
        $dir = self::dir();
        if ($dir === null) {
            return [];
        }
        $out = [];
        foreach (glob($dir . DIRECTORY_SEPARATOR . 'w*.json') ?: [] as $f) {
            $id = basename($f, '.json');
            if (!preg_match(self::ID, $id)) {
                continue;
            }
            $e = self::readFile($f);
            if ($e !== null) {
                $out[] = $e;
            }
        }
        usort($out, static fn ($a, $b) => strcasecmp((string) $a['definition']->meta->name, (string) $b['definition']->meta->name) ?: strcmp($a['id'], $b['id']));
        return $out;
    }

    public static function get(mixed $id, ?string &$why = null): ?array
    {
        $dir = self::dir();
        if (!is_string($id) || !preg_match(self::ID, $id) || $dir === null || !is_file(self::file($dir, $id))) {
            $why = 'not_found';
            return null;
        }
        $e = self::readFile(self::file($dir, $id));
        if ($e === null) {
            $why = 'corrupt';
        }
        return $e;
    }

    private static function readFile(string $f): ?array
    {
        $raw = @file_get_contents($f);
        if (!is_string($raw) || strlen($raw) > self::MAX_BYTES + 4096) {
            return null;
        }
        $e = json_decode($raw, false, 64);
        if (!is_object($e) || ($e->format ?? null) !== 1 || !is_string($e->id ?? null) || !is_int($e->revision ?? null)
            || !is_object($e->definition ?? null) || !self::check($e->definition)) {
            return null;
        }
        return ['id' => $e->id, 'revision' => $e->revision, 'created' => (string) ($e->created ?? ''), 'updated' => (string) ($e->updated ?? ''), 'definition' => $e->definition];
    }

    /* ------------------------------------------------------------------ validation (shape and limits; never "repairs") */

    public static function check(mixed $d, ?string &$why = null): bool
    {
        if (!is_object($d)) {
            $why = 'not a widget definition (expected an object)';
            return false;
        }
        $v = get_object_vars($d);
        if (array_diff(array_keys($v), ['schema', 'meta', 'canvas', 'slots', 'properties', 'settings', 'components'])) {
            $why = 'unknown key in the definition';
            return false;
        }
        // schema 2: WIDGET PROPERTIES are the only semantics (older definitions — no schema — are migrated once by the client)
        if (array_key_exists('schema', $v) && $v['schema'] !== 2) {
            $why = 'schema: 2';
            return false;
        }
        $propsOnly = ($v['schema'] ?? null) === 2;
        $m = $v['meta'] ?? null;
        if (!is_object($m) || array_diff(array_keys(get_object_vars($m)), ['name', 'collection', 'category', 'description', 'icon'])) {
            $why = 'meta: name, collection, category, description, icon';
            return false;
        }
        if (Dashboards::cleanName($m->name ?? null) === null) {
            $why = 'meta.name: plain text, 1–60 characters';
            return false;
        }
        if (property_exists($m, 'collection') && (!is_string($m->collection) || !preg_match('/^[a-z][a-z0-9-]{0,39}$/', $m->collection))) {
            $why = 'meta.collection: a collection id';
            return false;
        }
        if (!in_array($m->category ?? null, self::CATEGORIES, true)) {
            $why = 'meta.category: one of ' . implode(', ', self::CATEGORIES);
            return false;
        }
        $desc = $m->description ?? '';
        if (!is_string($desc) || mb_strlen($desc) > 200 || preg_match('/[\x00-\x09\x0b-\x1f\x7f<>]/', $desc)) {
            $why = 'meta.description: plain text, up to 200 characters';
            return false;
        }
        if (!is_string($m->icon ?? null) || !preg_match('/^mdi:[a-z0-9-]{1,64}$/', $m->icon)) {
            $why = 'meta.icon: a Material Design Icon (mdi:…)';
            return false;
        }
        $c = $v['canvas'] ?? null;
        if (!is_object($c) || !is_int($c->w ?? null) || !is_int($c->h ?? null) || $c->w < 40 || $c->w > 2000 || $c->h < 40 || $c->h > 2000
            || array_diff(array_keys(get_object_vars($c)), ['w', 'h', 'fit']) || (property_exists($c, 'fit') && !in_array($c->fit, ['fit', 'fill'], true))) {
            $why = 'canvas: { w, h } in logical px (fit: fit | fill)';
            return false;
        }
        // SOURCE GROUPS (entity slots): what a placed copy assigns — { id: s + 8 hex (stable), label: its name, family?: the HA family it
        // expects, preview?: the designer's entity (design only) }
        $slots = $v['slots'] ?? [];
        if (!is_array($slots) || !array_is_list($slots) || count($slots) > 24) {
            $why = 'slots: a list of at most 24';
            return false;
        }
        $slotIds = [];
        foreach ($slots as $sl) {
            if (!is_object($sl) || array_diff(array_keys(get_object_vars($sl)), ['id', 'label', 'family', 'preview', 'optional']) || !is_string($sl->id ?? null) || !preg_match(self::SLOT, $sl->id)
                || (property_exists($sl, 'optional') && $sl->optional !== true)
                || (property_exists($sl, 'family') && (!is_string($sl->family) || !preg_match(self::FAMILY, $sl->family)))
                || isset($slotIds[$sl->id]) || Dashboards::cleanName($sl->label ?? null) === null || mb_strlen((string) $sl->label) > 40 || preg_match('/[<>]/', (string) $sl->label)
                || (property_exists($sl, 'preview') && (!is_string($sl->preview) || strlen($sl->preview) > 120 || !preg_match(self::ENTITY, $sl->preview)))) {
                $why = 'slots: { id, label (1–40), family?, preview? (an entity id), optional? (true) }';
                return false;
            }
            $slotIds[$sl->id] = true;
        }
        // WIDGET PROPERTIES: { id: p + 8 hex (stable), name, group: a source group, read: state | attribute | derived, attribute? } — never an entity
        $props = $v['properties'] ?? [];
        if (!is_array($props) || !array_is_list($props) || count($props) > 48) {
            $why = 'properties: a list of at most 48';
            return false;
        }
        $propIds = [];
        $propNames = [];
        foreach ($props as $p) {
            $read = is_object($p) ? ($p->read ?? 'state') : null;
            if (!is_object($p) || array_diff(array_keys(get_object_vars($p)), ['id', 'name', 'group', 'read', 'attribute']) || !is_string($p->id ?? null) || !preg_match(self::PROP, $p->id)
                || isset($propIds[$p->id]) || Dashboards::cleanName($p->name ?? null) === null || mb_strlen((string) $p->name) > 40 || preg_match('/[<>]/', (string) $p->name)
                || isset($propNames[mb_strtolower(trim((string) $p->name))]) || !is_string($p->group ?? null) || !isset($slotIds[$p->group])
                || !in_array($read, ['state', 'attribute', 'derived'], true) || ($read !== 'state' && (!is_string($p->attribute ?? null) || !preg_match(self::ATTR, $p->attribute)))
                || ($read === 'state' && property_exists($p, 'attribute'))) {
                $why = 'properties: { id, name (1–40, unique), group (a source group), read, attribute? }';
                return false;
            }
            $propIds[$p->id] = true;
            $propNames[mb_strtolower(trim((string) $p->name))] = true;
        }
        $list = $v['components'] ?? null;
        if (!is_array($list) || !array_is_list($list) || count($list) > 40) {
            $why = 'components: a list of at most 40';
            return false;
        }
        $ids = [];
        $names = [];
        foreach ($list as $i => $x) {
            $at = 'component ' . ($i + 1);
            if (!is_object($x) || array_diff(array_keys(get_object_vars($x)), ['id', 'name', 'type', 'x', 'y', 'w', 'h', 'config', 'data', 'binding', 'locked', 'hidden', 'group', 'showWhen', 'when', 'rotate', 'style', 'pin', 'tap'])) {
                $why = "$at: unknown key";
                return false;
            }
            // Widget Studio's Layers: locked / hidden are true or absent; a group is a short Studio id (elements that move together)
            foreach (['locked', 'hidden'] as $k) {
                if (property_exists($x, $k) && $x->$k !== true) {
                    $why = "$at: $k must be true when present";
                    return false;
                }
            }
            if (property_exists($x, 'group') && (!is_string($x->group) || !preg_match('/^g[0-9]{1,4}$/', $x->group))) {
                $why = "$at: group: a Studio group id";
                return false;
            }
            if (!is_string($x->type ?? null) || !preg_match('/^[a-z][a-z0-9-]{1,40}$/', $x->type)) {
                $why = "$at: a component type is required";
                return false;
            }
            if (!is_string($x->id ?? null) || !preg_match('/^[a-z][a-z0-9-]{0,40}-[0-9]{1,4}$/', $x->id) || isset($ids[$x->id])) {
                $why = "$at: a unique instance id is required";
                return false;
            }
            $ids[$x->id] = true;
            // its NAME (VB-style, unique in the widget — e.g. txtRoomTemp); the stable id never depends on it
            if (property_exists($x, 'name') && (!is_string($x->name) || !preg_match(self::NAME, $x->name) || isset($names[strtolower($x->name)]))) {
                $why = "$at: name: a unique name (letters, digits, _; starting with a letter)";
                return false;
            }
            if (property_exists($x, 'name')) {
                $names[strtolower($x->name)] = true;
            }
            // ROTATION (degrees, about the element's centre): a number in −360…360 when present
            if (property_exists($x, 'rotate') && (!(is_int($x->rotate) || is_float($x->rotate)) || $x->rotate < -360 || $x->rotate > 360)) {
                $why = "$at: rotate: degrees, -360 to 360";
                return false;
            }
            // PINS (how it follows a cell of another shape when the widget fills it): { h?: left|right|stretch|center|scale, v?: top|bottom|… }
            if (property_exists($x, 'pin') && (!is_object($x->pin) || array_diff(array_keys(get_object_vars($x->pin)), ['h', 'v'])
                || (property_exists($x->pin, 'h') && !in_array($x->pin->h, ['left', 'right', 'stretch', 'center', 'scale'], true))
                || (property_exists($x->pin, 'v') && !in_array($x->pin->v, ['top', 'bottom', 'stretch', 'center', 'scale'], true)))) {
                $why = "$at: pin: { h: left | right | stretch | center | scale, v: top | bottom | stretch | center | scale }";
                return false;
            }
            // ON TAP: open a page of the dashboard ({ page: a page id })
            if (property_exists($x, 'tap') && (!is_object($x->tap) || array_keys(get_object_vars($x->tap)) !== ['page'] || !is_string($x->tap->page) || !preg_match('/^[A-Za-z0-9_-]{1,60}$/', $x->tap->page))) {
                $why = "$at: tap: { page: a page id }";
                return false;
            }
            if (property_exists($x, 'style') && !self::checkStyle($x->style)) {
                $why = "$at: style: opacity 0-100, blend (a CSS blend mode), blur 0-40, shadows (up to 6), clip, radius / corner radii 0-400";
                return false;
            }
            foreach (['x', 'y', 'w', 'h'] as $k) {
                if (!is_int($x->$k ?? null) || $x->$k < 0 || $x->$k > 2000) {
                    $why = "$at: $k must be a whole number of logical px";
                    return false;
                }
            }
            foreach (['config', 'data'] as $k) {
                if (property_exists($x, $k) && !is_object($x->$k)) {
                    $why = "$at: $k must be an object";
                    return false;
                }
            }
            if (property_exists($x, 'binding') && !self::checkBinding($x->binding, $at, $why)) {
                return false;
            }
            if ($propsOnly && property_exists($x, 'binding') && !property_exists($x->binding, 'property')) {
                $why = "$at: binding: a widget property (schema 2 has no other binding)";
                return false;
            }
            if (is_object($x->binding ?? null) && property_exists($x->binding, 'property') && !isset($propIds[$x->binding->property])) {
                $why = "$at: binding.property: one of the widget's properties";
                return false;
            }
            if (is_object($x->binding ?? null) && property_exists($x->binding, 'slot') && !isset($slotIds[$x->binding->slot])) {
                $why = "$at: binding.slot: one of the definition's entity slots";
                return false;
            }
            // WHEN: appearance from a property's current value — up to 4 { property, test, value, set: { key: scalar } }
            if (property_exists($x, 'when') && !self::checkWhen($x->when, $propIds)) {
                $why = "$at: when: up to 4 rules { property (one of the widget's), test (is | not | above | below), value, set: { configuration key: value } }";
                return false;
            }
            // SHOW WHEN: shown only when a widget property has a source in the copy — { property: one of the widget's properties }
            $sw = $x->showWhen ?? null;
            if (property_exists($x, 'showWhen') && !(is_object($sw) && array_keys(get_object_vars($sw)) === ['control', 'is'] && is_string($sw->control)
                && preg_match('/^[a-z][a-z0-9-]{0,40}-[0-9]{1,4}$/', $sw->control) && is_string($sw->is) && preg_match('/^[A-Za-z0-9_-]{1,60}$/', $sw->is))
                && (!is_object($sw) || array_keys(get_object_vars($sw)) !== ['property']
                || !is_string($sw->property) || !isset($propIds[$sw->property]))) {
                $why = "$at: showWhen: { property: one of the widget's properties }";
                return false;
            }
        }
        // COPY SETTINGS: what each placed copy may set differently — { id: k + 8 hex (stable), label (1–40), component: a component id,
        // key: one of its configuration keys } (the copy's value is checked against that component's field when it is drawn)
        $settings = $v['settings'] ?? [];
        if (!is_array($settings) || !array_is_list($settings) || count($settings) > 24) {
            $why = 'settings: a list of at most 24';
            return false;
        }
        $setIds = [];
        foreach ($settings as $st) {
            if (!is_object($st) || array_diff(array_keys(get_object_vars($st)), ['id', 'label', 'component', 'key']) || !is_string($st->id ?? null) || !preg_match('/^k[0-9a-f]{8}$/', $st->id)
                || isset($setIds[$st->id]) || Dashboards::cleanName($st->label ?? null) === null || mb_strlen((string) $st->label) > 40 || preg_match('/[<>]/', (string) $st->label)
                || !is_string($st->component ?? null) || !isset($ids[$st->component]) || !is_string($st->key ?? null) || !preg_match('/^[A-Za-z][A-Za-z0-9]{0,40}$/', $st->key)) {
                $why = 'settings: { id, label (1–40), component (one of its components), key (a configuration key) }';
                return false;
            }
            $setIds[$st->id] = true;
        }
        return self::walk($d, 0, $why);
    }

    private const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

    /** an element's STYLE (every element): bounded numbers, a known blend mode, checked shadow colours — nothing free-form */
    private static function checkStyle(mixed $s): bool
    {
        if (!is_object($s)) {
            return false;
        }
        $num = static fn ($v, $lo, $hi) => (is_int($v) || is_float($v)) && $v >= $lo && $v <= $hi;
        $colour = static fn ($v) => is_string($v) && (preg_match('/^#[0-9a-fA-F]{6}$/', $v) || preg_match('/^[a-z][a-z0-9-]{1,40}$/', $v));
        foreach (get_object_vars($s) as $k => $v) {
            $ok = match ($k) {
                'opacity' => $num($v, 0, 100),
                'blend' => in_array($v, self::BLENDS, true),
                'blur' => $num($v, 0, 40),
                'clip' => is_bool($v),
                'clipTo' => is_string($v) && preg_match('/^[a-z][a-z0-9-]{0,40}-[0-9]{1,4}$/', $v),
                'radius', 'radiusTL', 'radiusTR', 'radiusBR', 'radiusBL' => $num($v, 0, 400),
                'shadows' => is_array($v) && array_is_list($v) && count($v) <= 6 && array_reduce($v, static fn ($c, $sh) => $c && is_object($sh)
                    && !array_diff(array_keys(get_object_vars($sh)), ['x', 'y', 'blur', 'spread', 'color', 'opacity', 'inset'])
                    && (!property_exists($sh, 'color') || $colour($sh->color))
                    && array_reduce(['x', 'y', 'blur', 'spread', 'opacity'], static fn ($d, $f) => $d && (!property_exists($sh, $f) || $num($sh->$f, -200, 200)), true), true),
                default => false,
            };
            if (!$ok) {
                return false;
            }
        }
        return true;
    }

    /** a component's WHEN rules: declarative only — a property it has, a fixed test, a scalar value, scalar configuration values */
    private static function checkWhen(mixed $w, array $propIds): bool
    {
        if (!is_array($w) || !array_is_list($w) || count($w) < 1 || count($w) > 4) {
            return false;
        }
        foreach ($w as $r) {
            if (!is_object($r) || array_diff(array_keys(get_object_vars($r)), ['property', 'test', 'value', 'set'])
                || !is_string($r->property ?? null) || !isset($propIds[$r->property]) || !in_array($r->test ?? null, ['is', 'not', 'above', 'below'], true)
                || !((is_string($r->value ?? null) && mb_strlen($r->value) <= 60 && !preg_match('/[<>]/', $r->value)) || is_int($r->value ?? null) || is_float($r->value ?? null))
                || !is_object($r->set ?? null) || count(get_object_vars($r->set)) < 1 || count(get_object_vars($r->set)) > 8) {
                return false;
            }
            foreach (get_object_vars($r->set) as $k => $v) {
                if (!preg_match('/^[A-Za-z][A-Za-z0-9]{0,40}$/', (string) $k) || !(is_bool($v) || is_int($v) || is_float($v) || (is_string($v) && strlen($v) <= 400 && !preg_match('/[<>]/', $v)))) {
                    return false;
                }
            }
        }
        return true;
    }

    /** a component's binding: declarative only (entities, what to read, a normalised action) */
    public static function checkBinding(mixed $b, string $at, ?string &$why): bool
    {
        if (!is_object($b) || array_diff(array_keys(get_object_vars($b)), ['source', 'slot', 'shared', 'property', 'unit', 'unitText', 'inputs', 'action'])) {
            $why = "$at: binding: source, property, slot, shared, inputs, action";
            return false;
        }
        // a PROPERTY binding (Widget Studio): the widget property it uses, a press action, a unit choice — nothing else, never an entity
        if (property_exists($b, 'property')) {
            if (!is_string($b->property) || !preg_match(self::PROP, $b->property) || ($b->source ?? null) !== 'ha' || array_diff(array_keys(get_object_vars($b)), ['source', 'property', 'unit', 'unitText', 'action'])
                || (property_exists($b, 'unit') && !in_array($b->unit, ['hide', 'override'], true))
                || (property_exists($b, 'unitText') && (!is_string($b->unitText) || mb_strlen($b->unitText) > 12 || preg_match('/[<>\x00-\x1f]/', $b->unitText)))
                || (property_exists($b, 'action') && (!is_object($b->action) || array_diff(array_keys(get_object_vars($b->action)), ['action']) || !in_array($b->action->action ?? null, self::ACTIONS, true)))) {
                $why = "$at: binding: { source: ha, property, unit?, unitText?, action? }";
                return false;
            }
            return true;
        }
        // a SLOT binding names no entity at all (a placed copy assigns it); an older binding names its entities itself
        $slot = property_exists($b, 'slot');
        if ($slot && (!is_string($b->slot) || !preg_match(self::SLOT, $b->slot))) {
            $why = "$at: binding.slot: an entity slot id";
            return false;
        }
        // shared: "Same as" another component's binding (the same slot, which that component names) — a flag only
        if (property_exists($b, 'shared') && ($b->shared !== true || !$slot)) {
            $why = "$at: binding.shared: true, with a slot";
            return false;
        }
        if (!in_array($b->source ?? 'preview', ['preview', 'ha'], true)) {
            $why = "$at: binding.source: preview or ha";
            return false;
        }
        $in = $b->inputs ?? new stdClass();
        if (!is_object($in) || count(get_object_vars($in)) > 12) {
            $why = "$at: binding.inputs must be an object";
            return false;
        }
        foreach (get_object_vars($in) as $role => $x) {
            $w = "$at: input \"" . substr(preg_replace('/[^A-Za-z0-9_]/', '?', (string) $role) ?? '', 0, 24) . '"';
            if (!preg_match('/^[a-z][A-Za-z0-9]{0,23}$/', (string) $role) || !is_object($x)
                || array_diff(array_keys(get_object_vars($x)), ['entity', 'read', 'attribute', 'unit', 'unitText'])) {
                $why = "$w: entity, read, attribute, unit, unitText";
                return false;
            }
            if ($slot ? property_exists($x, 'entity') : (!is_string($x->entity ?? null) || strlen($x->entity) > 120 || !preg_match(self::ENTITY, $x->entity))) {
                $why = $slot ? "$w: a slot binding names no entity (each placed copy assigns it)" : "$w: a Home Assistant entity is required";
                return false;
            }
            $read = $x->read ?? 'state';
            if (!in_array($read, ['state', 'attribute', 'derived'], true)) {
                $why = "$w: read: state, attribute or derived";
                return false;
            }
            if ($read !== 'state' && (!is_string($x->attribute ?? null) || !preg_match(self::ATTR, $x->attribute))) {
                $why = "$w: an attribute is required";
                return false;
            }
            if (property_exists($x, 'unit') && !in_array($x->unit, ['entity', 'hide', 'override'], true)) {
                $why = "$w: unit: entity, hide or override";
                return false;
            }
            if (property_exists($x, 'unitText') && (!is_string($x->unitText) || mb_strlen($x->unitText) > 12 || preg_match('/[<>\x00-\x1f]/', $x->unitText))) {
                $why = "$w: unit text: up to 12 characters";
                return false;
            }
        }
        if (property_exists($b, 'action') && $b->action !== null) {
            $a = $b->action;
            if (!is_object($a) || array_diff(array_keys(get_object_vars($a)), ['entity', 'action'])
                || !in_array($a->action ?? null, self::ACTIONS, true)
                || (property_exists($a, 'entity') && ($slot || !is_string($a->entity) || strlen($a->entity) > 120 || !preg_match(self::ENTITY, $a->entity)))) {
                $why = "$at: binding.action: one of " . implode(', ', self::ACTIONS) . ' (and an entity)';
                return false;
            }
        }
        return true;
    }

    /** every value: plain JSON within the limits — no markup, no executable text, no credential-like key */
    private static function walk(mixed $v, int $depth, ?string &$why): bool
    {
        if ($depth > self::DEPTH) {
            $why = 'nested too deeply';
            return false;
        }
        if (is_string($v)) {
            if (strlen($v) > 4000 || preg_match('/^\s*</', $v) || preg_match('/<\s*(script|svg|img|iframe|object|embed|link|style)\b/i', $v)
                || preg_match('/^\s*(javascript|vbscript|data\s*:\s*text\/html)\s*:?/i', $v)) {
                $why = 'markup or executable text is not allowed';
                return false;
            }
            return true;
        }
        if (is_object($v)) {
            foreach (get_object_vars($v) as $k => $x) {
                if (in_array((string) $k, ['__proto__', 'constructor', 'prototype'], true) || preg_match(self::CREDENTIAL, (string) $k)) {
                    $why = 'reserved or credential-like key "' . substr(preg_replace('/[^A-Za-z0-9_]/', '?', (string) $k) ?? '', 0, 30) . '"';
                    return false;
                }
                if (!self::walk($x, $depth + 1, $why)) {
                    return false;
                }
            }
            return true;
        }
        if (is_array($v)) {
            if (!array_is_list($v) || count($v) > 200) {
                $why = 'unexpected list';
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

    /* ------------------------------------------------------------------ writes (under one lock) */

    /* ------------------------------------------------------------------ user collections */

    /** [{ id, name }] by name */
    public static function collections(): array
    {
        $dir = self::dir();
        $raw = $dir !== null ? @file_get_contents($dir . DIRECTORY_SEPARATOR . 'collections.json') : false;
        $d = is_string($raw) && strlen($raw) < 64 * 1024 ? json_decode($raw, true) : null;
        $out = [];
        foreach (is_array($d) && ($d['format'] ?? null) === 1 && is_array($d['collections'] ?? null) ? $d['collections'] : [] as $c) {
            if (is_array($c) && is_string($c['id'] ?? null) && preg_match(self::COLLECTION_ID, $c['id']) && Dashboards::cleanName($c['name'] ?? null) !== null) {
                $out[] = ['id' => $c['id'], 'name' => $c['name']];
            }
        }
        usort($out, static fn ($a, $b) => strcasecmp($a['name'], $b['name']) ?: strcmp($a['id'], $b['id']));
        return $out;
    }

    /** a new user collection { id, name } (validated name, a stable random id) — persisted at once */
    public static function createCollection(mixed $name): array
    {
        $why = null;
        $n = Dashboards::cleanName($name, $why);
        if ($n === null) {
            return ['ok' => false, 'error' => 'name_invalid'];
        }
        if (preg_match('/[<>]/', $n)) {
            return ['ok' => false, 'error' => 'name_invalid'];
        }
        $dir = self::dir();
        if ($dir === null) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        $h = @fopen($dir . DIRECTORY_SEPARATOR . '.lock', 'c');
        if ($h === false || !flock($h, LOCK_EX)) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        try {
            $list = self::collections();
            $k = mb_strtolower($n, 'UTF-8');
            if ($k === mb_strtolower(self::FIRST_PARTY_COLLECTION['name'], 'UTF-8') || array_filter($list, static fn ($c) => mb_strtolower($c['name'], 'UTF-8') === $k)) {
                return ['ok' => false, 'error' => 'name_taken'];
            }
            if (count($list) >= self::MAX_COLLECTIONS) {
                return ['ok' => false, 'error' => 'too_many'];
            }
            $ids = array_column($list, 'id');
            do {
                $id = 'c' . bin2hex(random_bytes(6));
            } while (in_array($id, $ids, true));
            $c = ['id' => $id, 'name' => $n];
            $list[] = $c;
            $json = json_encode(['format' => 1, 'collections' => $list], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $f = $dir . DIRECTORY_SEPARATOR . 'collections.json';
            $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
            $old = umask(0077);
            try {
                if (!is_string($json) || @file_put_contents($tmp, $json, LOCK_EX) !== strlen($json) || !@rename($tmp, $f)) {
                    @unlink($tmp);
                    return ['ok' => false, 'error' => 'write_failed'];
                }
            } finally {
                umask($old);
            }
            return ['ok' => true, 'collection' => $c];
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }

    /* ------------------------------------------------------------------ COLLECTION AND WIDGET MANAGEMENT
       The user organises the library: renames / deletes their collections, moves widgets between collections and deletes widgets — one by
       one or several at once. A widget a saved dashboard still places is NEVER deleted (it is reported, and moved to the IniqDash collection
       when its collection is removed), so no dashboard loses a widget. The IniqDash collection (first-party) and package collections
       (code installed under widgets/custom) cannot be renamed or deleted here. Every write happens under the library's lock. */

    /** run $fn under the library lock; null when the storage is unavailable */
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
        }
    }

    private static function writeCollections(string $dir, array $list): bool
    {
        $json = json_encode(['format' => 1, 'collections' => array_values($list)], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $f = $dir . DIRECTORY_SEPARATOR . 'collections.json';
        $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $old = umask(0077);
        try {
            if (!is_string($json) || @file_put_contents($tmp, $json, LOCK_EX) !== strlen($json) || !@rename($tmp, $f)) {
                @unlink($tmp);
                return false;
            }
            return true;
        } finally {
            umask($old);
        }
    }

    /** every definition id placed by a saved dashboard → [{ id, name }] (one pass over the dashboards; an unreadable dashboard makes every
        widget count as in use: nothing is deleted on a guess) */
    public static function usageAll(): array
    {
        require_once __DIR__ . '/Dashboards.php';
        $out = [];
        $unknown = [];
        foreach (Dashboards::list() as $d) {
            $e = Dashboards::get($d['id'] ?? null);
            $ref = ['id' => (string) ($d['id'] ?? ''), 'name' => (string) ($d['name'] ?? '')];
            $json = $e !== null ? json_encode($e['dashboard'], JSON_UNESCAPED_SLASHES) : null;
            if (!is_string($json)) {
                $unknown[] = $ref;
                continue;
            }
            if (preg_match_all('/"definition":"(w[0-9a-f]{16})"/', $json, $m)) {
                foreach (array_unique($m[1]) as $wid) {
                    $out[$wid][] = $ref;
                }
            }
        }
        if ($unknown) {
            foreach (self::list() as $w) {
                $out[$w['id']] = array_merge($out[$w['id']] ?? [], $unknown);
            }
        }
        return $out;
    }

    /** rename one of the user's collections (the name is unique, case-insensitive; the first-party name is reserved) */
    public static function renameCollection(mixed $id, mixed $name): array
    {
        $n = Dashboards::cleanName($name);
        if ($n === null || preg_match('/[<>]/', $n)) {
            return ['ok' => false, 'error' => 'name_invalid'];
        }
        return self::locked(static function (string $dir) use ($id, $n) {
            $list = self::collections();
            $i = array_search($id, array_column($list, 'id'), true);
            if (!is_string($id) || $i === false) {
                return ['ok' => false, 'error' => 'not_found'];
            }
            $k = mb_strtolower($n, 'UTF-8');
            if ($k === mb_strtolower(self::FIRST_PARTY_COLLECTION['name'], 'UTF-8') || array_filter($list, static fn ($c) => $c['id'] !== $id && mb_strtolower($c['name'], 'UTF-8') === $k)) {
                return ['ok' => false, 'error' => 'name_taken'];
            }
            $list[$i]['name'] = $n;
            return self::writeCollections($dir, $list) ? ['ok' => true, 'collection' => $list[$i]] : ['ok' => false, 'error' => 'write_failed'];
        });
    }

    /** move definitions to another collection ($to: the first-party id, or one of the user's) → { moved: [id], failed: [id] } */
    public static function moveWidgets(mixed $ids, mixed $to): array
    {
        if (!is_array($ids) || count($ids) > self::MAX_WIDGETS || !is_string($to)) {
            return ['ok' => false, 'error' => 'bad_request'];
        }
        return self::locked(static function (string $dir) use ($ids, $to) {
            if ($to !== self::FIRST_PARTY_COLLECTION['id'] && !in_array($to, array_column(self::collections(), 'id'), true)) {
                return ['ok' => false, 'error' => 'not_found'];
            }
            return ['ok' => true] + self::moveIn($dir, $ids, $to);
        });
    }

    /** (under the lock) set meta.collection of these definitions — a new revision of each */
    private static function moveIn(string $dir, array $ids, string $to): array
    {
        $moved = $failed = [];
        foreach (array_unique(array_filter($ids, 'is_string')) as $id) {
            $e = self::get($id);
            if ($e === null) {
                $failed[] = $id;
                continue;
            }
            if (($e['definition']->meta->collection ?? null) === $to) {
                $moved[] = $id;
                continue;
            }
            $def = $e['definition'];
            $def->meta->collection = $to;
            $r = self::store($dir, $e['id'], $def, $e['revision'] + 1, $e['created']);
            if ($r['ok']) {
                $moved[] = $id;
            } else {
                $failed[] = $id;
            }
        }
        return ['moved' => $moved, 'failed' => $failed];
    }

    /** delete several definitions: each one a saved dashboard places is KEPT (reported with its dashboards) → { deleted, kept, failed } */
    public static function deleteWidgets(mixed $ids): array
    {
        if (!is_array($ids) || count($ids) > self::MAX_WIDGETS) {
            return ['ok' => false, 'error' => 'bad_request'];
        }
        $usage = self::usageAll();
        return self::locked(static function (string $dir) use ($ids, $usage) {
            return ['ok' => true] + self::deleteIn($dir, $ids, $usage);
        });
    }

    private static function deleteIn(string $dir, array $ids, array $usage): array
    {
        $deleted = $kept = $failed = [];
        foreach (array_unique(array_filter($ids, 'is_string')) as $id) {
            if (!preg_match(self::ID, $id) || !is_file(self::file($dir, $id))) {
                $failed[] = $id;
            } elseif (!empty($usage[$id])) {
                $kept[] = ['id' => $id, 'dashboards' => $usage[$id]];
            } elseif (@unlink(self::file($dir, $id))) {
                $deleted[] = $id;
            } else {
                $failed[] = $id;
            }
        }
        return ['deleted' => $deleted, 'kept' => $kept, 'failed' => $failed];
    }

    /** DELETE one of the user's collections. mode 'keep': its widgets move to $to (default: the IniqDash collection); mode 'widgets': its
        widgets are deleted too — except those a saved dashboard places, which move to $to and are reported. */
    public static function deleteCollection(mixed $id, mixed $mode, mixed $to = null): array
    {
        $to = is_string($to) && $to !== '' ? $to : self::FIRST_PARTY_COLLECTION['id'];
        if (!in_array($mode, ['keep', 'widgets'], true) || $to === $id) {
            return ['ok' => false, 'error' => 'bad_request'];
        }
        $usage = $mode === 'widgets' ? self::usageAll() : [];
        return self::locked(static function (string $dir) use ($id, $mode, $to, $usage) {
            $list = self::collections();
            if (!is_string($id) || !in_array($id, array_column($list, 'id'), true)) {
                return ['ok' => false, 'error' => 'not_found'];
            }
            if ($to !== self::FIRST_PARTY_COLLECTION['id'] && !in_array($to, array_column($list, 'id'), true)) {
                return ['ok' => false, 'error' => 'not_found'];
            }
            $mine = array_column(array_filter(self::list(), static fn ($w) => ($w['definition']->meta->collection ?? null) === $id), 'id');
            $res = ['deleted' => [], 'kept' => [], 'failed' => [], 'moved' => []];
            if ($mode === 'widgets') {
                $res = array_merge($res, self::deleteIn($dir, $mine, $usage));
                $mine = array_column($res['kept'], 'id');
            }
            $mv = self::moveIn($dir, $mine, $to);
            $res['moved'] = $mv['moved'];
            $res['failed'] = array_merge($res['failed'], $mv['failed']);
            if ($res['failed']) {
                return ['ok' => false, 'error' => 'write_failed'] + $res;      // the collection stays: nothing would be left without one
            }
            $list = array_values(array_filter($list, static fn ($c) => $c['id'] !== $id));
            return self::writeCollections($dir, $list) ? ['ok' => true, 'id' => $id] + $res : ['ok' => false, 'error' => 'write_failed'] + $res;
        });
    }

    /* ------------------------------------------------------------------ RETIRED COLLECTIONS (a one-time clean-up)
       The examples that early versions created: "Maison demo" (the old demo's bundled widgets), "Studio Examples" (sample widgets) and
       "Test Me" (a sample widget PACKAGE once shipped under widgets/custom/testme). Matched by name, ignoring case, spaces, - and _.
       Their widgets are deleted unless a saved dashboard places them — those are moved to the IniqDash collection, never deleted. A
       retired package folder is removed only when no dashboard uses its widgets and it sits directly under widgets/custom. Runs once
       (a marker with the report in the library folder); retireObsolete(true) runs it again on request. */
    public const RETIRED = ['maisondemo', 'testme', 'studioexamples'];
    public static function retiredName(mixed $name): bool
    {
        return is_string($name) && in_array(preg_replace('/[\s_\-]+/u', '', mb_strtolower($name, 'UTF-8')), self::RETIRED, true);
    }

    /** → { ok, ran: bool, report: { collections: [{ name, deleted, kept }], packages: [{ id, removed, reason? }], at } } */
    public static function retireObsolete(bool $force = false, ?string $appRoot = null): array
    {
        $dir = self::dir();
        if ($dir === null) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        $marker = $dir . DIRECTORY_SEPARATOR . 'retired-collections.json';
        if (!$force && is_file($marker)) {
            $prev = json_decode((string) @file_get_contents($marker), true);
            return ['ok' => true, 'ran' => false, 'report' => is_array($prev) ? $prev : null];
        }
        $report = ['at' => gmdate('Y-m-d\TH:i:s\Z'), 'collections' => [], 'packages' => []];
        foreach (self::collections() as $c) {
            if (!self::retiredName($c['name'])) {
                continue;
            }
            $r = self::deleteCollection($c['id'], 'widgets');
            $report['collections'][] = ['name' => $c['name'], 'ok' => $r['ok'], 'deleted' => count($r['deleted'] ?? []),
                'kept' => array_map(static fn ($k) => ['id' => $k['id'], 'dashboards' => array_column($k['dashboards'], 'name')], $r['kept'] ?? [])];
        }
        // a retired widget PACKAGE left behind by an older version (widgets/custom/<folder>/collection.json)
        $custom = $appRoot !== null ? realpath($appRoot . DIRECTORY_SEPARATOR . 'widgets' . DIRECTORY_SEPARATOR . 'custom') : false;
        if (is_string($custom)) {
            require_once __DIR__ . '/Dashboards.php';
            $all = '';
            foreach (Dashboards::list() as $d) {
                $e = Dashboards::get($d['id'] ?? null);
                $all .= $e !== null ? json_encode($e['dashboard'], JSON_UNESCAPED_SLASHES) : '"unreadable"';
            }
            foreach (glob($custom . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . 'collection.json') ?: [] as $cf) {
                $col = json_decode((string) @file_get_contents($cf), true);
                $folder = dirname($cf);
                if (!is_array($col) || !(self::retiredName($col['name'] ?? null) || self::retiredName($col['id'] ?? null)) || dirname($folder) !== $custom || is_link($folder)) {
                    continue;
                }
                $pid = is_string($col['id'] ?? null) ? $col['id'] : basename($folder);
                // its widgets' types (custom.<id> as the registry names a package widget) — any use in a dashboard keeps the package
                $used = str_contains($all, '"unreadable"');
                // a package widget's type is "custom.<its folder>" (WidgetPackages) — or the id its widget.json declares
                foreach (glob($folder . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . 'widget.json') ?: [] as $wf) {
                    $wid = json_decode((string) @file_get_contents($wf), true)['id'] ?? null;
                    foreach (array_filter(['custom.' . basename(dirname($wf)), is_string($wid) ? $wid : null]) as $type) {
                        if (str_contains($all, '"type":"' . $type . '"')) {
                            $used = true;
                        }
                    }
                }
                if ($used) {
                    $report['packages'][] = ['id' => $pid, 'removed' => false, 'reason' => 'used by a dashboard'];
                    continue;
                }
                $ok = self::removeTree($folder, $custom);
                $report['packages'][] = ['id' => $pid, 'removed' => $ok, 'reason' => $ok ? null : 'the web server cannot delete the folder — delete widgets/custom/' . basename($folder) . ' by hand'];
            }
        }
        @file_put_contents($marker, json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        return ['ok' => true, 'ran' => true, 'report' => $report];
    }

    /** remove a folder tree that lies INSIDE $root (never follows links, never leaves $root) */
    private static function removeTree(string $path, string $root): bool
    {
        $real = realpath($path);
        if ($real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || is_link($path)) {
            return false;
        }
        $ok = true;
        foreach (scandir($real) ?: [] as $n) {
            if ($n === '.' || $n === '..') {
                continue;
            }
            $p = $real . DIRECTORY_SEPARATOR . $n;
            if (is_link($p) || is_file($p)) {
                $ok = @unlink($p) && $ok;
            } elseif (is_dir($p)) {
                $ok = self::removeTree($p, $root) && $ok;
            }
        }
        return @rmdir($real) && $ok;
    }

    /** create (id null) or save (id + the revision it was based on); $allowed: the collection ids that exist (null: not checked) */
    public static function save(mixed $id, mixed $revision, mixed $definition, ?array $allowed = null): array
    {
        $dir = self::dir();
        if ($dir === null) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        $why = null;
        if (!self::check($definition, $why)) {
            return ['ok' => false, 'error' => 'invalid', 'detail' => $why];
        }
        $col = is_object($definition->meta ?? null) ? ($definition->meta->collection ?? null) : null;
        if (!is_string($col) || ($allowed !== null && !in_array($col, $allowed, true))) {
            return ['ok' => false, 'error' => 'invalid', 'detail' => 'meta.collection: choose an existing collection (or create one)'];
        }
        $h = @fopen($dir . DIRECTORY_SEPARATOR . '.lock', 'c');
        if ($h === false || !flock($h, LOCK_EX)) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        try {
            if ($id === null) {
                if (count(glob($dir . DIRECTORY_SEPARATOR . 'w*.json') ?: []) >= self::MAX_WIDGETS) {
                    return ['ok' => false, 'error' => 'too_many'];
                }
                do {
                    $id = 'w' . bin2hex(random_bytes(8));
                } while (is_file(self::file($dir, $id)));
                return self::store($dir, $id, $definition, 1, null);
            }
            $e = self::get($id, $why);
            if ($e === null) {
                return ['ok' => false, 'error' => $why];
            }
            if (!is_int($revision) || $revision !== $e['revision']) {
                return ['ok' => false, 'error' => 'conflict', 'revision' => $e['revision']];
            }
            return self::store($dir, $e['id'], $definition, $e['revision'] + 1, $e['created']);
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }

    /** the saved dashboards that place a COPY of this definition: [{ id, name }] (a dashboard that cannot be read is listed as in use) */
    public static function usage(string $id): array
    {
        require_once __DIR__ . '/Dashboards.php';
        $out = [];
        foreach (Dashboards::list() as $d) {
            $e = Dashboards::get($d['id'] ?? null);
            $json = $e !== null ? json_encode($e['dashboard'], JSON_UNESCAPED_SLASHES) : null;
            if (!is_string($json) || str_contains($json, '"definition":"' . $id . '"')) {
                $out[] = ['id' => (string) ($d['id'] ?? ''), 'name' => (string) ($d['name'] ?? '')];
            }
        }
        return $out;
    }

    /** DELETE a definition — SAFE: refused while any saved dashboard still places a copy of it (those dashboards are named), and only at
        the revision the caller saw (a definition changed meanwhile is not deleted blindly) */
    public static function delete(mixed $id, mixed $revision): array
    {
        $dir = self::dir();
        if ($dir === null) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        $why = null;
        $e = self::get($id, $why);
        if ($e === null) {
            return ['ok' => false, 'error' => $why];
        }
        if (!is_int($revision) || $revision !== $e['revision']) {
            return ['ok' => false, 'error' => 'conflict', 'revision' => $e['revision']];
        }
        $used = self::usage($e['id']);
        if ($used) {
            return ['ok' => false, 'error' => 'in_use', 'dashboards' => $used];
        }
        $h = @fopen($dir . DIRECTORY_SEPARATOR . '.lock', 'c');
        if ($h === false || !flock($h, LOCK_EX)) {
            return ['ok' => false, 'error' => 'storage_unavailable'];
        }
        try {
            return @unlink(self::file($dir, $e['id'])) ? ['ok' => true, 'id' => $e['id']] : ['ok' => false, 'error' => 'write_failed'];
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }

    private static function store(string $dir, string $id, object $definition, int $revision, ?string $created): array
    {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $entry = ['format' => 1, 'id' => $id, 'revision' => $revision, 'created' => $created ?: $now, 'updated' => $now, 'definition' => $definition];
        $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if (!is_string($json) || strlen($json) > self::MAX_BYTES + 4096) {
            return ['ok' => false, 'error' => $json === false ? 'invalid' : 'too_large'];
        }
        $tmp = $dir . DIRECTORY_SEPARATOR . '.' . $id . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $old = umask(0077);
        try {
            if (@file_put_contents($tmp, $json, LOCK_EX) !== strlen($json) || @file_get_contents($tmp) !== $json || !@rename($tmp, self::file($dir, $id))) {
                @unlink($tmp);
                return ['ok' => false, 'error' => 'write_failed'];
            }
        } finally {
            umask($old);
        }
        unset($entry['format']);
        return ['ok' => true, 'widget' => $entry];
    }
}
