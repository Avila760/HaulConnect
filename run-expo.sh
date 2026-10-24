#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export HOME="$PWD/.expo-home"
export EXPO_NO_TELEMETRY=1
export PATH="/Users/chayanneavila/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/chayanneavila/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH"

pnpm start -- --port 8082 --clear
