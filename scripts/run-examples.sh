#!/bin/bash

set -e

show_help() {
  cat << EOF
Usage: $0 [OPTIONS] <demo-number|example> [port]

Demos:
  1  accessible-items-demo   Run semantic projection and Act fixture (default port: 3002)
  2  collection-reading-demo Run collection reading demo (default port: 3000)
  3  page-api-discovery-demo Run Page API Discovery fixture (default port: 3001)

Options:
  -h, --help              Show this help message
  -k, --kill              Kill existing process on port before starting

Examples:
  $0 1
  $0 1 3002
  $0 2 3000
  $0 -k 2
  $0 3 3001
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

EXAMPLE_DIR="${EXAMPLE_DIR:-accessible-items-demo}"

case "$EXAMPLE_DIR" in
  1)
    EXAMPLE_DIR="accessible-items-demo"
    ;;
  2)
    EXAMPLE_DIR="collection-reading-demo"
    ;;
  3)
    EXAMPLE_DIR="page-api-discovery-demo"
    ;;
esac

case "$EXAMPLE_DIR" in
  accessible-items-demo)
    PORT="${PORT:-3002}"
    ;;
  collection-reading-demo)
    PORT="${PORT:-3000}"
    ;;
  page-api-discovery-demo)
    PORT="${PORT:-3001}"
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
  accessible-items-demo)
    ROOT="$PROJECT_ROOT/examples/accessible-items-demo"
    echo "Starting accessible-items demo on http://127.0.0.1:$PORT/"
    npx serve "$ROOT" -p "$PORT" --no-port-switching
    ;;
  collection-reading-demo)
    ROOT="$PROJECT_ROOT/examples/collection-reading-demo"
    echo "Starting collection-reading demo on http://127.0.0.1:$PORT/"
    npx serve "$ROOT" -p "$PORT" --no-port-switching
    ;;
  page-api-discovery-demo)
    ROOT="$PROJECT_ROOT/examples/page-api-discovery-demo"
    echo "Starting Page API Discovery fixture on http://127.0.0.1:$PORT/"
    npx serve "$ROOT" -p "$PORT" --no-port-switching
    ;;
esac
