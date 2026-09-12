#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if command -v pnpm >/dev/null 2>&1; then
  exec pnpm run build
fi

if command -v corepack >/dev/null 2>&1; then
  exec corepack pnpm run build
fi

if [[ -x node_modules/.bin/tsc ]]; then
  node_modules/.bin/tsc -p tsconfig.build.json
  node scripts/bump-extension-version.mjs
  exec node scripts/build-extension.mjs
fi

echo "Build tools unavailable: install pnpm or project dependencies." >&2
exit 127
