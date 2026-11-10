#!/usr/bin/env bash
# Import a hero image for a History of Things entry.
#
#   bin/import-image.sh <source-image> <slug>
#
# Downscales to 2000px on the long edge (plenty for a full-bleed hero on a 2x
# display), strips EXIF, and encodes AVIF into images/<slug>.avif.
set -euo pipefail

src=${1:?usage: import-image.sh <source-image> <slug>}
slug=${2:?usage: import-image.sh <source-image> <slug>}

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
out="$here/images/$slug.avif"
tmp=$(mktemp -t hot-hero).png
trap 'rm -f "$tmp"' EXIT

for cmd in magick avifenc; do
  command -v "$cmd" >/dev/null || { echo "missing required tool: $cmd (brew install imagemagick libavif)" >&2; exit 1; }
done

magick "$src" -auto-orient -strip -resize '2000x2000>' -quality 100 "$tmp"

# -q 65 keeps large photographs visually clean at roughly a twentieth of the
# JPEG size; -s 6 trades a little encode time for a smaller file.
avifenc -q 65 -a tune=ssim -j all -s 6 "$tmp" "$out" >/dev/null

magick identify -format '%f  %wx%h  %b\n' "$out"
