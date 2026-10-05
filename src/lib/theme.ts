// Deterministic per-game theme: every game gets its own palette, reel art and
// background so no two cabinets look alike and nothing falls back to flat black.

import { FOOD_ART } from "./food-art";

type Theme = {
  // tailwind gradient for card cover / cabinet bg
  cover: string;
  accent: string; // hex color used for glows/borders
  accentText: string;
  /** Dark-to-darker pair that drives the cabinet + reel background. */
  bgA: string;
  bgB: string;
  symbols: string[]; // emoji reel symbols (fallback only)
  scene: string; // big background emoji
  tagline: string;
};

const PACKS: { keys: string[]; t: Theme }[] = [
  {
    keys: ["egypt", "pyramid", "pharaoh", "cleopatra", "sphinx", "desert", "scarab", "anubis", "zeus of", "nile"],
    t: {
      cover: "from-amber-600/80 to-yellow-950", accent: "#f59e0b", accentText: "text-amber-300",
      bgA: "#7c4a0a", bgB: "#140d04",
      symbols: ["🏺", "🐫", "👑", "🦂", "🗝️", "🐍", "💎", "🏜️"], scene: "🐪", tagline: "Ancient Treasures",
    },
  },
  {
    keys: ["ocean", "sea", "fish", "dolphin", "pirate", "treasure", "pearl", "shark", "aqua", "mermaid", "atlantis", "reef"],
    t: {
      cover: "from-cyan-600/80 to-blue-950", accent: "#22d3ee", accentText: "text-cyan-300",
      bgA: "#075985", bgB: "#031425",
      symbols: ["🐙", "🐬", "⚓", "🐚", "🐠", "🦈", "💎", "🦜"], scene: "🌊", tagline: "Deep Blue Riches",
    },
  },
  {
    keys: ["space", "galaxy", "astro", "star", "nova", "cosmic", "planet", "ufo", "moon", "comet"],
    t: {
      cover: "from-violet-600/80 to-indigo-950", accent: "#a78bfa", accentText: "text-violet-300",
      bgA: "#5b21b6", bgB: "#0a0620",
      symbols: ["🪐", "🚀", "👽", "⭐", "☄", "🛸", "🌌", "💎"], scene: "🚀", tagline: "Out of this World",
    },
  },
  {
    keys: ["dragon", "fire", "flame", "phoenix", "burning", "inferno", "volcano", "lava", "dragons"],
    t: {
      cover: "from-red-600/80 to-rose-950", accent: "#f87171", accentText: "text-red-300",
      bgA: "#991b1b", bgB: "#24060a",
      symbols: ["🐉", "🔥", "🌋", "🗡️", "🛡️", "💎", "🦅", "⚡"], scene: "🔥", tagline: "Fury of the Dragons",
    },
  },
  {
    keys: ["magic", "wizard", "witch", "spell", "potion", "sorcerer", "mystic", "enchant", "arcana", "tarot"],
    t: {
      cover: "from-purple-600/80 to-fuchsia-950", accent: "#c084fc", accentText: "text-purple-300",
      bgA: "#6b21a8", bgB: "#16062e",
      symbols: ["🧙", "🔮", "✨", "🪄", "🎩", "🦉", "🃏", "⭐"], scene: "🔮", tagline: "Arcane Fortunes",
    },
  },
  {
    keys: ["wild", "west", "cowboy", "gold rush", "outlaw", "saloon", "range", "sheriff"],
    t: {
      cover: "from-orange-700/80 to-amber-950", accent: "#fb923c", accentText: "text-orange-300",
      bgA: "#9a3412", bgB: "#221005",
      symbols: ["🤠", "🌵", "🐎", "🔫", "💰", "🐂", "⭐", "🃏"], scene: "🤠", tagline: "Frontier Gold",
    },
  },
  {
    keys: ["fruit", "juicy", "sweet", "candy", "sugar", "berry", "cherry", "lemon", "watermelon", "fruity", "hot shots"],
    t: {
      cover: "from-pink-500/80 to-rose-950", accent: "#f472b6", accentText: "text-pink-300",
      bgA: "#be185d", bgB: "#2c0419",
      symbols: ["🍒", "🍋", "🍉", "🍇", "🍊", "🍓", "7️⃣", "💎"], scene: "🍒", tagline: "Juicy Wins",
    },
  },
  {
    keys: ["jungle", "safari", "african", "simba", "lion", "tiger", "animal", "wild cat", "elephant", "monkey", "ape"],
    t: {
      cover: "from-emerald-600/80 to-green-950", accent: "#34d399", accentText: "text-emerald-300",
      bgA: "#047857", bgB: "#03211a",
      symbols: ["🦁", "🐯", "🐘", "🐵", "🐍", "🌿", "💎", "🐒"], scene: "🦁", tagline: "Call of the Wild",
    },
  },
  {
    // Ahead of the older "greek" pack below: the Zeus pack's art is gold on
    // storm-blue, so a sky accent washed it out.
    keys: ["zeus", "olympus", "greek", "poseidon", "athena", "pegasus", "trident", "parthenon"],
    t: {
      cover: "from-amber-500/80 to-indigo-950", accent: "#fbbf24", accentText: "text-amber-200",
      bgA: "#1e3a8a", bgB: "#070b18",
      symbols: ["⚡", "🏛️", "🛡️", "🔱", "🦅", "🍇", "💎", "🗝️"], scene: "⚡", tagline: "Gifts of the Gods",
    },
  },
  {
    keys: ["viking", "nordic", "valhalla", "ragnarok", "ragnar", "seax", "mjolnir",
      "thor", "fenrir", "jormungandr", "asgard", "jotun", "rune", "fjord", "clan",
      "longhouse", "berserk", "mead"],
    t: {
      // Palette lifted straight out of the gptViking textures: mossy pine,
      // weathered iron, snow and granite (see scripts/optimize-assets.sh).
      cover: "from-emerald-800/80 to-slate-950", accent: "#6ee7b7", accentText: "text-emerald-200",
      bgA: "#1f3d34", bgB: "#070d0f",
      symbols: ["🪓", "🛡️", "⚔️", "🪵", "🐻", "🦅", "💎", "🧭"], scene: "🪓", tagline: "Sons of the North",
    },
  },
  {
    keys: ["greek", "olympus", "athena", "gods", "hero", "troy", "medusa", "myth"],
    t: {
      cover: "from-sky-500/80 to-slate-900", accent: "#7dd3fc", accentText: "text-sky-200",
      bgA: "#0369a1", bgB: "#05182b",
      symbols: ["⚡", "🏛️", "🦅", "🛡️", "🔱", "🦁", "💎", "🍇"], scene: "🏛️", tagline: "Gifts of the Gods",
    },
  },
  {
    keys: ["luck", "irish", "clover", "leprechaun", "pot of gold", "rainbow", "emerald", "lucky"],
    t: {
      cover: "from-green-500/80 to-emerald-950", accent: "#4ade80", accentText: "text-green-300",
      bgA: "#15803d", bgB: "#031f14",
      symbols: ["🍀", "🌈", "🪙", "🎩", "☘️", "🦄", "💎", "🍻"], scene: "🍀", tagline: "Luck Be With You",
    },
  },
  {
    keys: ["horror", "vampire", "zombie", "ghost", "halloween", "dracula", "dark", "curse", "bones", "grave"],
    t: {
      cover: "from-slate-700/80 to-black", accent: "#94a3b8", accentText: "text-slate-300",
      bgA: "#1e293b", bgB: "#05070c",
      symbols: ["🦇", "💀", "👻", "🧛", "🕷️", "🎃", "⚰️", "🩸"], scene: "🦇", tagline: "Spin the Curse",
    },
  },
  {
    keys: ["christmas", "santa", "holiday", "winter", "snow", "xmas", "rudolph", "elf"],
    t: {
      cover: "from-red-500/80 to-emerald-950", accent: "#f87171", accentText: "text-red-200",
      bgA: "#991b1b", bgB: "#04231a",
      symbols: ["🎅", "🎄", "🔔", "🦌", "❄️", "🎁", "⭐", "⛄"], scene: "🎄", tagline: "Holiday Riches",
    },
  },
  {
    keys: ["egyptian", "jewel", "gem", "diamond", "crystal", "ruby", "sapphire", "gems", "jewels", "wealth", "gold", "coin", "fortune"],
    t: {
      cover: "from-blue-600/80 to-slate-950", accent: "#60a5fa", accentText: "text-blue-300",
      bgA: "#1d4ed8", bgB: "#060d21",
      symbols: ["💎", "👑", "💰", "🪙", "🔔", "⭐", "🗝️", "💰"], scene: "💎", tagline: "Gems & Gold",
    },
  },
  {
    keys: ["pixel", "8bit", "8-bit", "retro", "arcade", "coin", "retro"],
    t: {
      cover: "from-teal-500/80 to-slate-900", accent: "#2dd4bf", accentText: "text-teal-300",
      bgA: "#0f766e", bgB: "#04161a",
      symbols: ["👾", "🕹️", "💾", "🧃", "🍕", "⭐", "💣", "🪙"], scene: "🕹️", tagline: "Pixel Arcade",
    },
  },
];

