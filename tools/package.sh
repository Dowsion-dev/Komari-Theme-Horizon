#!/usr/bin/env bash
# Build the installable theme zip: Komari-Theme-Horizon-v<version>.zip (komari-theme.json at the zip root).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print(json.load(open('komari-theme.json'))['version'])")
OUT="Komari-Theme-Horizon-v${VERSION}.zip"
rm -f "$OUT"
zip -qr "$OUT" komari-theme.json preview.png dist -x '*.DS_Store'
echo "$OUT"
