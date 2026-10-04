#!/usr/bin/env bash
# Install the pinned Almide release binary. The tag is in .almide-release and the
# expected sha256 of each platform archive in .almide-checksums.sha256; an archive
# that does not match is never unpacked or installed. Needs curl and tar.
set -euo pipefail
cd "$(dirname "$0")/.."
tag=$(tr -d '\r\n' < .almide-release)
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release tag in .almide-release' >&2; exit 1; }
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux-x86_64 ;;
  Linux-aarch64 | Linux-arm64) platform=linux-aarch64 ;;
  Darwin-arm64) platform=macos-aarch64 ;;
  Darwin-x86_64) platform=macos-x86_64 ;;
  *) echo "No Almide release archive for $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac
archive="almide-$platform.tar.gz"
expected=$(awk -v f="$archive" '$2 == f { print $1 }' .almide-checksums.sha256)
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo "No checksum for $archive" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --fail --location --silent --show-error --retry 3 \
  -o "$work/$archive" "https://github.com/almide/almide/releases/download/$tag/$archive"
if command -v sha256sum >/dev/null; then
  actual=$(sha256sum "$work/$archive" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$work/$archive" | awk '{ print $1 }')
fi
if [[ "$actual" != "$expected" ]]; then
  echo "Checksum mismatch for $archive: expected $expected, got $actual" >&2; exit 1
fi
tar -xzf "$work/$archive" -C "$work"
# almide verify execs almide-verify from next to itself, so both are installed.
mkdir -p .tools/bin
for tool in almide almide-verify; do
  install -m 0755 "$work/almide-$platform/$tool" ".tools/bin/$tool"
done
printf '%s\n' "$tag" > .tools/bin/almide.release
.tools/bin/almide --version
