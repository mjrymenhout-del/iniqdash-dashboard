<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// LICENCE AND NOTICES: the MPL-2.0 text is the unmodified original, every source file carries the MPL-2.0 notice with the founder's
// copyright line, third-party material keeps its own licence next to it, and nothing third-party is relabelled as MPL-2.0.
// php tests/notices.php  (exit 1 on a failure)
declare(strict_types=1);
$root = dirname(__DIR__);
$ok = 0; $fail = 0;
function check(string $label, bool $cond, string $extra = ''): void
{
    global $ok, $fail;
    $cond ? $ok++ : $fail++;
    echo ($cond ? 'ok   ' : 'FAIL ') . $label . ($cond ? '' : ' ' . $extra) . "\n";
}
const COPY = 'Copyright © 2026 Marcel Rymenhout and IniqDash contributors';
const MPL_SHA256 = 'fab3dd6bdab226f1c08630b1dd917e11fcb4ec5e1e020e2c16f83a0a13863e85';   // mozilla.org/media/MPL/2.0/index.txt

check('LICENSE is the unmodified MPL-2.0 text', is_file("$root/LICENSE") && hash_file('sha256', "$root/LICENSE") === MPL_SHA256);
$apache = @file_get_contents("$root/licenses/Apache-2.0.txt") ?: '';
check('the Apache-2.0 text (Material Design Icons) is included', str_contains($apache, 'Apache License') && str_contains($apache, 'Version 2.0, January 2004') && str_contains($apache, 'END OF TERMS AND CONDITIONS'));
$ofl = @file_get_contents("$root/assets/fonts/Manrope-OFL.txt") ?: '';
check('the Manrope font ships with its SIL OFL 1.1 text and copyright', str_contains($ofl, 'SIL OPEN FONT LICENSE Version 1.1') && str_contains($ofl, 'The Manrope Project Authors'));
check('the MDI licence notice is kept', str_contains(@file_get_contents("$root/assets/mdi/LICENSE") ?: '', 'Pictogrammers'));
$tp = @file_get_contents("$root/THIRD-PARTY-NOTICES.md") ?: '';
check('THIRD-PARTY-NOTICES names every bundled third-party file', str_contains($tp, 'assets/mdi/mdi-icons.json') && str_contains($tp, 'manrope-latin-wght-normal.woff2') && str_contains($tp, 'manrope-latin-ext-wght-normal.woff2'));
check('…and says they are NOT under MPL-2.0', str_contains($tp, 'is **not** licensed under MPL-2.0'));
$readme = @file_get_contents("$root/README.md") ?: '';
check('README: founder attribution, the copyright line and MPL-2.0', str_contains($readme, '## Original Creator & Founder') && str_contains($readme, 'Marcel Rymenhout') && str_contains($readme, COPY) && str_contains($readme, 'Mozilla Public License 2.0'));
check('README keeps the principle', str_contains($readme, 'Home Assistant is the backend. IniqDash is the frontend.'));
check('BRANDING.md exists and claims no registered trademark', is_file("$root/BRANDING.md") && str_contains((string) file_get_contents("$root/BRANDING.md"), 'not a registered trademark'));

// every tracked source file (not docs, not third-party data, not JSON) carries the notice in its first lines
$files = array_filter(explode("\n", (string) shell_exec('git -C ' . escapeshellarg($root) . ' ls-files')));
$missing = [];
$n = 0;
foreach ($files as $f) {
    if (!preg_match('/\.(js|mjs|css|php|sh|html)$/', $f) || str_starts_with($f, 'docs/') || !is_file("$root/$f")) {
        continue;
    }
    $n++;
    $head = (string) file_get_contents("$root/$f", false, null, 0, 600);
    if (!str_contains($head, 'Mozilla Public') || !str_contains($head, 'http://mozilla.org/MPL/2.0/') || !str_contains($head, COPY)) {
        $missing[] = $f;
    }
}
check("every source file ($n) carries the MPL-2.0 notice and the copyright line", $missing === [], implode(', ', array_slice($missing, 0, 8)));
// third-party files are not relabelled
foreach (['assets/mdi/mdi-icons.json', 'assets/mdi/LICENSE', 'assets/fonts/Manrope-OFL.txt'] as $f) {
    check("third-party file not relabelled as MPL-2.0: $f", !str_contains((string) file_get_contents("$root/$f"), 'Mozilla Public'));
}
// the generated widget index carries the notice through its generator (not by hand)
check('the widget index generator writes the notice', str_contains((string) file_get_contents("$root/server/build-widget-index.php"), 'Mozilla Public'));
echo "\nok=$ok FAIL=$fail\n";
exit($fail ? 1 : 0);
