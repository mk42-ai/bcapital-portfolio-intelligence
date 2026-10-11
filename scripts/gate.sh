#!/usr/bin/env sh
# Thin wrapper: run the gate runner from the repo root. Flags are forwarded (e.g. `scripts/gate.sh --build`).
set -eu
cd "$(dirname "$0")/../web" && exec node scripts/gate.mjs "$@"
