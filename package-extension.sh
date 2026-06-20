#!/usr/bin/env bash
# Build a Chrome Web Store upload package from extension/.
# The zip has manifest.json at its ROOT (Web Store requirement), and excludes
# test files and OS cruft.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/extension"

VERSION="$(node -e "process.stdout.write(require('./manifest.json').version)")"
OUT="$ROOT/pawp-connect-v${VERSION}.zip"

rm -f "$OUT"
# Zip the CONTENTS of extension/ (note the trailing dot), not the folder itself.
zip -r "$OUT" . \
  -x '*.test.js' \
  -x '*/.DS_Store' \
  -x '.DS_Store' \
  -x 'icons/icon.svg' >/dev/null

echo "Built: $OUT"
unzip -l "$OUT"