const FALLBACK: Theme[] = [
  { cover: "from-blue-700/80 to-slate-950", accent: "#38bdf8", accentText: "text-sky-300",
    bgA: "#1d4ed8", bgB: "#050b1c",
    symbols: ["🍒", "⭐", "💎", "🔔", "7️⃣", "🍇", "🎰", "🍀"], scene: "🎰", tagline: "Classic Casino" },
  { cover: "from-fuchsia-700/80 to-slate-950", accent: "#e879f9", accentText: "text-fuchsia-300",
    bgA: "#a21caf", bgB: "#1a0524",
    symbols: ["⭐", "💎", "👑", "🎰", "💰", "🍀", "🔔", "🍒"], scene: "⭐", tagline: "High Roller" },
  { cover: "from-amber-600/80 to-slate-950", accent: "#fbbf24", accentText: "text-amber-300",
    bgA: "#b45309", bgB: "#1f1204",
    symbols: ["💎", "🪙", "💰", "🔔", "⭐", "🃏", "🍒", "🍀"], scene: "🪙", tagline: "Champion Vault" },
];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function themeFor(alias: string): Theme {
  const name = alias.toLowerCase();
  for (const p of PACKS) {
    if (p.keys.some((k) => name.includes(k))) return p.t;
  }
  return FALLBACK[hash(alias) % FALLBACK.length];
}

/* ------------------------------------------------------------------ *
 * Reel art packs (all exported to /public/gfx by scripts/optimize-assets.sh)
 * ------------------------------------------------------------------ */

const CLASSIC = "/gfx/classic";
const KEMET = "/gfx";
const FRUITS2 = "/gfx/fruits2";
const PIXELFOOD = "/gfx/pixelfood";
const FANTASY = "/gfx/fantasy";
const LUX = "/gfx/lux";
const BTN = "/gfx/btn";
const MULT = "/gfx/mult";
const BADGE = "/gfx/badge";
// The raw packs live in assets/ at the repo root (gitignored, and outside
// public/ so Next.js never serves them); these are the WebP outputs
// scripts/optimize-assets.sh derives them into.
const ZEUS = "/gfx/zeus";
const EGYPT = "/gfx/egypt";
const VIKING = "/gfx/viking";
// The bundled African Buffalo pack, derived the same way.
const BUF = "/gfx/buffalo";

export type PackKind =
  | "kemet" | "classic" | "fruits2" | "pixelfood" | "fantasy" | "lux"
  | "zeus" | "egypt" | "viking" | "buffalo";

export type ButtonSet = {
  spin: string;
  auto: string;
  keep: string;
  minus: string;
  plus: string;
  menu: string;
};

export type AssetPack = {
  kind: PackKind;
  images: string[];
  /** Index in `images` that is the wild symbol, when known. */
  wildIndex?: number;
  /** Tile art placed behind each reel symbol (kemet pack). */
  cellFrame?: string;
  /** Frame art for the reel window backdrop (kemet pack). */
  emptyFrame?: string;
  /** Real cabinet backdrop art, used instead of a flat colour. */
  bg?: string;
  logo?: string;
  logoShort?: string;
  bigwin?: string;
  bigwinDecor?: string;
  character?: string;
  characterFramed?: string;
  /**
   * The art a lobby card may cover itself with, in no particular order.
   *
   * A card used to pick `images[hash]`, which is how a Zeus game ended up
   * wearing a blue gem and half the gold games a bare "J" — a reel symbol is
   * chosen to read as *a value on a paytable*, not as *an identity*. Each pack
   * therefore nominates what is worth showing: a pack with one true figure lists
   * only that (both savannah games show the buffalo, every Zeus game shows
   * Zeus), while a pack with a shelf of good art lists several so neighbouring
   * cards still differ. Omitted means "any reel symbol will do", which is
   * correct for packs whose whole set is already objects rather than letters.
   */
  covers?: string[];
  /** Framed symbol tiles, index-aligned with `images`, shown on winning cells. */
  gemTiles?: string[];
  /**
   * Multiplier tiles shipped by the pack, keyed by factor. Drawn *inside* a reel
   * cell when the engine reports that line was multiplied — never as ordinary
   * reel art, and never for a factor the pack did not ship.
   */
  multTiles?: Partial<Record<TileFactor, string>>;
  /** Pixel-art packs get a subtle grid overlay on the reel window. */
  pixelGrid?: boolean;
  /** Control plates from the pack itself, when it ships them. */
  buttons?: ButtonSet;
};

const KEMET_GEM = ["ankh-gem", "eye-gem", "necklace-gem", "scarab-gem", "wild"];
const KEMET_IMAGES = [
  `${KEMET}/sym/ankh.webp`,
  `${KEMET}/sym/eye.webp`,
  `${KEMET}/sym/necklace.webp`,
  `${KEMET}/sym/scarab.webp`,
  `${KEMET}/sym/wild.webp`,
];

const CLASSIC_IMAGES = [
  "apple", "bar", "bell", "cherry", "clover", "coin", "diamond", "die",
  "grapefruit", "heart", "horseshoe", "lemon", "orange", "plum", "seven", "watermelon",
].map((n) => `${CLASSIC}/${n}.webp`);

