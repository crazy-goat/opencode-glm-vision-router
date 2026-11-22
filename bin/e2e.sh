#!/usr/bin/env bash
# Optional end-to-end harness. It is not part of bin/lint.sh or CI.
# It starts an isolated `opencode serve` and a mock provider.
# Set OPENCODE_BIN to choose the binary. Otherwise the script uses `opencode` from PATH.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "skipped: bun not found"
  exit 0
fi

exec bun "$root/test/e2e/run.mjs" "$@"
