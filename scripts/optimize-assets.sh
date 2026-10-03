#!/usr/bin/env bash
# Regenerates the optimized WebP art in public/gfx from the original free asset
# packs dropped into public/assets. Requires ImageMagick.
#
#   ./scripts/optimize-assets.sh
#
# The originals stay in public/assets (git-ignored, ~122 MB); public/gfx is the
# committed, web-optimized derivative the app actually loads (~570 KB total).
set -euo pipefail
cd "$(dirname "$0")/.."

K="public/assets/RSG Slot Asset Pack - Crowns of Kemet - Free/RSG-Slot-Asset-Pack-Crowns-of-Kemet-Free/PNG"
C="public/assets/ville_seppanen_slots_symbols_asset_pack"
OUT="public/gfx"

if [ ! -d "$K" ] || [ ! -d "$C" ]; then
  echo "error: original asset packs not found under public/assets" >&2
  exit 1
fi

mkdir -p "$OUT/sym" "$OUT/classic"

conv() {
  magick "$1" -auto-orient -strip -resize "$2" -quality 80 -define webp:method=6 "$3"
  printf '  %-46s %s\n' "$3" "$(du -h "$3" | cut -f1)"
}

echo "Crowns of Kemet:"
conv "$K/background/background.png"           1600x "$OUT/bg.webp"
conv "$K/logo/logo_long.png"                   640x "$OUT/logo.webp"
conv "$K/reel/reel_frame_filled.png"            512x "$OUT/frame.webp"
conv "$K/popups/big_win.png"                    640x "$OUT/bigwin.webp"
conv "$K/popups/big_win_decor.png"             1024x "$OUT/bigwin-decor.webp"
conv "$K/characters/anubis.png"                 320x "$OUT/anubis.webp"
conv "$K/symbols/high/high_ankh_no_frame.png"   256x "$OUT/sym/ankh.webp"
conv "$K/symbols/high/high_eye_no_frame.png"    256x "$OUT/sym/eye.webp"
conv "$K/symbols/high/high_necklace_no_frame.png" 256x "$OUT/sym/necklace.webp"
conv "$K/symbols/high/high_scarab_no_frame.png"   256x "$OUT/sym/scarab.webp"
conv "$K/symbols/wild/wild.png"                 256x "$OUT/sym/wild.webp"

echo "Classic symbols:"
for n in apple bar bell cherry clover coin diamond die \
         grapefruit heart horseshoe lemon orange plum seven watermelon; do
  conv "$C/$n.png" 192x "$OUT/classic/$n.webp"
done

echo
echo "total: $(du -sh "$OUT" | cut -f1)"