// "Fruits Asset 2" — outlined 16x16 pixel fruit, nearest-neighbour upscaled.
const FRUITS2_IMAGES = Array.from(
  { length: 13 },
  (_, i) => `${FRUITS2}/sym-${String(i + 1).padStart(2, "0")}.webp`,
);

// "Free Pixel Art Foods" — 16 fruit icons.
const PIXELFOOD_IMAGES = [
  "fruit_apple", "fruit_apple-slice", "fruit_banana", "fruit_blueberry",
  "fruit_cherry", "fruit_grape_red", "fruit_greengrape", "fruit_kiwi",
  "fruit_lemon", "fruit_lime", "fruit_orange", "fruit_orange_slice",
  "fruit_peach", "fruit_strawberry", "fruit_watermelon", "fruit_watermelon_slice",
].map((n) => `${PIXELFOOD}/${n}.webp`);

// "Pixel Fantasy Slot Machine" — 4 symbols + cabinet art.
const FANTASY_IMAGES = [1, 2, 3, 4].map((i) => `${FANTASY}/symbol-${i}.webp`);

// Hand-named classic pack: 28 high-res symbols, `jocker` last (the wild).
const LUX_NAMES = [
  "a2", "k", "q", "j", "7", "72", "bar", "barborder", "bell", "crown", "coin",
  "dollarcollection", "omega", "a3dots", "diamond", "ruby", "blue-ruby",
  "green-ruby", "yellow-ruby", "reddiamond", "clover", "redberry", "violetmango",
  "grape", "orange", "lime", "watermelon", "jocker",
];
const LUX_IMAGES = LUX_NAMES.map((n) => `${LUX}/${n}.webp`);
/**
 * What this shelf is worth showing on a card: everything but the card ranks
 * (`a2`, `k`, `q`, `j`), the bare Greek letters (`omega`, `a3dots`) and
 * `barborder`, an empty decorated frame. Those render as a paytable rather than
 * as a game — a lobby of gold cards each wearing a lone "J" reads like a rules
 * page. Shared with the viking pack, whose reel symbols are these same files.
 */
const LUX_COVERS = LUX_NAMES.filter(
  (n) => !["a2", "k", "q", "j", "omega", "a3dots", "barborder"].includes(n),
).map((n) => `${LUX}/${n}.webp`);
/**
 * The viking pack borrows the gold pack's symbols but not its whole shelf: in
 * front of a snowbound panorama a Norse game should wear a treasure or a trinket
 * — a crown, a gem, a bell — not a grape, a BAR or a stray "7".
 */
const VIKING_COVERS = LUX_COVERS.filter(
  (u) =>
    !["bar", "7", "72", "grape", "orange", "lime", "watermelon", "redberry", "violetmango"].some(
      (n) => u.endsWith(`/${n}.webp`),
    ),
);
const LUX_WILD = LUX_NAMES.indexOf("jocker");

// Button plates from the raw buttons drop: square-ish art is compact
// (used for the -/+ and icon controls), wide art is used for the big actions.
const BTN_ROUND = [1, 2, 3].map((i) => `${BTN}/round-${String(i).padStart(2, "0")}.webp`);
const BTN_WIDE = [1, 2, 3, 4, 5, 6].map((i) => `${BTN}/wide-${String(i).padStart(2, "0")}.webp`);

/**
 * Factors an in-reel multiplier tile can be drawn for.
 *
 * `slot.DropMultiplier` in the engine lands ×2, ×3 or ×5 on a multiplied spin,
 * and a paytable may already carry ×10, so all four need art. Nothing here is
 * chosen by the player: the engine decides the factor and the tile is the
 * display of that decision.
 */
export const TILE_FACTORS = [2, 3, 5, 10] as const;
export type TileFactor = (typeof TILE_FACTORS)[number];

// Shared plates, used only when the pack itself did not ship the factor — the
// pack's own tile always wins (see `multTile`). The two ×10 plates alternate by
// game so the same factor still looks different across the lobby.
const MULT_ART: Record<TileFactor, string[]> = {
  2: [`${MULT}/2x.webp`],
  // Drawn to match the rest of the set: `assets/times/` has no ×3 source, and
  // the engine lands ×3 about as often as ×2, so a typographic fallback would
  // show more often than not.
  3: [`${MULT}/3x.webp`],
  5: [`${MULT}/5x.webp`],
  10: [`${MULT}/10x.webp`, `${MULT}/10x2.webp`],
};

export function multArt(m: number, alias = ""): string | undefined {
  const set = MULT_ART[m as TileFactor];
  return set ? set[hash(alias) % set.length] : undefined;
}

/**
 * Art for a ×N tile drawn inside a reel cell.
 *
 * The pack's own tile wins, so a game wears its own symbols; the shared
 * `/gfx/mult` plates are the fallback for a factor the pack did not ship (×10
 * on the buffalo pack, ×3 on everything except zeus). `undefined` means no art
 * exists at all, and the caller falls back to a typographic `×N` rather than
 * dropping the multiplier the engine paid for.
 */
export function multTile(m: number, alias = ""): string | undefined {
  const own = assetFor(alias).multTiles?.[m as TileFactor];
  return own ?? multArt(m, alias);
}

/** Feature marks for the paytable and win banners, with per-game variants. */
const BADGE_ART = {
  wild: [`${BADGE}/wild.webp`, `${BADGE}/wild2.webp`, `${BADGE}/wild3.webp`],
  scatter: [`${BADGE}/scatter.webp`, `${BADGE}/scatter2.webp`],
  jackpot: [`${BADGE}/jackpot.webp`, `${BADGE}/jackpot2.webp`],
  bonus: [`${BADGE}/bonus.webp`],
  bigwin: [`${BADGE}/big-win.webp`],
} as const;

export type BadgeKind = keyof typeof BADGE_ART;

/** Deterministic badge art so each game gets its own style of each mark. */
export function badgeFor(kind: BadgeKind, alias: string): string {
  const set: readonly string[] = BADGE_ART[kind];
  return set[hash(alias) % set.length];
}

const KEMET_PACK: AssetPack = {
  kind: "kemet",
  images: KEMET_IMAGES,
  wildIndex: 4,
  cellFrame: `${KEMET}/frame.webp`,
  /** Empty-cell frame art shown behind the reel window (kemet only). */
  emptyFrame: `${KEMET}/frame-empty.webp`,
  bg: `${KEMET}/bg.webp`,
  logo: `${KEMET}/logo.webp`,
  logoShort: `${KEMET}/logo-short.webp`,
  bigwin: `${KEMET}/bigwin.webp`,
  bigwinDecor: `${KEMET}/bigwin-decor.webp`,
  character: `${KEMET}/anubis.webp`,
  /** The same mascot inside its decorative frame, shown on the cabinet. */
  characterFramed: `${KEMET}/anubis-frame.webp`,
  /** Framed symbol tiles used when a line wins (same index as `images`). */
  gemTiles: KEMET_IMAGES.map((_, i) => `${KEMET}/sym/${KEMET_GEM[i]}.webp`),
};

