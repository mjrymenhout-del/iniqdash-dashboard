<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// php tests/packages.php — widget package discovery and validation (server/WidgetPackages.php): the shipped custom examples load; every kind of
// invalid package is rejected with a reason while the valid ones around it still load; duplicate ids / apis, path tricks, symlinks, oversize
// manifests, bad capability declarations; and the server-side re-check of the custom action channel (declares()).
declare(strict_types=1);
require dirname(__DIR__) . '/server/WidgetPackages.php';

$ok = $fail = 0;
function check(string $label, bool $cond, string $extra = ''): void
{
    global $ok, $fail;
    echo ($cond ? 'ok   ' : 'FAIL ') . $label . ($cond ? '' : ' ' . $extra) . "\n";
    $cond ? $ok++ : $fail++;
}
function rrmdir(string $d): void
{
    foreach (@scandir($d) ?: [] as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        $p = "$d/$f";
        is_link($p) || is_file($p) ? @unlink($p) : rrmdir($p);
    }
    @rmdir($d);
}
function manifest(string $folder, array $over = []): array
{
    return array_merge(['schema' => 1, 'id' => "custom.$folder", 'name' => ucfirst($folder), 'source' => 'custom', 'version' => '1.0.0', 'entry' => "$folder.js", 'style' => "$folder.css",
        'assets' => 'assets/', 'api' => 'Iniq' . preg_replace('/[^A-Za-z0-9]/', '', ucwords($folder, '-'))], $over);
}
/** write a package folder; $m = null → no widget.json; extra files are skipped when listed in $skip */
function pkg(string $base, string $folder, ?array $m, array $skip = []): void
{
    @mkdir("$base/$folder/assets", 0777, true);
    if ($m !== null) {
        file_put_contents("$base/$folder/widget.json", json_encode($m));
    }
    foreach (['entry', 'style'] as $k) {
        $f = is_array($m) && is_string($m[$k] ?? null) ? basename($m[$k]) : null;
        if ($f !== null && !in_array($k, $skip, true) && preg_match('/^[a-z0-9][a-z0-9._-]*$/', $f)) {
            file_put_contents("$base/$folder/$f", '/* package file */');
        }
    }
}
$root = sys_get_temp_dir() . '/iniq-pkg-' . bin2hex(random_bytes(4));
mkdir("$root/widgets/default/light", 0777, true);
file_put_contents("$root/widgets/default/light/widget.json", json_encode(['schema' => 1, 'id' => 'light', 'name' => 'Light', 'source' => 'default', 'version' => '1.0.0', 'entry' => 'light.js', 'style' => 'light.css', 'assets' => 'assets/', 'api' => 'MaisonLight']));
file_put_contents("$root/widgets/default/light/light.js", '');
file_put_contents("$root/widgets/default/light/light.css", '');
mkdir("$root/widgets/default/light/assets");
$c = "$root/widgets/custom";
mkdir($c, 0777, true);

// ---- the shipped examples are valid fixtures
$real = WidgetPackages::scan(dirname(__DIR__), 'custom', WidgetPackages::defaultApis(dirname(__DIR__)));
check('the shipped custom packages all load (only the first-party Room / Scene ships; no collection, no errors)', array_column($real['packages'], 'id') === ['custom.room-scene'] && $real['collections'] === [] && $real['errors'] === [], json_encode([array_column($real['packages'], 'id'), $real['errors']]));
// the development examples ("Test Me" collection) are a TEST FIXTURE, not shipped: copied into a scratch root they still load as one collection
$fx = sys_get_temp_dir() . '/iniq-fx-' . bin2hex(random_bytes(4));
@mkdir("$fx/widgets/default", 0777, true);
@mkdir("$fx/widgets/custom", 0777, true);
exec('cp -R ' . escapeshellarg(__DIR__ . '/fixtures/custom/testme') . ' ' . escapeshellarg("$fx/widgets/custom/testme"));
exec('cp -R ' . escapeshellarg(dirname(__DIR__) . '/widgets/default') . '/. ' . escapeshellarg("$fx/widgets/default"));   // a fixture may be basedOn a default widget
$fxs = WidgetPackages::scan($fx, 'custom', WidgetPackages::defaultApis(dirname(__DIR__)));
check('the Test Me example collection (tests/fixtures/custom/testme) loads: 4 packages, 1 collection, no errors', count($fxs['packages']) === 4 && count($fxs['collections']) === 1 && $fxs['errors'] === [], json_encode($fxs['errors']));
check('…and is not first-party', array_filter($fxs['packages'], static fn ($p) => $p['firstParty']) === []);
rrmdir($fx);
check('the shipped default widgets all load', count(WidgetPackages::scan(dirname(__DIR__), 'default')['packages']) >= 28 && WidgetPackages::scan(dirname(__DIR__), 'default')['errors'] === []);

