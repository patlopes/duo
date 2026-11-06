#!/usr/bin/env bash
# Sets up Playwright WebKit on this machine, which has no sudo and lacks libavif16.
# The libraries are unpacked into a local folder and linked into WebKit's own lib directory,
# because its MiniBrowser wrapper overwrites LD_LIBRARY_PATH. CI does not need this:
# it runs `playwright install --with-deps webkit`.
set -euo pipefail

TOOLS="$(cd "$(dirname "$0")/../.." && pwd)/tools/playwright"
export PLAYWRIGHT_BROWSERS_PATH="$TOOLS/browsers"
LIBS="$TOOLS/webkit-libs"

npx playwright install webkit || true

mkdir -p "$LIBS/debs"
(
  cd "$LIBS/debs"
  apt-get download libavif16 libgav1-1 libyuv0 libabsl20220623t64
  for deb in *.deb; do dpkg-deb -x "$deb" "$LIBS/root"; done
)

for browser in "$PLAYWRIGHT_BROWSERS_PATH"/webkit-*; do
  for variant in wpe gtk; do
    for lib in "$LIBS"/root/usr/lib/x86_64-linux-gnu/*.so*; do
      ln -sfn "$lib" "$browser/minibrowser-$variant/lib/$(basename "$lib")"
    done
  done
done

echo "WebKit ready in $PLAYWRIGHT_BROWSERS_PATH"
