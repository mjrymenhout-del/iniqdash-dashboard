<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// TRUSTED PROXIES (server/bootstrap.php): X-Forwarded-Proto / X-Forwarded-For are believed ONLY from addresses in 'trusted_proxies'
// (server/local.php) or INIQDASH_TRUSTED_PROXIES; by default from nobody. Each case runs in its own PHP process (the list is read once).
// php tests/proxy.php  (exit 1 on a failure)
declare(strict_types=1);
if (($argv[1] ?? '') === 'probe') {
    $_SERVER = json_decode($argv[2], true) + ['SCRIPT_NAME' => '/gate.php'];
    require dirname(__DIR__) . '/server/bootstrap.php';
    echo json_encode(['https' => iq_https(), 'ip' => iq_client_ip(), 'trusted' => iq_from_trusted_proxy(), 'list' => iq_trusted_proxies()]);
    exit;
}
$ok = 0; $fail = 0;
function check(string $label, bool $cond, string $extra = ''): void
{
    global $ok, $fail;
    $cond ? $ok++ : $fail++;
    echo ($cond ? 'ok   ' : 'FAIL ') . $label . ($cond ? '' : ' ' . $extra) . "\n";
}
function probe(string $trusted, array $server): array
{
    $cmd = 'INIQDASH_TRUSTED_PROXIES=' . escapeshellarg($trusted) . ' INIQDASH_PRIVATE= php ' . escapeshellarg(__FILE__) . ' probe ' . escapeshellarg(json_encode($server)) . ' 2>&1';
    $out = (string) shell_exec($cmd);
    return json_decode($out, true) ?? ['raw' => $out];
}
$spoof = ['REMOTE_ADDR' => '198.51.100.7', 'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_X_FORWARDED_FOR' => '10.9.9.9'];

$r = probe('', $spoof);
check('default (no trusted proxy): a client\'s own X-Forwarded-Proto: https is ignored', $r['https'] === false && $r['list'] === [], json_encode($r));
check('…and its X-Forwarded-For is ignored for rate limiting (its real address is used)', $r['ip'] === '198.51.100.7', json_encode($r));
$r = probe('127.0.0.1', $spoof);
check('a trusted proxy list that does not contain the client changes nothing', $r['https'] === false && $r['ip'] === '198.51.100.7', json_encode($r));
$r = probe('10.0.0.0/8, 127.0.0.1', ['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_X_FORWARDED_FOR' => '203.0.113.9']);
check('from a trusted proxy (CIDR): HTTPS is believed and the client is the forwarded address', $r['https'] === true && $r['ip'] === '203.0.113.9' && $r['trusted'] === true, json_encode($r));
$r = probe('10.0.0.0/8', ['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_PROTO' => 'http']);
check('a trusted proxy reporting http stays http', $r['https'] === false, json_encode($r));
$r = probe('10.0.0.0/8', ['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_PROTO' => 'https, http']);
check('a list: the value set by the nearest proxy (the last) counts — a client-supplied "https" in front does not', $r['https'] === false, json_encode($r));
$r = probe('10.0.0.0/8', ['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_FOR' => '1.2.3.4, 203.0.113.9, 10.0.0.5']);
check('X-Forwarded-For: the right-most address that is not a trusted proxy (a forged left-most entry is ignored)', $r['ip'] === '203.0.113.9', json_encode($r));
$r = probe('10.0.0.0/8', ['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_FOR' => 'not-an-ip']);
check('a malformed X-Forwarded-For falls back to the proxy address', $r['ip'] === '10.1.2.3', json_encode($r));
$r = probe('2001:db8::/32', ['REMOTE_ADDR' => '2001:db8::1', 'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_X_FORWARDED_FOR' => '2001:db9::7']);
check('IPv6 ranges work', $r['https'] === true && $r['ip'] === '2001:db9::7', json_encode($r));
$r = probe('2001:db8::/32', ['REMOTE_ADDR' => '::ffff:10.1.2.3', 'HTTP_X_FORWARDED_PROTO' => 'https']);
check('no cross-family match', $r['https'] === false, json_encode($r));
$r = probe('nonsense, 300.1.1.1, 10.0.0.0/99, 192.0.2.1', ['REMOTE_ADDR' => '192.0.2.1', 'HTTP_X_FORWARDED_PROTO' => 'https']);
check('invalid list entries are dropped, valid ones kept', $r['list'] === ['192.0.2.1'] && $r['https'] === true, json_encode($r));
$r = probe('', ['REMOTE_ADDR' => '198.51.100.7', 'HTTPS' => 'on']);
check('real TLS on this server (HTTPS=on) needs no proxy', $r['https'] === true, json_encode($r));
echo "\nok=$ok FAIL=$fail\n";
exit($fail ? 1 : 0);
