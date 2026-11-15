#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Copyright © 2026 Marcel Rymenhout and IniqDash contributors
# Checks a DEPLOYED IniqDash from outside (curl), as done for the clean-install test in docs/STANDALONE-INSTALL.md.
# usage: IQ_USER=admin IQ_PASS='…' [HTTPBASE=http://host:80] tests/install-check.sh https://host[:port] [private-folder]
# It signs in, creates one dashboard named "Install check NNNNN", uploads one 40×30 PNG and signs out. With the private folder
# (local runs only) it also confirms the dashboard file exists there. -k: self-signed certificates are accepted.
B=$1; P=${2:-}; U=${IQ_USER:-admin}; PW=${IQ_PASS:?set IQ_PASS}; J=$(mktemp); T0=$(mktemp -d); pass=0; fail=0
ok(){ if [ "$1" = "$2" ]; then echo "PASS  $3 ($1)"; pass=$((pass+1)); else echo "FAIL  $3 (got $1, want $2)"; fail=$((fail+1)); fi; }
code(){ curl -sk -o /dev/null -w "%{http_code}" "$@"; }
echo "== signed out"
ok "$(code $B/)" 302 "GET / redirects to sign-in"
curl -sk -D- -o /dev/null $B/ | grep -i '^location' | tr -d '\r'
for u in /editor.html /api/dashboards.php /api/ha_status.php /server/Auth.php /server/local.php /server/setup.php /.git/config /.htaccess /tests/README.md /dev/index.html /assets/css/tokens.css /widgets/custom/first-party.json /iniqdash-secrets.php /../private/iniqdash-secrets.php; do
  c=$(code "$B$u"); case $c in 30*|40*) echo "PASS  refused $u ($c)"; pass=$((pass+1));; *) echo "FAIL  served $u ($c)"; fail=$((fail+1));; esac
done
ok "$(code $B/login.php)" 200 "login page public"
[ -n "$HTTPBASE" ] && ok "$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" $HTTPBASE/login.php | cut -c1-12)" "301 https://" "plain HTTP sent to HTTPS" && curl -s $HTTPBASE/login.php | head -c 200 && echo
echo "== sign in"
html=$(curl -sk -c $J -b $J $B/login.php); csrf=$(echo "$html" | grep -o 'name="csrf" value="[^"]*"' | sed 's/.*value="//;s/"//')
ok "$(code -c $J -b $J -X POST -H "Origin: $B" --data-urlencode csrf=$csrf --data-urlencode user=$U --data-urlencode password=wrong-password-x $B/login.php)" 401 "wrong password refused (form again)"
x=$(curl -sk -c $J -b $J -X POST -H "Origin: https://evil.example" --data-urlencode csrf=$csrf --data-urlencode user=$U --data-urlencode password="$PW" $B/login.php); echo "$x" | grep -q "form expired" && ok 1 1 "correct password from another origin refused" || ok 0 1 "cross-origin login"
ok "$(code -b $J $B/)" 302 "…and no session was created"
html=$(curl -sk -c $J -b $J $B/login.php); csrf=$(echo "$html" | grep -o 'name="csrf" value="[^"]*"' | sed 's/.*value="//;s/"//')
ok "$(code -c $J -b $J -X POST -H "Origin: $B" --data-urlencode csrf=$csrf --data-urlencode user=$U --data-urlencode password="$PW" $B/login.php)" 303 "correct password signs in"
grep -i "iq\|PHPSESS" $J | awk '{print "      cookie:",$6,"secure="$4,"httponly="($1 ~ /HttpOnly/)}'
ok "$(code -b $J $B/)" 200 "GET / serves the app"
page=$(curl -sk -b $J $B/); T=$(echo "$page" | grep -o 'iniqdash-csrf" content="[^"]*"' | sed 's/.*content="//;s/"//'); echo "      csrf meta length ${#T}"
ok "$(code -b $J $B/assets/css/tokens.css)" 200 "assets served when signed in"
c=$(code -b $J $B/server/Auth.php); case $c in 403|404) ok 1 1 "server/ still refused when signed in ($c)";; *) ok "$c" 403 "server/ still refused when signed in";; esac 
ok "$(code -b $J $B/dev/index.html)" 404 "dev showroom 404 when signed in"
D='{"action":"create","name":"Install check '$RANDOM'","dashboard":{"version":3,"app":{"id":"a","startPage":"p","navigation":{}},"pages":[{"id":"p","name":"P","nav":true,"items":[]}]}}'
ok "$(code -b $J -X POST -H 'Content-Type: application/json' -H "Origin: $B" -d "$D" $B/api/dashboards.php)" 403 "create without CSRF refused"
r=$(curl -sk -b $J -X POST -H 'Content-Type: application/json' -H "Origin: $B" -H "X-CSRF-Token: $T" -d "$D" $B/api/dashboards.php); echo "      $r" | head -c 160; echo
id=$(echo "$r" | grep -o '"id":"d[0-9a-f]*"' | head -1 | cut -d'"' -f4)
[ -n "$id" ] && { echo "PASS  dashboard created ($id)"; pass=$((pass+1)); } || { echo "FAIL  dashboard not created"; fail=$((fail+1)); }
[ -n "$P" ] && { ls "$P/dashboards/" | grep -q "$id" && { echo "PASS  dashboard file in the private folder"; pass=$((pass+1)); } || { echo "FAIL  dashboard file missing in $P"; fail=$((fail+1)); }; }
ok "$(code -b $J "$B/api/dashboards.php?id=$id")" 200 "dashboard read back"
php -r '$i=imagecreatetruecolor(40,30);imagepng($i,$argv[1]);' "$T0/up.png"
r=$(curl -sk -b $J -X POST -H "Origin: $B" -H "X-CSRF-Token: $T" -F file=@$T0/up.png $B/api/asset_upload.php); echo "      $r" | head -c 160; echo
echo "$r" | grep -q '"ok":true' && { echo "PASS  image upload"; pass=$((pass+1)); } || { echo "FAIL  upload"; fail=$((fail+1)); }
ref=$(echo "$r" | grep -o '"ref":"[^"]*"' | cut -d'"' -f4 | sed 's#\\/#/#g'); echo "      ref $ref"
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > $T0/up.svg
ok "$(code -b $J -X POST -H "Origin: $B" -H "X-CSRF-Token: $T" -F file=@$T0/up.svg $B/api/asset_upload.php)" 415 "SVG with script refused"
r=$(curl -sk -b $J $B/api/ha_status.php); echo "      ha_status: $r"
[ -n "$P" ] && { echo "== permissions"; find "$P" -maxdepth 2 -printf '      %m %u %p\n' | grep -v sess_ | head -20; }
echo "== sign out"
ok "$(code -b $J -c $J -X POST -H "Origin: $B" --data-urlencode csrf=$T $B/logout.php | head -c3)" 303 "logout"
ok "$(code -b $J $B/)" 302 "after logout / redirects"
rm -rf "$J" "$T0"; echo "TOTAL pass=$pass fail=$fail"; [ $fail -eq 0 ]
