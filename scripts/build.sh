#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
almide="${ALMIDE_BIN:-$PWD/.tools/bin/almide}"
if [[ ! -x "$almide" ]]; then
  echo 'Compiler missing. Run ./scripts/install-almide.sh first.' >&2; exit 1
fi
if [[ -z "${ALMIDE_BIN:-}" ]]; then
  cmp -s .almide-release .tools/bin/almide.release || {
    echo 'Compiler release mismatch. Re-run ./scripts/install-almide.sh.' >&2; exit 1
  }
fi
mkdir -p build
"$almide" check src/native.almd
"$almide" build src/native.almd -o build/server
"$almide" build src/wasm.almd --target wasm --host js -o build/app.wasm