// ---- one valid package, then each kind of invalid one
pkg($c, 'good', manifest('good', ['ha' => ['domains' => ['light'], 'actions' => ['turn_on', 'turn_off']]]));
pkg($c, 'roles-good', manifest('roles-good', ['ha' => ['binding' => 'roles',
    'roles' => ['temp' => ['label' => 'Temperature', 'domains' => ['sensor'], 'deviceClasses' => ['temperature'], 'required' => true], 'lamps' => ['label' => 'Lamp', 'domains' => ['light'], 'multiple' => true, 'max' => 4]],
    'actionSlots' => ['go' => ['label' => 'Go', 'domains' => ['scene', 'script', 'button'], 'actions' => ['trigger'], 'max' => 3, 'section' => 'Go {n}']]]]));
$bad = [
    'unknown key'              => ['b-unknown', manifest('b-unknown', ['hooks' => 'x'])],
    'schema 2'                 => ['b-schema', manifest('b-schema', ['schema' => 2])],
    'wrong id'                 => ['b-id', manifest('b-id', ['id' => 'custom.other'])],
    'a default id'             => ['b-defid', manifest('b-defid', ['id' => 'light'])],
    'markup in the name'       => ['b-name', manifest('b-name', ['name' => '<img src=x onerror=1>'])],
    'bad version'              => ['b-version', manifest('b-version', ['version' => '1.0'])],
    'entry path traversal'     => ['b-trav', manifest('b-trav', ['entry' => '../good/good.js'])],
    'entry in a sub folder'    => ['b-sub', manifest('b-sub', ['entry' => 'js/b-sub.js'])],
    'entry is not .js'         => ['b-ext', manifest('b-ext', ['entry' => 'b-ext.php'])],
    'entry URL'                => ['b-url', manifest('b-url', ['entry' => 'https://evil.example/x.js'])],
    'assets elsewhere'         => ['b-assets', manifest('b-assets', ['assets' => '../'])],
    'api not an identifier'    => ['b-api', manifest('b-api', ['api' => 'bad api; alert(1)'])],
    'api of a default widget'  => ['b-shadow', manifest('b-shadow', ['api' => 'MaisonLight'])],
    'api used twice'           => ['zz-dup', manifest('zz-dup', ['api' => 'IniqGood'])],
    'action not allowed'       => ['b-act1', manifest('b-act1', ['ha' => ['domains' => ['lock'], 'actions' => ['unlock']]])],
    'action for wrong domain'  => ['b-act2', manifest('b-act2', ['ha' => ['domains' => ['light'], 'actions' => ['toggle']]])],
    'actions without domains'  => ['b-act3', manifest('b-act3', ['ha' => ['actions' => ['turn_on']]])],
    'actions on a data binding' => ['b-act4', manifest('b-act4', ['ha' => ['binding' => 'gauge', 'domains' => ['light'], 'actions' => ['turn_on']]])],
    'unknown HA binding'       => ['b-bind', manifest('b-bind', ['ha' => ['binding' => 'service']])],
    'raw service in ha'        => ['b-svc', manifest('b-svc', ['ha' => ['domains' => ['light'], 'service' => 'shell_command.x']])],
    'bad category'             => ['b-cat', manifest('b-cat', ['category' => 'Not A Category'])],
    'basedOn a missing widget' => ['b-based', manifest('b-based', ['basedOn' => 'nonexistent'])],
    'wrong source'             => ['b-src', manifest('b-src', ['source' => 'default'])],
    'roles: unknown key in a role' => ['r-nokey', manifest('r-nokey', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor'], 'service' => 'x']]]])],
    'roles: role without domains' => ['r-nodom', manifest('r-nodom', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A']]]])],
    'roles: role without label' => ['r-nolab', manifest('r-nolab', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['domains' => ['sensor']]]]])],
    'roles: max without multiple' => ['r-maxsingle', manifest('r-maxsingle', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor'], 'max' => 3]]]])],
    'roles: max too large' => ['r-maxbig', manifest('r-maxbig', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor'], 'multiple' => true, 'max' => 99]]]])],
    'roles: required is not a boolean' => ['r-boolean', manifest('r-boolean', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor'], 'required' => 'yes']]]])],
    'roles: bad role name' => ['r-name', manifest('r-name', ['ha' => ['binding' => 'roles', 'roles' => ['Bad Name' => ['label' => 'A', 'domains' => ['sensor']]]]])],
    'roles: no roles' => ['r-empty', manifest('r-empty', ['ha' => ['binding' => 'roles', 'roles' => []]])],
    'roles binding without roles' => ['r-missing', manifest('r-missing', ['ha' => ['binding' => 'roles']])],
    'roles combined with the single-entity keys' => ['r-legacy', manifest('r-legacy', ['ha' => ['binding' => 'roles', 'domains' => ['sensor'], 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]]]])],
    'roles as a list' => ['r-list', manifest('r-list', ['ha' => ['binding' => 'roles', 'roles' => [['label' => 'A', 'domains' => ['sensor']]]]])],
    'slot: action not allowed for the domain' => ['r-slotact', manifest('r-slotact', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]], 'actionSlots' => ['s' => ['label' => 'S', 'domains' => ['light'], 'actions' => ['trigger']]]]])],
    'slot: a raw service name' => ['r-slotsvc', manifest('r-slotsvc', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]], 'actionSlots' => ['s' => ['label' => 'S', 'domains' => ['script'], 'actions' => ['shell_command.run']]]]])],
    'slot: unknown domain has no actions' => ['r-slotdom', manifest('r-slotdom', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]], 'actionSlots' => ['s' => ['label' => 'S', 'domains' => ['lock'], 'actions' => ['unlock']]]]])],
    'slot named like a role' => ['r-slotdup', manifest('r-slotdup', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]], 'actionSlots' => ['a' => ['label' => 'S', 'domains' => ['scene'], 'actions' => ['trigger']]]]])],
    'slot: max out of range' => ['r-slotmax', manifest('r-slotmax', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]], 'actionSlots' => ['s' => ['label' => 'S', 'domains' => ['scene'], 'actions' => ['trigger'], 'max' => 20]]]])],
    'slot: unknown key' => ['r-slotkey', manifest('r-slotkey', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => 'A', 'domains' => ['sensor']]], 'actionSlots' => ['s' => ['label' => 'S', 'domains' => ['scene'], 'actions' => ['trigger'], 'target' => 'all']]]])],
    'role label with markup' => ['r-markup', manifest('r-markup', ['ha' => ['binding' => 'roles', 'roles' => ['a' => ['label' => '<b>A</b>', 'domains' => ['sensor']]]]])],
];
foreach ($bad as $label => [$folder, $m]) {
    pkg($c, $folder, $m);
}
// structure problems
pkg($c, 'missing-entry', manifest('missing-entry'), ['entry']);
pkg($c, 'missing-style', manifest('missing-style'), ['style']);
pkg($c, 'big-json', null);
file_put_contents("$c/big-json/widget.json", json_encode(manifest('big-json', ['name' => str_repeat('x', 20000)])));
pkg($c, 'not-json', null);
file_put_contents("$c/not-json/widget.json", '{ this is not json');
pkg($c, 'a-list', null);
file_put_contents("$c/a-list/widget.json", '[1,2,3]');
mkdir("$c/empty-folder");
mkdir("$c/UPPER");
file_put_contents("$c/UPPER/widget.json", json_encode(manifest('upper')));
mkdir("$c/both");
file_put_contents("$c/both/widget.json", json_encode(manifest('both')));
file_put_contents("$c/both/collection.json", json_encode(['schema' => 1, 'id' => 'both', 'name' => 'Both']));
// symlink pointing outside widgets/custom (skipped where the platform cannot create it)
$outside = sys_get_temp_dir() . '/iniq-outside-' . bin2hex(random_bytes(4));
pkg($outside, 'linked', manifest('linked'));
$linked = @symlink("$outside/linked", "$c/linked");
// collections
mkdir("$c/col-ok");
file_put_contents("$c/col-ok/collection.json", json_encode(['schema' => 1, 'id' => 'col-ok', 'name' => 'Fine']));
pkg("$c/col-ok", 'inner', manifest('inner'));
mkdir("$c/col-reserved");
file_put_contents("$c/col-reserved/collection.json", json_encode(['schema' => 1, 'id' => 'general', 'name' => 'Reserved']));
pkg("$c/col-reserved", 'skipped', manifest('skipped'));
mkdir("$c/col-nest/inner-col", 0777, true);
file_put_contents("$c/col-nest/collection.json", json_encode(['schema' => 1, 'id' => 'col-nest', 'name' => 'Nest']));
file_put_contents("$c/col-nest/inner-col/collection.json", json_encode(['schema' => 1, 'id' => 'inner-col', 'name' => 'Inner']));
mkdir("$c/zcol-dup");
file_put_contents("$c/zcol-dup/collection.json", json_encode(['schema' => 1, 'id' => 'col-ok', 'name' => 'Same id']));

