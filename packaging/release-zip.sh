#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Copyright © 2026 Marcel Rymenhout and IniqDash contributors
#
# The INSTALL ZIP of a release, made from a one-commit copy of the project (the published repository).
# It holds what a web server needs: the application, the demo and the user documentation. Left out: tests, tools, packaging, GitHub
# templates, the developer showroom and documentation screenshots.
#
# usage: packaging/release-zip.sh <snapshot repository> <output .zip>
set -euo pipefail
SNAP=${1:?snapshot repository}; OUT=${2:?output zip}
[ "$(git -C "$SNAP" rev-list --count HEAD)" = 1 ] || { echo "refusing: $SNAP is not a one-commit public snapshot"; exit 1; }
[ -z "$(git -C "$SNAP" remote)" ] || { echo "refusing: $SNAP has a remote"; exit 1; }
VER=$(git -C "$SNAP" show HEAD:VERSION 2>/dev/null || echo snapshot)
rm -f "$OUT"
git -C "$SNAP" archive --format=zip --prefix=iniqdash/ -o "$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")" HEAD -- . \
  ':!tests' ':!tools' ':!packaging' ':!.github' ':!dev' ':!docs/iniqdash-demo' ':!docs/theme-studio' ':!docs/screenshots'
echo "release zip: $OUT  version=$VER  files=$(unzip -Z1 "$OUT" | grep -v '/$' | wc -l)  sha256=$(sha256sum "$OUT" | awk '{print $1}')"
