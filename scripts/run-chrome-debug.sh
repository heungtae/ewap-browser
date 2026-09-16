#!/usr/bin/env bash
# Starts an isolated Chrome instance for local extension debugging.
#
# Examples:
#   scripts/run-chrome-debug.sh
#   CHROME_DEBUG_PORT=9333 scripts/run-chrome-debug.sh https://example.com/
#   CHROME_FOR_TESTING_BIN=/path/to/chrome scripts/run-chrome-debug.sh

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
extension_dir="${script_dir}/../dist-extension"
page_url="${1:-https://example.com/}"
debug_port="${CHROME_DEBUG_PORT:-9222}"
profile_dir="${CHROME_DEBUG_PROFILE:-${TMPDIR:-/tmp}/context-pilot-chrome-debug-profile-${debug_port}}"

if [[ ! -f "${extension_dir}/manifest.json" ]]; then
  echo "dist-extension is missing; run the extension build first." >&2
  exit 1
fi

if [[ -n "${CHROME_FOR_TESTING_BIN:-}" ]]; then
  chrome_path="${CHROME_FOR_TESTING_BIN}"
else
  cache_dir="${XDG_CACHE_HOME:-${HOME}/.cache}"
  shopt -s nullglob
  chrome_for_testing=(
    "${cache_dir}"/ms-playwright/chromium-*/chrome-linux*/chrome
  )
  shopt -u nullglob
  if (( ${#chrome_for_testing[@]} == 0 )); then
    echo "Chrome for Testing is required to load dist-extension automatically." >&2
    echo "Set CHROME_FOR_TESTING_BIN to its executable path and run again." >&2
    exit 1
  fi
  chrome_path="${chrome_for_testing[${#chrome_for_testing[@]} - 1]}"
fi

if [[ ! -x "${chrome_path}" ]]; then
  echo "Chrome for Testing executable was not found: ${chrome_path}" >&2
  exit 1
fi

echo "Starting Chrome with CDP at http://127.0.0.1:${debug_port}"
echo "Chrome for Testing: ${chrome_path}"
echo "Profile: ${profile_dir}"
echo "Extension: ${extension_dir}"

exec "${chrome_path}" \
  "--remote-debugging-address=127.0.0.1" \
  "--remote-debugging-port=${debug_port}" \
  "--user-data-dir=${profile_dir}" \
  "--disable-extensions-except=${extension_dir}" \
  "--load-extension=${extension_dir}" \
  "${page_url}"
