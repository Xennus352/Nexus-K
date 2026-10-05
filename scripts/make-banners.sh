#!/usr/bin/env bash
#
# Composes the game-screen backdrop for packs that ship no scene of their own.
#
# Five packs — egypt, lux, classic, fruits2, pixelfood — arrive as a folder of
# loose symbols with nothing landscape-shaped anywhere in them, so their games
# fell back to a flat theme gradient. This paints each one the way a real
# cabinet's backglass is painted: a gradient in the pack's own colours, a
# spotlight falling from the top, the pack's art hung large down the left and
# right edges with a shelf of smaller symbols along the bottom, and a vignette
# that keeps the middle dark. The middle is left empty on purpose — the reel
# cabinet is drawn on top of this image, and on a wide screen only the two side
# margins and the bottom band are ever visible past it.
#
# Usage: scripts/make-banners.sh [pack ...]     (default: every pack below)
#
# Requires ImageMagick (`magick`), same as scripts/optimize-assets.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v magick >/dev/null; then
  echo "ImageMagick is required (magick not found on PATH)" >&2
  exit 1
fi

OUT=public/gfx
W=1600
H=900
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Every pack, its palette, and the art that goes on it. The order of the art
# list is load-bearing: the first two are the big edge pieces (left, right),
# the rest are the bottom shelf, read left to right.
declare -A TOP=(
  [egypt]="#c9922e" [lux]="#8a5a10" [classic]="#8f1620"
  [fruits2]="#7a2470" [pixelfood]="#12765f"
)
declare -A BOTTOM=(
  [egypt]="#0b1030" [lux]="#160d02" [classic]="#1a0509"
  [fruits2]="#17061a" [pixelfood]="#03140f"
)
declare -A GLOW=(
  [egypt]="#ffe6a8" [lux]="#ffe0a0" [classic]="#ff9a5e"
  [fruits2]="#ff9ec7" [pixelfood]="#a9f7d6"
)
declare -A ART=(
  [egypt]="udjat goldscarab khopesh redankh scarab turquoiseankh"
  [lux]="crown jocker diamond ruby coin bell"
  [classic]="seven horseshoe bell clover cherry lemon"
  [fruits2]="sym-01 sym-07 sym-04 sym-11 sym-05 sym-13"
  [pixelfood]="fruit_watermelon fruit_strawberry fruit_peach fruit_banana fruit_orange fruit_cherry"
)

# Pixel art must not be smoothed when it is blown up to 460px, or every
# deliberate hard edge turns to mush. Set before the draw so it reaches the
# scale ImageMagick does while placing each symbol.
pixel_filter() {
  case "$1" in fruits2|pixelfood) echo "-filter point";; *) echo "";; esac
}

banner() {
  local pack=$1
  local art=(${ART[$pack]})
  local filter
  filter=$(pixel_filter "$pack")

  # Hero art, at 74% so the palette shows through and neither edge shouts over
  # the rim light the cabinet paints for itself. The right one faces inwards.
  local heroL=$WORK/${pack}-left.webp
  local heroR=$WORK/${pack}-right.webp
  magick "$OUT/$pack/${art[0]}.webp" $filter -alpha on -channel A \
    -evaluate multiply 0.74 +channel "$heroL"
  magick "$OUT/$pack/${art[1]}.webp" $filter -flop -alpha on -channel A \
    -evaluate multiply 0.74 +channel "$heroR"

  local -a draw=()
  draw+=(-draw "image Over -70,150 460,460 '$heroL'")
  draw+=(-draw "image Over 1210,150 460,460 '$heroR'")

  # Bottom shelf, four symbols sitting in the two side margins — the one part
  # of a 1600x900 backdrop a 1100px-wide cabinet leaves uncovered.
  local i x
  for i in 2 3 4 5; do
    case $i in 2) x=20;; 3) x=250;; 4) x=1140;; 5) x=1370;; esac
    draw+=(-draw "image Over $x,690 200,200 '$OUT/$pack/${art[$i]}.webp'")
  done

  # The base is built as the first frame of this one command rather than written
  # to disk and read back — one pass, and no round-trip through the image cache
  # for the largest frame in it. (Only the two hero pieces are pre-rendered,
  # because they have to be dimmed and mirrored before they can be placed.)
  local -a base=()
  if [[ $pack == egypt ]]; then
    # Egypt already owns a full scene, so it is the base rather than a gradient.
    base=("$OUT/bg.webp" -resize "${W}x${H}^" -gravity center -extent "${W}x${H}")
  else
    base=(-size "${W}x${H}" "gradient:${TOP[$pack]}-${BOTTOM[$pack]}")
  fi

  # ImageMagick 7 refuses to queue pixels for `-draw image` while a non-default
  # gravity is in force ("pixels are not authentic"), and everything above sets
  # one — the egypt base centres itself, the glow group anchors north. Resetting
  # to the default is what lets any art be placed at all.
  #
  # The vignette is soft rather than hard: the only part of this image a player
  # actually sees is the two side margins and the bottom band past the opaque
  # cabinet, so blacking them out would hide the very art it is here for.
  magick "${base[@]}" \
    $filter \
    \( -background black -size 1150x640 "radial-gradient:${GLOW[$pack]}-#000000" \
       -gravity north -extent "${W}x${H}" \) \
    -compose screen -composite \
    -gravity northwest \
    "${draw[@]}" \
    \( -size "${W}x${H}" radial-gradient:'#ffffff-#8c8c8c' \) \
    -compose multiply -composite \
    -quality 82 "$OUT/$pack/bg.webp"
  echo "  $pack -> $OUT/$pack/bg.webp"
}

packs=("$@")
if [[ ${#packs[@]} -eq 0 ]]; then
  packs=(egypt lux classic fruits2 pixelfood)
fi

echo "Composing ${#packs[@]} backdrop(s):"
for p in "${packs[@]}"; do
  [[ -n "${ART[$p]:-}" ]] || { echo "  unknown pack: $p" >&2; exit 1; }
  banner "$p"
done
echo "Done."