$r = WidgetPackages::scan($root, 'custom', WidgetPackages::defaultApis($root));
$loaded = array_column($r['packages'], 'id');
$errors = [];
foreach ($r['errors'] as $e) {
    $errors[rtrim(basename(rtrim($e['folder'], '/')), '/')] = $e['error'];
}
check('the valid package loads', in_array('custom.good', $loaded, true));
check('a valid package inside a collection loads (with its collection)', in_array('custom.inner', $loaded, true));
foreach (['r-nokey', 'r-nodom', 'r-nolab', 'r-maxsingle', 'r-maxbig', 'r-boolean', 'r-name', 'r-empty', 'r-missing', 'r-legacy', 'r-list', 'r-slotact', 'r-slotsvc', 'r-slotdom', 'r-slotdup', 'r-slotmax', 'r-slotkey', 'r-markup', 'b-unknown', 'b-schema', 'b-id', 'b-name', 'b-version', 'b-trav', 'b-sub', 'b-ext', 'b-url', 'b-assets', 'b-api', 'b-shadow', 'zz-dup', 'b-act1', 'b-act2', 'b-act3', 'b-act4', 'b-bind', 'b-svc', 'b-cat', 'b-based', 'b-src',
    'missing-entry', 'missing-style', 'big-json', 'not-json', 'a-list', 'empty-folder', 'both', 'inner-col'] as $f) {
    check("rejected with a reason: $f", isset($errors[$f]) && $errors[$f] !== '' && !in_array("custom.$f", $loaded, true), $errors[$f] ?? 'accepted');
}
check('a folder name with capitals is rejected without echoing it', in_array('(invalid folder name)', array_keys($errors), true) || isset($errors['(invalid folder name)']) || count(array_filter($r['errors'], static fn ($e) => str_contains($e['folder'], 'invalid folder name'))) >= 1);
if ($linked) {
    check('a symlink pointing outside widgets/custom is rejected', !in_array('custom.linked', $loaded, true));
}
check('a duplicate collection id is rejected', isset($errors['zcol-dup']), json_encode(array_keys($errors)));
check('a reserved collection id is rejected (its widgets are skipped, nothing else is)', isset($errors['col-reserved']) && !in_array('custom.skipped', $loaded, true) && in_array('custom.good', $loaded, true));
check('no error text carries a server filesystem path', !preg_match('#/tmp/|/home/|/var/|' . preg_quote($root, '#') . '#', json_encode($r['errors'])), json_encode($r['errors']));
check('no loaded package exposes a filesystem path', !preg_match('#/tmp/|/home/#', json_encode($r['packages'])));
check('every loaded path is relative inside widgets/custom/', count(array_filter($r['packages'], static fn ($p) => !str_starts_with($p['path'], 'widgets/custom/'))) === 0);

