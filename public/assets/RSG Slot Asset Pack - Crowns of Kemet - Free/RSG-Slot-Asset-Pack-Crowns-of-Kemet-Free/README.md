# RSG Slot Asset Pack - Crowns of Kemet - Free

Egyptian-themed 2D slot art pack: background, reel frame, logo, symbols, characters and win pop-ups, with Spine animation data.

**Contents:** 18 PNG  |  1 Spine skeleton  |  1 layered source file

## 1. Package layout

    PNG/                     transparent PNG exports, grouped by asset type
    Spine/                   Spine animation exports (.json + .atlas + .png)
    PSD/                     layered Photoshop source (.psd)
    README.txt               this file
    README.md                this file, markdown
    Third-Party-Notices.txt
    LICENSE.txt

## 2. PNG exports

**Background** (1)
    background.png                     2796x2796

**Reel frames** (2)
    reel_frame_empty.png               2000x1350
    reel_frame_filled.png              2000x1350

**Logo and frames** (2)
    logo_long.png                      2500x700
    logo_short.png                     1696x880

**High symbols (mid-tier)** (8)
    high_ankh.png                      1024x1024
    high_ankh_no_frame.png             1024x1024
    high_eye.png                       1024x1024
    high_eye_no_frame.png              1024x1024
    high_necklace.png                  1024x1024
    high_necklace_no_frame.png         1024x1024
    high_scarab.png                    1024x1024
    high_scarab_no_frame.png           1024x1024

**Wild** (1)
    wild.png                           1024x1024

**Characters** (2)
    anubis.png                         1334x2500
    anubis_frame.png                   1334x2500

**Pop-ups** (2)
    big_win.png                        2393x684
    big_win_decor.png                  1309x1024

All PNGs are 8-bit RGBA with straight (non-premultiplied) alpha. Every symbol - high, low and wild - is exported on a uniform 1024x1024 canvas with the art centred, so symbols can be dropped straight into a reel cell without re-aligning them against each other. Backgrounds, frames, characters, pop-ups and glyphs are exported at their own native size. Nothing is trimmed to its content bounds, so the transparent margin around each asset is preserved.

## 3. Spine animation data

Exported from **Spine Editor** 3.8.99.
Each folder contains a .json skeleton, a .atlas and a single .png atlas page.

    character_anubis       atlas 1413x1540  action (1.67s), idle (2s)

**Runtime is not included.** To play these back you need the spine-unity (or other spine-*) runtime matching Spine 3.8.99, obtained from Esoteric Software. Per the Spine Runtimes License each user must hold their own Spine Editor license. The Unity demo scene in this pack therefore uses static sprites only and has no Spine dependency.

## 4. Photoshop source

    crowns_of_kemet_merged.psd               2796x2796    87 MB

The free source is a **merged** composition - layers are merged per asset rather than fully separated. The paid pack ships the fully layered source with smart objects.

Saved as layered .psd, RGB, 2796x2796. Photoshop CS6 or newer opens these directly.

**Working with the source**

  - Layers and groups are named in English and follow the on-screen structure: background, reel frame, symbol groups, characters, pop-ups and UI. Group names match the PNG export names, so 'high_scarab' in the PSD is high_scarab.png.
  - This is the merged edition: each asset is flattened to a single layer or a small group, so you can move, mask and recolour a whole symbol but cannot separate its individual painted parts. The paid pack ships the fully layered master where every element is a Smart Object.
  - Colour grading is done with adjustment layers collected in the Curves and FX groups. Toggle these off for the raw, ungraded artwork, or retarget them to recolour the set at once rather than repainting each symbol.
  - Text layers are live rather than rasterised. See Third-Party-Notices.txt for the typefaces used and where to download them; rasterising or replacing those layers removes the dependency entirely.

## 5. Unity package

The .unitypackage edition of this pack adds a demo scene:

    Assets/RSG_Crowns_of_Kemet/Scenes/Demo_Crowns_of_Kemet.unity

Minimum Unity version: 2022.3 LTS. Sprites import at 100 pixels per unit with a centered pivot. The scene lays the art out as a slot would appear, plus a showcase area with the remaining pieces. It is a **static art showcase** - there is no reel logic, spin mechanic or gameplay code, and the package contains no scripts and no third-party dependencies.

The Unity edition contains artwork only - no Photoshop source. See section 4.

## 6. What is not in this pack

  - No low symbols, no second character, no Mega / Super Mega Win pop-ups, no UI number glyphs, no fully layered source, no editable Spine projects - those are in the paid pack.
  - No Spine source (.spine) project files - animation data ships as json + atlas + png only.
  - No audio.
  - No game logic or reel engine.

