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
F2="public/assets/Fruits Asset 2/Fruits Asset"
F2O="public/assets/Fruits Asset 2/Fruits Asset/Black Outline"
PF="public/assets/Free_pixel_food_16x16/Icons"
XY="public/assets/Pixel Fantasy Slot Machine/Slot Machine"
OUT="public/gfx"

for d in "$K" "$C" "$F2" "$PF" "$XY"; do
  [ -d "$d" ] || { echo "error: missing source pack: $d" >&2; exit 1; }
done

mkdir -p "$OUT/sym" "$OUT/classic" "$OUT/fruits2" "$OUT/pixelfood" "$OUT/fantasy"

conv() {
  magick "$1" -auto-orient -strip -resize "$2" -quality 80 -define webp:method=6 "$3"
  printf '  %-46s %s\n' "$3" "$(du -h "$3" | cut -f1)"
}

# pixel art: nearest-neighbour upscale + lossless so the pixels stay crisp
convpx() {
  magick "$1" -auto-orient -strip -filter point -resize "$2" -quality 100 \
    -define webp:lossless=true -define webp:method=6 "$3"
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

echo "Fruits Asset 2 (outlined reel symbols + plain accents):"
for i in 01 02 03 04 05 06 07 08 09 10 11 12 13; do
  convpx "$F2O/$i.png" 800% "$OUT/fruits2/sym-$i.webp"
  convpx "$F2/$i.png"  800% "$OUT/fruits2/plain-$i.webp"
done

echo "Free pixel art foods (fruit icons):"
for n in fruit_apple fruit_apple-slice fruit_banana fruit_blueberry \
         fruit_cherry fruit_grape_red fruit_greengrape fruit_kiwi \
         fruit_lemon fruit_lime fruit_orange fruit_orange_slice \
         fruit_peach fruit_strawberry fruit_watermelon fruit_watermelon_slice; do
  convpx "$PF/$n.png" 800% "$OUT/pixelfood/$n.webp"
done

echo "Pixel Fantasy Slot Machine:"
for i in 1 2 3 4 5; do
  convpx "$XY/slot-machine$i.png" 100% "$OUT/fantasy/machine-$i.webp"
done
for i in 1 2 3 4; do
  convpx "$XY/slot-symbol$i.png" 300% "$OUT/fantasy/symbol-$i.webp"
done

echo
echo "total: $(du -sh "$OUT" | cut -f1)"