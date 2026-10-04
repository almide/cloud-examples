#!/usr/bin/env bash
# Build the exact reviewed compiler revision. Rust 1.99.0, git, and a C toolchain required.
set -euo pipefail
cd "$(dirname "$0")/.."
revision=$(tr -d '\r\n' < .almide-revision)
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid compiler revision' >&2; exit 1; }
source_dir="$PWD/.tools/almide-source"
if [[ ! -d "$source_dir/.git" ]]; then
  mkdir -p .tools
  git init "$source_dir"
  git -C "$source_dir" remote add origin https://github.com/almide/almide.git
fi
if [[ "$(git -C "$source_dir" remote get-url origin)" != https://github.com/almide/almide.git ]]; then
  echo 'Unexpected compiler source remote' >&2; exit 1
fi
require_clean_source() {
  if [[ -n "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ]]; then
    echo 'Compiler source has modified or untracked files. Preserve your edits and use a clean checkout.' >&2
    exit 1
  fi
}
# Never replace local edits, or label them as the pinned upstream revision.
# Normal ignored build artifacts (for example target/) do not make it dirty.
require_clean_source
git -C "$source_dir" fetch --depth 1 origin "$revision"
git -C "$source_dir" checkout --detach "$revision"
[[ "$(git -C "$source_dir" rev-parse HEAD)" == "$revision" ]]
require_clean_source
# The root rust-toolchain.toml selects the pinned Rust toolchain.
cargo build --locked --release --bin almide --manifest-path "$source_dir/Cargo.toml"
mkdir -p .tools/bin
cp "$source_dir/target/release/almide" .tools/bin/almide
printf '%s\n' "$revision" > .tools/bin/almide.revision
.tools/bin/almide --version
