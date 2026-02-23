#!/usr/bin/env bash
# Test that the packed package installs cleanly with Angular 19.
# Run from repo root: npm run test:install (or ./scripts/test-install.sh)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building and packing package..."
cd "$ROOT/bridge-angular"
npm install
npm run build
# ng-packagr outputs to dist/ — pack from there (not the source directory)
cd "$ROOT/bridge-angular/dist"
npm pack
PACKED=$(ls nebulr-group-bridge-angular-*.tgz 2>/dev/null | head -1)
if [ -z "$PACKED" ] || [ ! -f "$PACKED" ]; then
  echo "Could not find packed tarball" >&2
  exit 1
fi
mv "$PACKED" "$ROOT/install-test-pkg.tgz"

TEST_DIR="$ROOT/install-test-tmp"
TGZ="$ROOT/install-test-pkg.tgz"
rm -rf "$TEST_DIR"
trap "rm -rf '$TEST_DIR'; rm -f '$TGZ'" EXIT

echo "==> Testing install with @angular/core@19..."
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
npm init -y
npm install @angular/core@^19 @angular/common@^19 @angular/router@^19 @angular/platform-browser@^19
npm install "$ROOT/install-test-pkg.tgz"
echo "    @angular/core@19: OK"

echo "==> All install tests passed."
