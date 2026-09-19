#!/bin/bash

set -e

show_help() {
  cat << EOF
Usage: $0 [OPTIONS] <example> [port]

Examples:
  semiconductor-demo      Run semiconductor demo (default port: 8443)
  collection-reading-demo Run collection reading demo (default port: 3000)

Options:
  -h, --help              Show this help message
  -k, --kill              Kill existing process on port before starting

Examples:
  $0 semiconductor-demo
  $0 semiconductor-demo 8443
  $0 collection-reading-demo 3000
  $0 -k collection-reading-demo
EOF
}

KILL_PORT=false
EXAMPLE_DIR=""
PORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    -k|--kill)
      KILL_PORT=true
      shift
      ;;
    *)
      if [[ -z "$EXAMPLE_DIR" ]]; then
        EXAMPLE_DIR="$1"
      elif [[ -z "$PORT" ]]; then
        PORT="$1"
      fi
      shift
      ;;
  esac
done

EXAMPLE_DIR="${EXAMPLE_DIR:-semiconductor-demo}"

case "$EXAMPLE_DIR" in
  semiconductor-demo)
    PORT="${PORT:-8443}"
    ;;
  collection-reading-demo)
    PORT="${PORT:-3000}"
    ;;
  *)
    echo "Error: Unknown example '$EXAMPLE_DIR'"
    show_help
    exit 1
    ;;
esac

if [[ "$KILL_PORT" == true ]]; then
  echo "Killing process on port $PORT..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$EXAMPLE_DIR" in
  semiconductor-demo)
    echo "Starting semiconductor demo on http://127.0.0.1:$PORT/"
    CONTEXTPILOT_DEMO_PORT="$PORT" pnpm demo:semiconductor
    ;;
  collection-reading-demo)
    ROOT="$PROJECT_ROOT/examples/collection-reading-demo"
    echo "Starting collection-reading demo on http://127.0.0.1:$PORT/"
    npx serve "$ROOT" -p "$PORT" --no-port-switching
    ;;
esac