/** Composed backglass for each of these — see scripts/make-banners.sh. */
const CLASSIC_PACK: AssetPack = { kind: "classic", images: CLASSIC_IMAGES, bg: `${CLASSIC}/bg.webp` };
const FRUITS2_PACK: AssetPack = {
  kind: "fruits2", images: FRUITS2_IMAGES, pixelGrid: true, bg: `${FRUITS2}/bg.webp`,
};
const PIXELFOOD_PACK: AssetPack = {
  kind: "pixelfood", images: PIXELFOOD_IMAGES, pixelGrid: true, bg: `${PIXELFOOD}/bg.webp`,
};
// Cabinet art is picked by column count in sceneFor(): machine-1 frames 3 reels,
// machine-4 frames 4. Only used as a dimmed backdrop, never as a strict frame.
const FANTASY_PACK: AssetPack = {
  kind: "fantasy", images: FANTASY_IMAGES, pixelGrid: true,
};
const LUX_PACK: AssetPack = {
  kind: "lux", images: LUX_IMAGES, wildIndex: LUX_WILD, covers: LUX_COVERS,
  bg: `${LUX}/bg.webp`,
};

/* ------------------------------------------------- zeus (slot complete pack) */

// 28 symbols, ordered low-to-high the way a paytable reads: card ranks, then
// gems and coins, then the Greek regalia, then the multiplier/feature marks, the
// wild and the hero portrait. The order only matters for how the eye reads a
// stopped reel; the engine indexes symbols by number, and `Player` wraps the
// index with `%`, so a pack only has to be long enough to look varied.
const ZEUS_NAMES = [
  "symbol_K", "symbol_Q", "symbol_J", "symbol_A",
  "blue_gem", "red_gem", "purple_gem",
  "silver_coin", "gold_coin",
  "greek_vase", "golden_chalice", "golden_lyre",
  "laurel_wreath", "greek_helmet",
  "trident", "sun_medallion", "storm_orb",
  "pegasus",
  // Held back like the buffalo pack's: the four `multiplier_x*` tiles are reel
  // art only when the engine reports a multiplied line, so a symbol index can
  // never stop on a "×3" and advertise a multiplier the spin never paid for.
  "bonus_star", "free_spins_badge", "lightning_scatter",
  "jackpot_crown",
  "olympus_temple_wild",
  "zeus_portrait",
];
// The pack's hero. Used both as the cabinet's mascot and — via `covers` — as the
// only art a Zeus game's lobby card will show, so these games are recognisable
// in the grid rather than by whichever of the 28 symbols the hash landed on.
const ZEUS_PORTRAIT = `${ZEUS}/sym/zeus_portrait.webp`;
const ZEUS_IMAGES = ZEUS_NAMES.map((n) => `${ZEUS}/sym/${n}.webp`);
const ZEUS_WILD = ZEUS_NAMES.indexOf("olympus_temple_wild");

// Three painted scenes ship with the pack; games rotate over them.
const ZEUS_SCENES = ["olympus_sunrise", "lightning_storm", "cloud_temple"].map(
  (n) => `${ZEUS}/bg/${n}.webp`
);

// The pack ships a full control set; `stop` doubles as the turbo/cancel plate.
const ZEUS_BUTTONS: ButtonSet = {
  spin: `${ZEUS}/btn/spin.webp`,
  auto: `${ZEUS}/btn/auto.webp`,
  keep: `${ZEUS}/btn/stop.webp`,
  minus: `${ZEUS}/btn/bet_minus.webp`,
  plus: `${ZEUS}/btn/bet_plus.webp`,
  menu: `${ZEUS}/btn/menu.webp`,
};

const ZEUS_PACK: AssetPack = {
  kind: "zeus",
  images: ZEUS_IMAGES,
  wildIndex: ZEUS_WILD,
  /** The pack's own reel-window frame, drawn behind the reels. */
  emptyFrame: `${ZEUS}/ui/reel_frame.webp`,
  bg: ZEUS_SCENES[0],
  bigwin: `${ZEUS}/feat/mega_win.webp`,
  bigwinDecor: `${ZEUS}/feat/big_win.webp`,
  character: ZEUS_PORTRAIT,
  /** One card for every Zeus game: the portrait, not a gem the hash picked. */
  covers: [ZEUS_PORTRAIT],
  buttons: ZEUS_BUTTONS,
  /**
   * The pack's ×2/×3/×5/×10 tiles — reached the long way round.
   *
   * The four source files are each labelled one slot out of true:
   * `multiplier_x2` holds the "10", `multiplier_x3` the "2", `multiplier_x5`
   * the "3" and `multiplier_x10` the "5" (verified by eye against the raw PNGs
   * in `assets/zeus_slot_complete_asset_pack/symbols/`). Mapping them by name
   * would paint a ×10 badge on a spin the engine multiplied by two — the one
   * number on screen a player can check the payout against. The raw pack is
   * vendor art this project never edits, so the correction lives here.
   */
  multTiles: {
    2: `${ZEUS}/sym/multiplier_x3.webp`,
    3: `${ZEUS}/sym/multiplier_x5.webp`,
    5: `${ZEUS}/sym/multiplier_x10.webp`,
    10: `${ZEUS}/sym/multiplier_x2.webp`,
  },
};

/* ------------------------------------------------------ egypt (7 emblems) */

// Only seven emblems in the drop — ankh ×3 in three metals, scarab ×2, khopesh,
// udjat — so they are ordered by value and cycle (`Player` wraps the symbol index
// with `%`, so a short set is safe). A seven-symbol reel reads as a deliberate
// emblem game rather than a broken pack.
//
// There is no `bg`: the drop shipped no scene, so these games keep the themed
// cabinet treatment instead of a backdrop. The emblems carry the theme themselves.
const EGYPT_NAMES = [
  "udjat", "redankh", "blueankh", "turquoiseankh", "scarab", "goldscarab", "khopesh",
];
const EGYPT_IMAGES = EGYPT_NAMES.map((n) => `${EGYPT}/${n}.webp`);

const EGYPT_PACK: AssetPack = {
  kind: "egypt",
  images: EGYPT_IMAGES,
  /** Composed backglass — see scripts/make-banners.sh. */
  bg: `${EGYPT}/bg.webp`,
  character: `${EGYPT}/goldscarab.webp`,
};

/* ------------------------------------------------------------ buffalo -- */

// The bundled African Buffalo pack: 28 savannah symbols (25 usable as reel art —
// the three `multiplier_x*` tiles are held back below and drawn only when the
// engine reports a multiplied line, so an ordinary symbol index can never land
// on a "×3" and fake a multiplier the spin never paid for).
//
// Ordered like a paytable reads: card ranks, then the tiers of the savannah,
// then the premiums and feature marks, the wild last. `Player` wraps the engine's
// symbol index with `%`, so the order only decides what a stopped reel looks
// like — it never decides what a game pays.
const BUF_NAMES = [
  "symbol_10", "buffalo_J", "buffalo_Q", "buffalo_K", "buffalo_A",
  "zebra", "giraffe", "crocodile", "eagle", "rhino", "elephant", "lion",
  "gold_coin", "ruby", "compass", "tribal_mask", "sun_idol", "savannah_tree",
  "treasure_chest", "bonus_chest", "free_spins", "scatter_sunset",
  "wild_buffalo", "buffalo_portrait", "buffalo_full",
];
const BUF_IMAGES = BUF_NAMES.map((n) => `${BUF}/sym/${n}.webp`);
const BUF_WILD = BUF_NAMES.indexOf("wild_buffalo");