// ---- the custom action channel is re-checked on the server
check('declares(): a declared action on a declared domain', WidgetPackages::declares($root, 'custom.good', 'light.kitchen', 'turn_on'));
check('declares(): an action the package did not declare', !WidgetPackages::declares($root, 'custom.good', 'light.kitchen', 'toggle'));
check('declares(): a domain the package did not declare', !WidgetPackages::declares($root, 'custom.good', 'switch.pump', 'turn_on'));
check('declares(): a package that does not exist', !WidgetPackages::declares($root, 'custom.nope', 'light.kitchen', 'turn_on'));
check('declares(): a factory widget id can never use the channel', !WidgetPackages::declares($root, 'light', 'light.kitchen', 'turn_on'));
check('declares(): malformed ids', !WidgetPackages::declares($root, 'custom.good', 'light.kitchen/../x', 'turn_on') && !WidgetPackages::declares($root, 'custom.../x', 'light.kitchen', 'turn_on'));
check('declares(): a rejected package cannot be used even if it asked for an action', !WidgetPackages::declares($root, 'custom.b-act2', 'light.kitchen', 'toggle'));
check('roles binding: a valid package loads and keeps its declaration', in_array('custom.roles-good', $loaded, true)
    && array_values(array_filter($r['packages'], static fn ($p) => $p['id'] === 'custom.roles-good'))[0]['ha']['roles']['lamps']['max'] === 4);
