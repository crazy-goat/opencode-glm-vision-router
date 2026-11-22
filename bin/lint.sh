#!/usr/bin/env bash
set -u

status=0

run() {
  local label="$1"
  shift
  printf '== %s\n' "$label"
  "$@" || status=1
}

if [ "${1:-}" = "--fix" ]; then
  run "Prettier (write)" bunx prettier --write .
  run "ESLint (fix)" bunx eslint --fix src test eslint.config.js
fi

run "ESLint" bunx eslint src test eslint.config.js
run "Prettier" bunx prettier --check .
run "Unit tests" bun test

exit "$status"