// Three painted scenes ship with the pack: sunset, storm and the dust-and-
// lightning overlay plate. The overlay is a transparent fx layer rather than a
// scene, so only the two real ones rotate as backdrops.
const BUF_SCENES = ["savannah_sunset", "storm_savannah"].map(
  (n) => `${BUF}/bg/${n}.webp`,
);

/** The savannah's head of herd: a buffalo in an ornate gold medallion. */
const BUF_PORTRAIT = `${BUF}/sym/buffalo_portrait.webp`;

const BUF_PACK: AssetPack = {
  kind: "buffalo",
  images: BUF_IMAGES,
  wildIndex: BUF_WILD,
  /** The pack's own wooden frame — felt and divider bars are painted into it. */
  emptyFrame: `${BUF}/ui/reel_frame.webp`,
  bg: BUF_SCENES[0],
  bigwin: `${BUF}/ui/big_win_banner.webp`,
  bigwinDecor: `${BUF}/ui/mega_win_banner.webp`,
  character: BUF_PORTRAIT,
  /** One card for every savannah game: the buffalo, never a zebra or a ruby. */
  covers: [BUF_PORTRAIT],
  /** The pack's ×2/×3/×5 tiles. ×10 falls through to the shared `/gfx/mult`. */
  multTiles: {
    2: `${BUF}/sym/multiplier_x2.webp`,
    3: `${BUF}/sym/multiplier_x3.webp`,
    5: `${BUF}/sym/multiplier_x5.webp`,
  },
};

/* -------------------------------------------------------------- viking */
// gptViking shipped 38 low-poly models but only their diffuse textures, and a UV
// atlas is unusable as reel art (every one measures 56-64 distinct colours after
// quantising to 64 — i.e. pure noise). What they *do* carry is material and
// palette: moss, wet pine, snow, granite, iron. scripts/optimize-assets.sh
// dissolves eight of them into one nordic panorama, so the pack is that backdrop
// plus the high-res LUX symbols, which read cleanly against it.
//
// No `character`: the drop has no figure that survives being cropped to a 40px
// avatar, so these games take the cabinet's crown fallback rather than borrow a
// mark from an unrelated pack. (An earlier pass pointed it at the egypt khopesh,
// which put an Egyptian dagger in the header of a Norse game.)
const VIKING_PACK: AssetPack = {
  kind: "viking",
  images: LUX_IMAGES,
  wildIndex: LUX_WILD,
  /** Same shelf as the gold pack, minus the fruit and the BAR. */
  covers: VIKING_COVERS,
  bg: `${VIKING}/bg.webp`,
};

// Checked before KEMET_KEYWORDS: the gptEgypt emblems are better art for a game
// named outright after Egypt or a pharaoh, while anubis/pyramid/sphinx/mummy
// stay on the richer RSG kemet pack (5 symbols but with framed gems, a cabinet,
// a logo and a mascot behind them).
// "of ra" is a phrase rather than the two letters on purpose: bare "ra" matches
// most anything (Brilliants, Parade, Amazons), whereas Book of Ra, Dynasty of Ra
// and Gate of Ra are Egyptian by name and are the titles actually in the
// catalogue. Ramses and Horus likewise only ever name Egyptian rulers.
const EGYPT_KEYWORDS = [
  "egypt", "pharaoh", "cleopatra", "scarab", "ankh", "khopesh", "udjat",
  "ramses", "horus", "nefertiti", "osiris", "of ra", "book of set",
];
// Checked first: "African Simba" and friends are savannah games and nothing in
// the other keyword lists claims those words, so ordering here is about reading
// top-down rather than about collisions.
//
// Deliberately narrow. The pack is lion/elephant/rhino/zebra/giraffe art on a
// savannah, and this list sits *first*, so every word added here steals a game
// from every list below it — "panther" or "jaguar" would look right and quietly
// claim jungle and moonlit games the art cannot carry. Only names that are
// unambiguously African wildlife are listed; "Big Five" is the safari term.
const BUFFALO_KEYWORDS = [
  "buffalo", "savannah", "safari", "african", "rhino", "giraffe", "zebra",
  "big five", "simba",
];

/**
 * Does this game wear the African Buffalo pack?
 *
 * Also the fallback for which game the lobby promotes, via `trendingIndex`.
 */
export function isBuffaloGame(alias: string): boolean {
  const n = alias.toLowerCase();
  return BUFFALO_KEYWORDS.some((k) => n.includes(k));
}

/**
 * The lobby's promoted title, pinned by alias rather than derived.
 *
 * "The first savannah game" would be whatever the engine's catalogue order
 * happens to put first, which means every keyword added to `BUFFALO_KEYWORDS`
 * is a chance to silently move the badge — adding "big five" would hand it to
 * AGT/Big Five purely because that sorts ahead of Novomatic. Pinning keeps the
 * badge on the game it was chosen for; `trendingIndex` falls back to a savannah
 * title so the badge survives the engine dropping the pinned one.
 */
export const TRENDING_ALIAS = "Novomatic/African Simba";

/**
 * Where in `keys` the promoted game sits, or -1 when the catalogue holds
 * neither it nor any savannah title.
 *
 * Returns an index rather than an alias so callers can splice a row without
 * caring which title it turned out to be — and so the lobby and the home page's
 * TRENDING NOW strip cannot pick differently.
 */
export function trendingIndex(keys: string[]): number {
  const pinned = keys.indexOf(TRENDING_ALIAS);
  return pinned >= 0 ? pinned : keys.findIndex((k) => isBuffaloGame(k));
}

const ZEUS_KEYWORDS = [
  "zeus", "olymp", "greek", "poseidon", "athena", "hera", "hercules", "apollo",
  "ares", "artemis", "hades", "perseus", "odyssey", "minotaur", "troy", "trojan",
  "parthenon", "sparta", "myth", "pegasus", "trident",
  // Greek by name, not by association: Pandora's Box is the one in the list.
  "pandora", "medusa", "gorgon", "delphi", "oracle",
];
const VIKING_KEYWORDS = [
  "viking", "nordic", "valhalla", "ragnarok", "ragnar", "seax", "mjolnir",
  "thor", "fenrir", "jormungandr", "asgard", "jotun", "rune", "fjord", "clan",
  "longhouse", "berserk", "mead",
  // Valkyrie and Trolls were in the catalogue under names no other list claimed,
  // so both used to fall through to the generic rotation.
  "valkyrie", "troll", "saga", "skald",
];
const KEMET_KEYWORDS = ["pyramid", "anubis", "kemet", "sphinx", "mummy", "tomb", "nile"];
const FANTASY_KEYWORDS = ["pixel", "8bit", "8-bit", "retro", "arcade", "fantasy"];
const LUX_KEYWORDS = [
  "lucky", "luxur", "deluxe", "mega", "jackpot", "diamond", "crown", "royal",
  "gold", "coin", "reel", "bar", "bell", "cherry", "clover", "horseshoe",
  // The only pack with a joker plate (`jocker.webp`), so joker games belong here
  // rather than wherever the rotation happened to drop them.
  "joker",
];
const FRUIT_KEYWORDS = [
  "fruit", "fruits", "juice", "juicy", "cherry", "lemon", "melon", "berry", "grape",
  "peach", "plum", "apple", "orange", "banana", "straw", "kiwi", "lime", "candy", "sweet", "sugar",
];

