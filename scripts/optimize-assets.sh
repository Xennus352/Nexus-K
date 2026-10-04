#!/usr/bin/env bash
# Derives the committed WebP art in public/gfx/{zeus,egypt,viking} from the three
# packs dropped into public/assets:
#
#   public/assets/zeus_slot_complete_asset_pack   purpose-built slot art
#   public/assets/gptEgypt                        7 ornate Egyptian emblems (RGBA)
#   public/assets/gptViking/models/*/diffuse.jpg  low-poly 3D model textures
#
#   ./scripts/optimize-assets.sh
#
# Requires ImageMagick 7 (`magick`). public/assets is git-ignored; everything the
# app loads is the small derivative written under public/gfx.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="public/assets"
ZEUS="$SRC/zeus_slot_complete_asset_pack"
EGY="$SRC/gptEgypt"
VIK="$SRC/gptViking/models"
OUT="public/gfx"

command -v magick >/dev/null || { echo "error: ImageMagick 7 ('magick') not found" >&2; exit 1; }
for d in "$ZEUS" "$EGY" "$VIK"; do
  [ -d "$d" ] || { echo "error: missing source dir: $d" >&2; exit 1; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Cut size of a reel symbol, in px. Matches the other packs so no game looks
# coarser or softer than its neighbours.
SYMBOL_PX=192

# --- key -------------------------------------------------------------------------
# The zeus pack was cropped out of one sprite atlas, so symbols and buttons ship
# with the atlas background still baked in (an opaque ~rgb(20,28,38) field, exactly
# as its README warns). The subjects are all far brighter than that field, so
# deriving alpha from a luminance ramp cuts them out cleanly while keeping the
# dark interior detail that a flood-fill would eat.
#
#   $1 in  $2 ramp (lo,hi)  $3 out
key() {
  magick "$1" -colorspace sRGB \
    \( +clone -colorspace gray -auto-level -level "$2" \) \
    -alpha off -compose CopyOpacity -composite "$3"
}

# Symbols want a slightly more forgiving ramp than buttons: their art has deeper
# shadows, and clipping those reads as a hole in the middle of the glyph.
SYM_RAMP='12%,42%'
BTN_RAMP='10%,34%'

# Trim to the opaque subject, then re-centre in a square so every symbol carries
# the same visual weight on the reel regardless of how the atlas cropped it.
square() {
  local in="$1" px="$2" out="$3"
  magick "$in" \
    -trim +repage \
    -resize "${px}x${px}" \
    -background none -gravity center -extent "${px}x${px}" \
    "$out"
}

webp() { magick "$1" -strip -quality "${2:-86}" -define webp:method=6 "$3"; }

# ---------------------------------------------------------------------- zeus --
mkdir -p "$OUT/zeus/sym" "$OUT/zeus/bg" "$OUT/zeus/feat" "$OUT/zeus/btn" "$OUT/zeus/ui"

count=0
for f in "$ZEUS"/symbols/*.png; do
  n="$(basename "$f" .png)"
  key "$f" "$SYM_RAMP" "$TMP/k.png"
  square "$TMP/k.png" "$SYMBOL_PX" "$TMP/s.png"
  webp "$TMP/s.png" 90 "$OUT/zeus/sym/$n.webp"
  count=$((count + 1))
done
echo "zeus: $count symbols"

# Scenes are opaque and legitimately full-bleed, so they only need upscaling.
count=0
for f in "$ZEUS"/backgrounds/*.png; do
  n="$(basename "$f" .png)"
  # The sources are ~250px wide but get painted across a whole viewport.
  magick "$f" -strip -resize 1280x720^ -gravity center -extent 1280x720 "$TMP/b.png"
  webp "$TMP/b.png" 82 "$OUT/zeus/bg/$n.webp"
  count=$((count + 1))
done
echo "zeus: $count backgrounds"

for f in "$ZEUS"/feature_banners/*.png; do
  n="$(basename "$f" .png)"
  magick "$f" -strip -resize 512x224 "$TMP/b.png"
  webp "$TMP/b.png" 88 "$OUT/zeus/feat/$n.webp"
done
echo "zeus: $(find "$OUT/zeus/feat" -name '*.webp' | wc -l) feature banners"

count=0
for f in "$ZEUS"/buttons/*.png; do
  n="$(basename "$f" .png)"
  key "$f" "$BTN_RAMP" "$TMP/k.png"
  # Trim, then pad back out: the atlas crops are all different sizes and a bare
  # trim leaves the small controls (close, help) visually lighter than spin.
  square "$TMP/k.png" 128 "$TMP/s.png"
  webp "$TMP/s.png" 90 "$OUT/zeus/btn/$n.webp"
  count=$((count + 1))
done
echo "zeus: $count buttons"

for f in "$ZEUS"/interface/*.png; do
  n="$(basename "$f" .png)"
  magick "$f" -strip -resize 512x512 "$TMP/b.png"
  webp "$TMP/b.png" 86 "$OUT/zeus/ui/$n.webp"
done
echo "zeus: $(find "$OUT/zeus/ui" -name '*.webp' | wc -l) interface panels"

# --------------------------------------------------------------------- egypt --
# Already clean RGBA at 256px; nothing to key, just normalise the container.
mkdir -p "$OUT/egypt"
count=0
for f in "$EGY"/*.png; do
  n="$(basename "$f" .png | tr '[:upper:]' '[:lower:]')"
  magick "$f" -auto-orient -trim +repage \
    -resize "${SYMBOL_PX}x${SYMBOL_PX}" -background none -gravity center \
    -extent "${SYMBOL_PX}x${SYMBOL_PX}" \
    -strip -quality 92 -define webp:method=6 "$OUT/egypt/$n.webp"
  count=$((count + 1))
done
echo "egypt: $count emblems"

# -------------------------------------------------------------------- viking --
# The viking drop is 38 low-poly FBX models, but only the diffuse textures were
# exported and a UV atlas is unusable as reel art: each one is a full square of
# unpainted UV islands (measured: 56-64 distinct colours after quantising to 64,
# i.e. maximum noise). What they *are* good for is palette and material — moss,
# weathered pine, snow, granite, iron — so they are composited into one wide
# atmospheric panorama used as the viking cabinet backdrop and login-screen plate.
mkdir -p "$OUT/viking"

# model:crop-offset pairs. The offsets are fixed so re-running the script is
# byte-stable, but each pulls a different part of its 1024² atlas so no two
# fields look alike — tiling the same square eight times produced a visible
# horizontal sawtooth, which is what this avoids.
FIELDS=(
  "Split Granite Shard:0:120"
  "Snow-Capped Pine:340:60"
  "Mossy Boulder:120:400"
  "Large Viking Clan Hall:400:300"
  "Coastal Cliff Fragment:60:260"
  "Tall Pine Tree:280:440"
  "Viking Watch Tower:180:180"
  "Viking Elder:300:440"
)

fields=()
i=0
for spec in "${FIELDS[@]}"; do
  m="${spec%%:*}"; rest="${spec#*:}"; ox="${rest%%:*}"; oy="${rest##*:}"
  [ -f "$VIK/$m/diffuse.jpg" ] || { echo "warn: missing viking model: $m" >&2; continue; }

  # Not every export is 1024² (Riverbed Pebbles ships at 256²), so clamp the crop
  # window to the source instead of trusting the offsets above.
  read -r sw sh <<<"$(magick identify -format '%w %h' "$VIK/$m/diffuse.jpg")"
  cw=$(( sw < 520 ? sw : 520 )); ch=$(( sh < 520 ? sh : 520 ))
  ox=$(( ox > sw - cw ? sw - cw : ox )); oy=$(( oy > sh - ch ? sh - ch : oy ))

  # Blurred to the point of abstraction so it reads as weather and material
  # rather than as UV islands, and pushed cold to build the nordic palette.
  magick "$VIK/$m/diffuse.jpg" -auto-orient \
    -crop "${cw}x${ch}+${ox}+${oy}" +repage \
    -resize 1600x900! \
    -blur 0x95 \
    -modulate 104,116,100 \
    "$TMP/field-$i.png"
  fields+=("$TMP/field-$i.png")
  i=$((i + 1))
done

if [ ${#fields[@]} -gt 0 ]; then
  # Pairwise dissolve welds the fields into one smooth colour field.
  weights=()
  n=${#fields[@]}
  for ((j = 0; j < n - 1; j++)); do weights+=("55,48,52,50,46,54,50,56"); done
  magick "${fields[@]}" \
    -define compose:args="$(IFS=,; echo "${weights[*]}")" \
    -compose Dissolve -composite "$TMP/blend.png"

  # Night sky bleeding into a pale horizon glow, then dark tundra. Screen lifts
  # the field over the top so its moss/slate material shows without the whole
  # plate turning to grey mush the way Overlay did.
  magick -size 1600x900 gradient:'#16263f-#3f6472' "$TMP/sky.png"
  magick -size 1600x900 gradient:'#3f6472-#0a1019' "$TMP/ground.png"
  magick "$TMP/sky.png" "$TMP/ground.png" -append "$TMP/base.png"
  magick "$TMP/base.png" "$TMP/blend.png" -evaluate multiply 0.55 \
    -compose Screen -composite "$TMP/step1.png"

  # Corner falloff only: the plate sits behind the cabinet and would otherwise
  # pull focus off the reels at the edges.
  magick -size 1600x900 xc:white -sparse-color bilinear \
    '0,0 gray62  1600,0 gray62  800,430 white  0,900 gray62  1600,900 gray62' \
    "$TMP/vig.png"
  magick "$TMP/step1.png" "$TMP/vig.png" -compose Multiply -composite "$TMP/pano.png"
  webp "$TMP/pano.png" 82 "$OUT/viking/bg.webp"
  echo "viking: 1 panorama from ${#fields[@]} model textures"
else
  echo "viking: no textures found, skipped" >&2
fi

du -sh "$OUT"/{zeus,egypt,viking} 2>/dev/null || true