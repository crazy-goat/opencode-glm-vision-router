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

# Prettier turns conflict markers into Markdown, so check for them here.
# git grep exits 1 when nothing matches, which is the passing case.
conflict_markers() {
  local hits code=0
  hits="$(git -C "$(dirname "$0")/.." grep -nE '^(<<<<<<<|=======|>>>>>>>)( |$)')" || code=$?
  if [ "$code" -eq 1 ]; then return 0; fi
  if [ "$code" -eq 0 ]; then
    printf '%s\n' "$hits"
  else
    printf 'git grep failed with exit code %s\n' "$code"
  fi
  return 1
}

run "Conflict markers" conflict_markers
run "ESLint" bunx eslint src test eslint.config.js
run "Prettier" bunx prettier --check .
run "Unit tests" bun test

exit "$status"