/**
 * The fruit-machine pack, for titles that name the *style* rather than a fruit.
 *
 * Checked last of the keyword lists, immediately before the rotation, so it only
 * ever claims a game nothing else wanted — every one of these was previously
 * falling through to the hash. It is a long way down on purpose: a hot/sevens
 * game that also happens to say "gold" or "cherry" reads better on the richer
 * LUX art, and a fruit title still reaches FRUIT first.
 */
const CLASSIC_KEYWORDS = [
  "hot", "seven", "dice", "forties", "eighties", "sixties", "seventies",
  "groovy", "funky",
];

/**
 * Picks the reel art for a game: keyword match first, otherwise a deterministic
 * rotation across the packs so the lobby never looks repetitive.
 */
export function assetFor(alias: string): AssetPack {
  const n = alias.toLowerCase();
  if (isBuffaloGame(alias)) {
    return { ...BUF_PACK, bg: BUF_SCENES[hash(alias) % BUF_SCENES.length] };
  }
  if (ZEUS_KEYWORDS.some((k) => n.includes(k))) {
    return { ...ZEUS_PACK, bg: ZEUS_SCENES[hash(alias) % ZEUS_SCENES.length] };
  }
  if (VIKING_KEYWORDS.some((k) => n.includes(k))) return VIKING_PACK;
  if (EGYPT_KEYWORDS.some((k) => n.includes(k))) return EGYPT_PACK;
  if (KEMET_KEYWORDS.some((k) => n.includes(k))) return KEMET_PACK;
  if (LUX_KEYWORDS.some((k) => n.includes(k))) return LUX_PACK;
  if (FANTASY_KEYWORDS.some((k) => n.includes(k))) return FANTASY_PACK;
  if (FRUIT_KEYWORDS.some((k) => n.includes(k))) {
    return hash(alias) % 2 === 0 ? FRUITS2_PACK : PIXELFOOD_PACK;
  }
  if (CLASSIC_KEYWORDS.some((k) => n.includes(k))) return CLASSIC_PACK;
  // Rotate the remaining packs by name hash for variety.
  const rotation = [CLASSIC_PACK, FRUITS2_PACK, PIXELFOOD_PACK, FANTASY_PACK, LUX_PACK];
  return rotation[hash(alias) % rotation.length];
}

/**
 * Deterministic plate art: a game keeps the same button look, games differ.
 *
 * Packs that ship their own control set (the Zeus pack does) win over the shared
 * `/gfx/btn` plates, so a Zeus game is styled end to end rather than wearing
 * generic buttons on top of its own symbols.
 */
export function buttonsFor(alias: string): ButtonSet {
  const own = assetFor(alias).buttons;
  if (own) return own;
  const h = hash(alias);
  const wide = (salt: number) => BTN_WIDE[(h + salt) % BTN_WIDE.length];
  const round = (salt: number) => BTN_ROUND[(h + salt) % BTN_ROUND.length];
  return {
    spin: wide(0),
    auto: wide(1),
    keep: wide(2),
    minus: round(0),
    plus: round(1),
    menu: round(2),
  };
}

/* ------------------------------------------------------------------ *
 * Backgrounds + effects
 * ------------------------------------------------------------------ */

export type SceneStyle =
  /** Golden Luxury / VIP Lounge — gold + obsidian, art deco, warm spotlights. */
  | "vip"
  /** Vibrant Fantasy — volcanic abyss, embers, hot rim light. */
  | "volcano"
  /** The game's own theme palette, brightened. */
  | "theme";

export type SceneProp = {
  src: string;
  /** Position in the cabinet, in percent. */
  x: number;
  y: number;
  /** Width in CSS pixels. */
  size: number;
  /** Tilt in degrees. */
  tilt: number;
  /** Seconds of phase offset for the GSAP float. */
  delay: number;
};

export type Scene = {
  style: SceneStyle;
  /** Real backdrop art when the pack ships one. */
  image?: string;
  /**
   * Full-page background behind the cabinet: the same themed gradient the
   * cabinet wears, so a game with no scene art is still not flat black. When
   * `image` is set this is deliberately just the gradient — the page paints the
   * art itself as a full-bleed `<img>` on top of it, and duplicating the URL
   * into a CSS layer would make the browser fetch a file it already has.
   */
  backdrop: string;
  cabinet: string;
  /** Reel-window background (CSS) — never flat black. */
  felt: string;
  /** Ambient halo colour behind the machine. */
  halo: string;
  /** Two or three drifting blobs for the GSAP aurora effect. */
  aurora: { color: string; size: number; x: number; y: number }[];
  /** Frame/border colour for the machine. */
  rim: string;
  /** Rising ember particles (volcano scenes only). */
  embers: { x: number; y: number; size: number; delay: number }[];
  /** Art-deco filigree overlay (VIP scenes only), as a CSS background. */
  deco?: string;
  /** Art-deco border frame stretched over the whole cabinet (VIP scenes only). */
  decoFrame?: string;
  /** Tile size of the filigree pattern, in CSS pixels. */
  decoSize?: number;
  /** Where the filigree is strongest (CSS mask). */
  decoMask?: string;
  /** Floating backdrop props (Pixel Food games get a food-court wall). */
  props: SceneProp[];
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const VIP_KEYWORDS = [
  "luck", "lucky", "irish", "clover", "leprechaun", "gold", "golden", "coin",
  "coins", "diamond", "jewel", "jewels", "ruby", "sapphire", "emerald", "royal",
  "king", "queen", "crown", "champagne", "vip", "777", "rich", "luxur",
  "fortune", "treasure", "mega", "wealth", "cash", "pot", "gems", "money", "cash",
];

const VOLCANO_KEYWORDS = [
  "fire", "flame", "dragon", "phoenix", "burning", "inferno", "volcano", "lava",
  "magic", "magical", "wizard", "witch", "spell", "potion", "sorcerer", "mystic",
  "arcana", "tarot", "zeus", "olympus", "greek", "myth", "mythic", "hero", "troy",
  "medusa", "quest", "adventure", "titan", "thunder", "storm", "quest", "wild-west",
];

/** Art-deco filigree for the VIP Lounge wall (inline SVG, no extra request). */
const DECO_VIP_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>` +
  `<g fill='none' stroke='#ffe3ab' stroke-opacity='0.34' stroke-width='1.3' stroke-linejoin='round'>` +
  `<path d='M100 4 L124 44 L168 20 L154 72 L196 66 L156 100 L196 134 L154 128 L168 180 L124 156 ` +
  `L100 196 L76 156 L32 180 L46 128 L4 134 L44 100 L4 66 L46 72 L32 20 L76 44 Z'/>` +
  `<circle cx='100' cy='100' r='64'/><circle cx='100' cy='100' r='40'/>` +
  `<path d='M100 74 L112 100 L100 126 L88 100 Z' stroke-opacity='0.5'/>` +
  `</g></svg>`;

/** Single-stretch art-deco frame drawn around the whole cabinet. */
const DECO_FRAME_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000' preserveAspectRatio='none'>` +
  `<g fill='none' stroke='#ffe3ab' stroke-linecap='round'>` +
  `<rect x='18' y='18' width='964' height='964' stroke-opacity='0.40' stroke-width='2.5'/>` +
  `<rect x='30' y='30' width='940' height='940' stroke-opacity='0.22' stroke-width='1.2'/>` +
  `<g stroke-opacity='0.34' stroke-width='2.5'>` +
  `<path d='M18 120 Q120 120 120 18'/><path d='M982 120 Q880 120 880 18'/>` +
  `<path d='M18 880 Q120 880 120 982'/><path d='M982 880 Q880 880 880 982'/>` +
  `<path d='M500 18 L516 34 L500 50 L484 34 Z'/><path d='M500 950 L516 966 L500 982 L484 966 Z'/>` +
  `</g></g></svg>`;

/** Glowing lava veins for the volcanic abyss (inline SVG, no extra request). */
const DECO_VOLCANO_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260' viewBox='0 0 260 260'>` +
  `<g fill='none' stroke='#ff9a3c' stroke-opacity='0.30' stroke-width='1.4' stroke-linecap='round'>` +
  `<path d='M-10 40 L40 62 L74 40 L118 78 L160 52 L204 88 L270 60'/>` +
  `<path d='M20 130 L70 108 L110 140 L156 116 L206 150 L268 122'/>` +
  `<path d='M-10 210 L52 232 L96 198 L150 236 L200 206 L260 240'/>` +
  `<path d='M74 40 L70 108 M160 52 L156 116 M110 140 L96 198 M200 206 L206 150'/>` +
  `</g></svg>`;

/** Percent-encodes an SVG document so the browser accepts it inside url(). */
function svgUrl(svg: string): string {
  return (
    'url("data:image/svg+xml,' +
    svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23").replace(/"/g, "%22") +
    '")'
  );
}

