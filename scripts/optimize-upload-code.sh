#!/usr/bin/env bash
# Derives the committed WebP art in public/gfx/brand, public/gfx/gateways and
# public/gfx/payments (plus the public/sfx sound effects) from the Laravel casino
# dump in public/Upload_Code. Requires ImageMagick.
#
#   ./scripts/optimize-upload-code.sh
#
# The dump itself is ~168 MB and git-ignored; everything the app loads is a small
# derivative written under public/.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="public/Upload_Code"
SQL="$SRC/install/database.sql"
GW="$SRC/assets/images/gateway"
LOGOS="$SRC/assets/images/logo_icon"
PAY="$SRC/assets/images/frontend/payment_method"
AUDIO="$SRC/assets/audio"
ADMIN_LOGIN="$SRC/assets/admin/images/login.jpg"
OUT="public/gfx"

for d in "$GW" "$LOGOS" "$PAY" "$AUDIO"; do
  [ -d "$d" ] || { echo "error: missing source dir: $d (is $SRC present?)" >&2; exit 1; }
done
[ -f "$SQL" ] || { echo "error: missing $SQL" >&2; exit 1; }

mkdir -p "$OUT/gateways" "$OUT/payments" "$OUT/brand" public/sfx

conv() {
  magick "$1" -auto-orient -strip -resize "$2" -quality 84 -define webp:method=6 "$3"
  printf '  %-46s %s\n' "$3" "$(du -h "$3" | cut -f1)"
}

slug() { printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

# ---------------------------------------------------------------- brand marks
echo "Brand marks:"
conv "$LOGOS/logo.png"       232x "$OUT/brand/logo.webp"
conv "$LOGOS/favicon.png"    128x "$OUT/brand/favicon.webp"
conv "$LOGOS/pwa_favicon.png" 192x "$OUT/brand/icon-192.webp"
conv "$LOGOS/pwa_thumb.png"  512x "$OUT/brand/icon-512.webp"

# Admin login backdrop. The source is a photographic JPEG; a wide, dark, low-bit
# WebP is plenty because it always sits behind a dark scrim.
if [ -f "$ADMIN_LOGIN" ]; then
  magick "$ADMIN_LOGIN" -auto-orient -strip -resize 1600x -colorspace Gray \
    -fill '#070b1c' -colorize 32% -quality 72 -define webp:method=6 \
    "$OUT/brand/admin-login.webp"
  printf '  %-46s %s\n' "$OUT/brand/admin-login.webp" "$(du -h "$OUT/brand/admin-login.webp" | cut -f1)"
fi

# ------------------------------------------------------------------- gateways
# The Laravel schema stores gateway art under a content-hashed filename, so the
# alias -> file mapping is read straight out of the `gateways` seed rows instead
# of being hard-coded here (keeps working when the dump is refreshed).
echo "Gateway logos:"
gw_n=0
while IFS=$'\t' read -r alias img; do
  [ -n "$alias" ] && [ -f "$GW/$img" ] || continue
  conv "$GW/$img" 260x "$OUT/gateways/$(slug "$alias").webp"
  gw_n=$((gw_n + 1))
done < <(
  sed -n '/INSERT INTO `gateways`/,/;[[:space:]]*$/p' "$SQL" \
    | tr ')' '\n' \
    | sed -nE "s/^ *\([0-9]+, [0-9]+, [0-9]+, '([^']*)', '([^']*)', '([0-9a-f]+\.png)'.*/\1\t\3/p"
)
echo "count: gateways=$gw_n"

# Manual deposit rails (bank / e-wallet logos shown next to the instructions).
echo "Manual payment rails:"
pay_n=0
while IFS= read -r -d '' f; do
  pay_n=$((pay_n + 1))
  conv "$f" 180x "$OUT/payments/$(printf '%02d' "$pay_n").webp"
done < <(find "$PAY" -maxdepth 1 -type f -iname '*.png' -print0 | sort -z)
echo "count: payments=$pay_n"

# ------------------------------------------------------------------ sound fx
# Kept at the source encoding (mp3/wav) — re-encoding lossy audio again only
# loses quality and size.
echo "Sound effects:"
while IFS= read -r -d '' f; do
  n=$(basename "$f")
  cp -f "$f" "public/sfx/$n"
  printf '  %-46s %s\n' "public/sfx/$n" "$(du -h "public/sfx/$n" | cut -f1)"
done < <(find "$AUDIO" -maxdepth 1 -type f -print0 | sort -z)

# Reel/tick stings for the slot cabinet. The dump has no dedicated files for
# these, so they are derived from the reels/click recordings rather than
# synthesised — keeps the casino's own timbre. Derived, not copied, hence git.
# shellcheck disable=SC2086
ffmpeg -hide_banner -loglevel error -y -i public/sfx/spin.mp3 -ss 0.35 -t 0.12 \
  -af "highpass=f=900,volume=1.6" public/sfx/tick.wav
# shellcheck disable=SC2086
ffmpeg -hide_banner -loglevel error -y -i public/sfx/spin.mp3 -ss 0 -t 0.14 \
  -af "highpass=f=500" public/sfx/reel.wav
printf '  %-46s %s\n' "public/sfx/tick.wav (derived)" "$(du -h public/sfx/tick.wav | cut -f1)"
printf '  %-46s %s\n' "public/sfx/reel.wav (derived)" "$(du -h public/sfx/reel.wav | cut -f1)"

echo
echo "total: gfx=$(du -sh "$OUT" | cut -f1) sfx=$(du -sh public/sfx | cut -f1)"