check('declares() (roles): a declared slot action on a declared domain', WidgetPackages::declares($root, 'custom.roles-good', 'scene.relax', 'trigger') && WidgetPackages::declares($root, 'custom.roles-good', 'script.movie', 'trigger') && WidgetPackages::declares($root, 'custom.roles-good', 'button.go', 'trigger'));
check('declares() (roles): not a domain no slot declares (input_button), not another action, not a role (read-only)', !WidgetPackages::declares($root, 'custom.roles-good', 'input_button.x', 'trigger') && !WidgetPackages::declares($root, 'custom.roles-good', 'scene.relax', 'turn_on') && !WidgetPackages::declares($root, 'custom.roles-good', 'light.lamp', 'turn_on') && !WidgetPackages::declares($root, 'custom.roles-good', 'light.lamp', 'trigger'));
check('declares(): the legacy single-entity channel still works unchanged', WidgetPackages::declares($root, 'custom.good', 'light.kitchen', 'turn_off'));

// FIRST-PARTY status (shown as built-in): only the release-owned widgets/custom/first-party.json grants it — never core code, never a package
$shipped = WidgetPackages::scan(dirname(__DIR__), 'custom', WidgetPackages::defaultApis(dirname(__DIR__)));
$fp = array_column(array_filter($shipped['packages'], static fn ($p) => $p['firstParty']), 'id');
check('first party: the shipped Room / Scene is first-party (from widgets/custom/first-party.json), no other shipped package is', $fp === ['custom.room-scene'], json_encode($fp));
$core = (string) file_get_contents(dirname(__DIR__) . '/server/WidgetPackages.php');
check('first party: core code names no custom widget (the list is not in server/WidgetPackages.php)', !preg_match('/custom\.room|room-scene/', $core));
$self = sys_get_temp_dir() . '/iniq-fp-' . bin2hex(random_bytes(4));
@mkdir("$self/widgets/custom", 0777, true); @mkdir("$self/widgets/default", 0777, true);
pkg("$self/widgets/custom", 'claims', manifest('claims', ['firstParty' => true]));
pkg("$self/widgets/custom", 'plain', manifest('plain'));
$sr = WidgetPackages::scan($self, 'custom', []);
$claims = array_values(array_filter($sr['packages'], static fn ($p) => $p['id'] === 'custom.claims'));
check('first party: a package that declares "firstParty" in its own manifest does not get it (rejected or ignored)', !$claims || $claims[0]['firstParty'] === false, json_encode($claims));
file_put_contents("$self/widgets/custom/first-party.json", json_encode(['packages' => ['custom.plain', '../evil', 42]]));
check('first party: the release file is validated (only well-formed custom ids count)', WidgetPackages::firstParty($self) === ['custom.plain']);
rrmdir($self);

rrmdir($root);
rrmdir($outside);
echo "\nok=$ok FAIL=$fail\n";
exit($fail ? 1 : 0);