const DECO_VIP = svgUrl(DECO_VIP_SVG);
const DECO_FRAME = svgUrl(DECO_FRAME_SVG);
const DECO_VOLCANO = svgUrl(DECO_VOLCANO_SVG);

/**
 * Stems whose file name is not the word a game title would use.
 * The gold pack ships its jester as `jocker`, so *100 Jokers* would never match.
 */
const COVER_SPELLING: Record<string, string> = { jocker: "joker" };

/** Length the two words must share from the front — "seven"/"Seventies" share five. */
function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const artStem = (u: string): string => u.slice(u.lastIndexOf("/") + 1, u.lastIndexOf(".")).toLowerCase();

/** True when a file stem and a word from a title name the same thing. */
function sameThing(stem: string, word: string): boolean {
  if (stem.length < 4 || word.length < 4) return false;
  return sharedPrefix(stem, word) >= 4 || stem.includes(word) || word.includes(stem);
}

/**
 * The art a lobby card wears for `alias`.
 *
 * The pack nominates what may be shown (`AssetPack.covers`, else every reel
 * symbol), and then the title gets first refusal: a game called *Crown* should
 * show the crown and one called *100 Jokers* the jester, rather than whatever
 * the hash drew — the picture is read before the caption is.
 *
 * Two words count as the same thing if they share four letters from the front or
 * either contains the other whole, and both sides must be at least four letters
 * long. That width is what keeps the rule honest: *Cabaret* cannot claim the
 * slot **bar** (three letters) and *Ice Queen* cannot claim the ice inside
 * `fruit_apple-slice`, both of which a lazier containment test would have
 * accepted.
 *
 * A word must also be *specific* to be obeyed. "Clover" names one card in
 * twenty-one; "fruit" is merely what a whole shelf is called, and following it
 * would put the same apple on a dozen games at once — so a word that reaches
 * past half the pool is treated as a namespace rather than a name, and the title
 * falls back to the hash, which is also what happens when it names nothing.
 */
export function coverFor(alias: string): string {
  const pack = assetFor(alias);
  const pool = pack.covers ?? pack.images;
  const words = alias
    .slice(alias.indexOf("/") + 1)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4);
  const ceiling = Math.ceil(pool.length / 2);

  for (const w of words) {
    const hits = pool.filter((u) => {
      const raw = artStem(u);
      return sameThing(raw, w) || sameThing(COVER_SPELLING[raw] ?? raw, w);
    });
    if (hits.length > 0 && hits.length <= ceiling) return hits[0];
  }
  return pool[hash(alias) % pool.length];
}

