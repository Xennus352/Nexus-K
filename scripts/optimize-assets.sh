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
BT="public/assets/buttons"
SL="public/assets/slots"
TM="public/assets/times"
OUT="public/gfx"

for d in "$K" "$C" "$F2" "$PF" "$XY" "$BT" "$SL" "$TM"; do
  [ -d "$d" ] || { echo "error: missing source pack: $d" >&2; exit 1; }
done

mkdir -p "$OUT/sym" "$OUT/classic" "$OUT/fruits2" "$OUT/pixelfood" "$OUT/fantasy" \
         "$OUT/lux" "$OUT/badge" "$OUT/btn" "$OUT/mult"

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
conv "$K/logo/logo_short.png"                   320x "$OUT/logo-short.webp"
conv "$K/reel/reel_frame_filled.png"            512x "$OUT/frame.webp"
conv "$K/reel/reel_frame_empty.png"             512x "$OUT/frame-empty.webp"
conv "$K/popups/big_win.png"                    640x "$OUT/bigwin.webp"
conv "$K/popups/big_win_decor.png"             1024x "$OUT/bigwin-decor.webp"
conv "$K/characters/anubis.png"                 320x "$OUT/anubis.webp"
conv "$K/characters/anubis_frame.png"           384x "$OUT/anubis-frame.webp"
conv "$K/symbols/high/high_ankh_no_frame.png"   256x "$OUT/sym/ankh.webp"
conv "$K/symbols/high/high_eye_no_frame.png"    256x "$OUT/sym/eye.webp"
conv "$K/symbols/high/high_necklace_no_frame.png" 256x "$OUT/sym/necklace.webp"
conv "$K/symbols/high/high_scarab_no_frame.png"   256x "$OUT/sym/scarab.webp"
conv "$K/symbols/wild/wild.png"                 256x "$OUT/sym/wild.webp"
# The framed variants dress the winning cells (a gem tile instead of a glyph).
conv "$K/symbols/high/high_ankh.png"            256x "$OUT/sym/ankh-gem.webp"
conv "$K/symbols/high/high_eye.png"             256x "$OUT/sym/eye-gem.webp"
conv "$K/symbols/high/high_necklace.png"        256x "$OUT/sym/necklace-gem.webp"
conv "$K/symbols/high/high_scarab.png"          256x "$OUT/sym/scarab-gem.webp"

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

# The rest of the food pack becomes the food-court props that dress the cabinet
# of every Pixel Food game, so all 100 icons are in play.
mkdir -p "$OUT/food"
while IFS= read -r -d '' f; do
  n=$(basename "$f" .png)
  [ -f "$OUT/pixelfood/$n.webp" ] && continue
  convpx "$f" 800% "$OUT/food/$n.webp"
done < <(find "$PF" -maxdepth 1 -type f -iname '*.png' -print0 | sort -z)

echo "Pixel Fantasy Slot Machine:"
for i in 1 2 3 4 5; do
  convpx "$XY/slot-machine$i.png" 100% "$OUT/fantasy/machine-$i.webp"
done
for i in 1 2 3 4; do
  convpx "$XY/slot-symbol$i.png" 300% "$OUT/fantasy/symbol-$i.webp"
done

# The three newer packs are named by hand, so they are exported by name:
#   slots  -> lux/sym-<name>.webp        reel symbols (jocker = wild)
#   times  -> mult/m<n>.webp             gamble multipliers, badge/<name>.webp feature marks
#   buttons-> btn/round-NN|wide-NN.webp  compact vs wide button plates
img_w() { magick identify -format "%w" "$1"; }

slug() { printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

is_squareish() {
  local w h
  w=$(img_w "$1")
  h=$(magick identify -format "%h" "$1")
  [ $((w * 100 / (h > 0 ? h : 1))) -le 130 ]
}

echo "Slots pack (luxury reel symbols):"
while IFS= read -r -d '' f; do
  name=$(basename "$f" .png)
  conv "$f" 288x "$OUT/lux/$(slug "$name").webp"
done < <(find "$SL" -type f -name '*.png' -print0 | sort -z)

echo "Multipliers + feature badges:"
while IFS= read -r -d '' f; do
  name=$(basename "$f" .png)
  slugname=$(slug "$name")
  case "$slugname" in
    [0-9]*x*) conv "$f" 400x "$OUT/mult/$slugname.webp" ;;
    *)        conv "$f" 320x "$OUT/badge/$slugname.webp" ;;
  esac
done < <(find "$TM" -type f -name '*.png' -print0 | sort -z)

echo "Buttons (round + wide):"
round_n=0
wide_n=0
while IFS= read -r -d '' f; do
  if is_squareish "$f"; then
    round_n=$((round_n + 1))
    conv "$f" 320x "$OUT/btn/round-$(printf '%02d' "$round_n").webp"
  else
    wide_n=$((wide_n + 1))
    conv "$f" 640x "$OUT/btn/wide-$(printf '%02d' "$wide_n").webp"
  fi
done < <(find "$BT" -type f -name '*.png' -print0 | sort -z)

echo "counts: buttons=$((round_n + wide_n)) (round=$round_n wide=$wide_n)"

echo
echo "total: $(du -sh "$OUT" | cut -f1)"