/** Builds the cabinet/reel background for a game from its theme + pack art. */
export function sceneFor(alias: string, cols: number): Scene {
  const t = themeFor(alias);
  const pack = assetFor(alias);
  const h = hash(alias);
  const a = t.accent;
  const n = alias.toLowerCase();

  // Every pack hangs a picture behind the cabinet, and there are two kinds of
  // picture. A pack that paints a *whole room* — the Egyptian hall, the Olympus
  // scenes, the nordic panorama, the savannah plates, the fantasy cabinets — and
  // a pack that only ships a *backglass*, which scripts/make-banners.sh composes
  // out of that pack's own symbols for the five sets that arrive as loose
  // symbols with nothing landscape-shaped in them. The page gets either one
  // full-bleed; the theme treatment draws it a second time inside the cabinet,
  // under a scrim.
  let image: string | undefined;
  if (pack.kind === "fantasy") {
    image = `${FANTASY}/machine-${cols >= 4 ? 4 : 1}.webp`;
  } else if (pack.bg) {
    image = pack.bg;
  }

  // A painted room already *is* a scene, so it keeps the theme treatment: a gold
  // VIP suite or a lava skin laid over it would be two pictures fighting. A
  // backglass is a backdrop rather than a room, so those games still take a skin
  // for their cabinet, with the picture filling the page around it either way.
  const isRoom =
    pack.kind === "kemet" ||
    pack.kind === "zeus" ||
    pack.kind === "viking" ||
    pack.kind === "buffalo" ||
    pack.kind === "fantasy";
  const wantsVip = !isRoom && VIP_KEYWORDS.some((k) => n.includes(k));
  // Keywords first, then a hash share so the fiery art reaches beyond the
  // obviously-named titles without landing on two games alike.
  const wantsVolcano =
    !isRoom &&
    !wantsVip &&
    (VOLCANO_KEYWORDS.some((k) => n.includes(k)) || h % 7 === 0);

  const style: SceneStyle = wantsVip ? "vip" : wantsVolcano ? "volcano" : "theme";

  const spotlight = `radial-gradient(54% 38% at 50% -8%, ${rgba(a, 0.70)} 0%, transparent 72%)`;

  let cabinet: string;
  let backdrop: string;
  let felt: string;
  let halo: string;
  let rim: string;
  let deco: string | undefined;
  let decoFrame: string | undefined;
  let decoSize: number | undefined;
  let decoMask: string | undefined;
  const emberColor = "#ff9a2e";
  let smoke = `${rgba(t.bgB, 0.9)}`;

  if (style === "vip") {
    // Elegant VIP suite: rich gold + dark obsidian, deco fan, warm spot.
    cabinet =
      `radial-gradient(50% 34% at 50% -6%, rgba(255,238,190,0.72) 0%, rgba(255,200,104,0.28) 46%, transparent 74%),` +
      `radial-gradient(85% 55% at 50% 112%, rgba(232,172,62,0.58) 0%, transparent 72%),` +
      `conic-gradient(from 180deg at 50% -16%, rgba(255,216,134,0.17) 0deg 3deg, transparent 3deg 12deg),` +
      `linear-gradient(180deg, #4c3c20 0%, #332715 36%, #43331b 64%, #261c0b 100%)`;
    felt =
      `radial-gradient(92% 70% at 50% 0%, rgba(255,216,146,0.38) 0%, transparent 62%),` +
      `linear-gradient(180deg, #392a10 0%, #1c1409 52%, #33250e 100%)`;
    halo = `radial-gradient(62% 46% at 50% 0%, rgba(255,206,116,0.38) 0%, transparent 70%)`;
    rim = "rgba(255,214,140,0.62)";
    deco = DECO_VIP;
    decoFrame = DECO_FRAME;
    decoSize = 190;
    decoMask = "radial-gradient(130% 110% at 50% 0%, #fff 25%, transparent 88%)";
    smoke = "rgba(74,52,20,0.9)";
    backdrop = cabinet;
  } else if (style === "volcano") {
    // Volcanic abyss: lava glow from below, embers rising, hot rim light.
    cabinet =
      `radial-gradient(58% 42% at 50% 118%, rgba(255,178,74,0.98) 0%, rgba(214,64,12,0.60) 44%, transparent 78%),` +
      `radial-gradient(42% 30% at 50% -6%, rgba(255,148,60,0.52) 0%, transparent 72%),` +
      `radial-gradient(130% 85% at 50% 0%, #a6320f 0%, #6d1e0b 46%, #3d0e06 100%)`;
    felt =
      `radial-gradient(92% 70% at 50% 0%, rgba(255,156,68,0.36) 0%, transparent 62%),` +
      `linear-gradient(180deg, #43180a 0%, #1e0804 52%, #3a1107 100%)`;
    halo = `radial-gradient(62% 46% at 50% 0%, rgba(255,140,50,0.40) 0%, transparent 70%)`;
    rim = "rgba(255,150,60,0.62)";
    deco = DECO_VOLCANO;
    decoSize = 250;
    decoMask = "radial-gradient(130% 110% at 50% 100%, #fff 18%, transparent 86%)";
    smoke = "rgba(96,34,12,0.92)";
    backdrop = cabinet;
  } else {
    // Theme scene, lifted so no cabinet sits in flat black.
    //
    // The wall is computed once and used twice: it is the cabinet when the pack
    // ships no scene art, and the page background either way. When a scene *is*
    // shipped the page gets the wall as a gradient and the art arrives as a
    // full-bleed <img> on top of it — see `backdrop` on the Scene type.
    const themeWall =
      `radial-gradient(48% 34% at 50% -6%, ${rgba(a, 0.62)} 0%, transparent 72%),` +
      `radial-gradient(90% 56% at 50% 112%, ${rgba(a, 0.40)} 0%, transparent 74%),` +
      `linear-gradient(180deg, ${rgba(t.bgA, 0.98)} 0%, ${t.bgB} 58%, ${rgba(t.bgA, 0.88)} 100%)`;
    backdrop = themeWall;
    cabinet = image
      ? `${spotlight}, linear-gradient(rgba(6,10,22,0.52), rgba(3,6,14,0.80)), url(${image})`
      : themeWall;
    felt =
      `radial-gradient(92% 70% at 50% 0%, ${rgba(a, 0.36)} 0%, transparent 62%),` +
      `radial-gradient(70% 46% at 50% 108%, ${rgba(a, 0.24)} 0%, transparent 74%),` +
      `linear-gradient(180deg, ${rgba(t.bgA, 0.95)} 0%, ${rgba(t.bgB, 0.96)} 52%, ${rgba(t.bgA, 0.88)} 100%)`;
    halo = `radial-gradient(60% 45% at 50% 0%, ${rgba(a, 0.36)} 0%, transparent 70%)`;
    rim = rgba(a, 0.58);
  }

  // Deterministic aurora blobs so each cabinet animates slightly differently.
  const drift = [0, 1, 2].map((i) => ({
    color:
      style === "volcano"
        ? i === 1
          ? emberColor
          : rgba(t.bgA, 0.9)
        : style === "vip"
          ? i === 1
            ? "rgba(255,206,116,0.9)"
            : "rgba(120,86,26,0.9)"
          : i === 1
            ? t.accent
            : rgba(t.bgA, 0.85),
    size: 42 + ((h >> (i * 3)) % 26),
    x: 12 + ((h >> (i * 2)) % 70),
    y: 8 + ((h >> (i * 4)) % 40),
  }));
  if (style === "volcano") {
    // smoke reads better as two big soft banks low in frame
    drift[1] = { color: smoke, size: 74, x: 22, y: 62 };
    drift[2] = { color: smoke, size: 58, x: 62, y: 70 };
  }

  // Rising embers, deterministic per game (volcano scenes only).
  const embers: Scene["embers"] = [];
  if (style === "volcano") {
    for (let i = 0; i < 16; i++) {
      const s = (h >> i) & 0xff;
      embers.push({
        x: 4 + ((s * 37) % 92),
        y: 42 + ((s * 13) % 52),
        size: 1.5 + ((s % 5) * 0.9),
        delay: -(((s % 40) / 10) % 6),
      });
    }
  }

  // Pixel Food games get a food-court wall: a spread of the pack's other icons
  // floating behind the cabinet, picked deterministically per game.
  const props: SceneProp[] = [];
  if (pack.kind === "pixelfood") {
    for (let i = 0; i < 14; i++) {
      const s = (h >> (i % 8)) ^ (i * 2654435761);
      const spread = (k: number, mod: number) => Math.abs((s >> (k * 5)) % mod);
      props.push({
        src: FOOD_ART[Math.abs(s) % FOOD_ART.length],
        // bias to the cabinet margins where the reel window does not cover it
        x: spread(0, 9) < 4 ? 1 + spread(1, 11) : 89 + spread(1, 10),
        y: 3 + spread(2, 88),
        size: 26 + spread(3, 30),
        tilt: (spread(4, 24) - 12) / 2,
        delay: -spread(5, 60) / 10,
      });
    }
    // dedupe so a wall never shows the same dish twice in one row
    const seen = new Set<string>();
    for (const p of props) {
      while (seen.has(p.src)) p.src = FOOD_ART[(FOOD_ART.indexOf(p.src) + 7) % FOOD_ART.length];
      seen.add(p.src);
    }
  }

  return {
    style, image, backdrop, cabinet, felt, halo, rim, aurora: drift, embers,
    deco, decoFrame, decoSize, decoMask, props,
  };
}