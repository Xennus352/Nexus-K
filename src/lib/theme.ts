// Deterministic per-game theme: every game gets its own palette, reel art and
// background so no two cabinets look alike and nothing falls back to flat black.

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
    keys: ["jungle", "safari", "lion", "tiger", "animal", "wild cat", "elephant", "monkey", "ape"],
    t: {
      cover: "from-emerald-600/80 to-green-950", accent: "#34d399", accentText: "text-emerald-300",
      bgA: "#047857", bgB: "#03211a",
      symbols: ["🦁", "🐯", "🐘", "🐵", "🐍", "🌿", "💎", "🐒"], scene: "🦁", tagline: "Call of the Wild",
    },
  },
  {
    keys: ["greek", "olympus", "zeus", "athena", "gods", "hero", "troy", "medusa", "myth"],
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

export type PackKind = "kemet" | "classic" | "fruits2" | "pixelfood" | "fantasy";

export type AssetPack = {
  kind: PackKind;
  images: string[];
  /** Index in `images` that is the wild symbol, when known. */
  wildIndex?: number;
  /** Tile art placed behind each reel symbol (kemet pack). */
  cellFrame?: string;
  /** Real cabinet backdrop art, used instead of a flat colour. */
  bg?: string;
  logo?: string;
  bigwin?: string;
  bigwinDecor?: string;
  character?: string;
  /** Pixel-art packs get a subtle grid overlay on the reel window. */
  pixelGrid?: boolean;
};

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

const KEMET_PACK: AssetPack = {
  kind: "kemet",
  images: KEMET_IMAGES,
  wildIndex: 4,
  cellFrame: `${KEMET}/frame.webp`,
  bg: `${KEMET}/bg.webp`,
  logo: `${KEMET}/logo.webp`,
  bigwin: `${KEMET}/bigwin.webp`,
  bigwinDecor: `${KEMET}/bigwin-decor.webp`,
  character: `${KEMET}/anubis.webp`,
};

const CLASSIC_PACK: AssetPack = { kind: "classic", images: CLASSIC_IMAGES };
const FRUITS2_PACK: AssetPack = {
  kind: "fruits2", images: FRUITS2_IMAGES, pixelGrid: true,
};
const PIXELFOOD_PACK: AssetPack = {
  kind: "pixelfood", images: PIXELFOOD_IMAGES, pixelGrid: true,
};
// Cabinet art is picked by column count in sceneFor(): machine-1 frames 3 reels,
// machine-4 frames 4. Only used as a dimmed backdrop, never as a strict frame.
const FANTASY_PACK: AssetPack = {
  kind: "fantasy", images: FANTASY_IMAGES, pixelGrid: true,
};

const KEMET_KEYWORDS = ["egypt", "pyramid", "pharaoh", "cleopatra", "anubis", "kemet", "scarab", "sphinx", "mummy"];
const FANTASY_KEYWORDS = ["pixel", "8bit", "8-bit", "retro", "arcade", "fantasy"];
const FRUIT_KEYWORDS = [
  "fruit", "fruits", "juice", "juicy", "cherry", "lemon", "melon", "berry", "grape",
  "peach", "plum", "apple", "orange", "banana", "straw", "kiwi", "lime", "candy", "sweet", "sugar",
];

/**
 * Picks the reel art for a game: keyword match first, otherwise a deterministic
 * rotation across the packs so the lobby never looks repetitive.
 */
export function assetFor(alias: string): AssetPack {
  const n = alias.toLowerCase();
  if (KEMET_KEYWORDS.some((k) => n.includes(k))) return KEMET_PACK;
  if (FANTASY_KEYWORDS.some((k) => n.includes(k))) return FANTASY_PACK;
  if (FRUIT_KEYWORDS.some((k) => n.includes(k))) {
    return hash(alias) % 2 === 0 ? FRUITS2_PACK : PIXELFOOD_PACK;
  }
  // Rotate the remaining packs by name hash for variety.
  const rotation = [CLASSIC_PACK, FRUITS2_PACK, PIXELFOOD_PACK, FANTASY_PACK];
  return rotation[hash(alias) % rotation.length];
}

/* ------------------------------------------------------------------ *
 * Backgrounds + effects
 * ------------------------------------------------------------------ */

export type Scene = {
  /** Real backdrop art when the pack ships one. */
  image?: string;
  /** Cabinet background (CSS). */
  cabinet: string;
  /** Reel-window background (CSS) — never flat black. */
  felt: string;
  /** Ambient halo colour behind the machine. */
  halo: string;
  /** Two or three drifting blobs for the GSAP aurora effect. */
  aurora: { color: string; size: number; x: number; y: number }[];
  /** Frame/border colour for the machine. */
  rim: string;
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Builds the cabinet/reel background for a game from its theme + pack art. */
export function sceneFor(alias: string, cols: number): Scene {
  const t = themeFor(alias);
  const pack = assetFor(alias);
  const h = hash(alias);
  const a = t.accent;

  // Egyptian cabinet art; the fantasy cabinets are used as a dimmed backdrop.
  let image: string | undefined;
  if (pack.kind === "kemet" && pack.bg) image = pack.bg;
  else if (pack.kind === "fantasy") image = `${FANTASY}/machine-${cols >= 4 ? 4 : 1}.webp`;

  const cabinet = image
    ? `linear-gradient(rgba(3,6,14,0.80), rgba(2,3,9,0.93)), url(${image})`
    : `radial-gradient(120% 90% at 50% -10%, ${rgba(t.bgA, 0.95)} 0%, ${t.bgB} 62%, #04060d 100%)`;

  const felt =
    `radial-gradient(90% 70% at 50% 0%, ${rgba(a, 0.22)} 0%, transparent 60%),` +
    `linear-gradient(180deg, ${rgba(t.bgB, 0.96)} 0%, #05070f 55%, ${rgba(t.bgA, 0.55)} 100%)`;

  // Deterministic aurora blobs so each cabinet animates slightly differently.
  const drift = [0, 1, 2].map((i) => ({
    color: i === 1 ? t.accent : rgba(t.bgA, 0.85),
    size: 42 + ((h >> (i * 3)) % 26),
    x: 12 + ((h >> (i * 2)) % 70),
    y: 8 + ((h >> (i * 4)) % 40),
  }));

  return {
    image,
    cabinet,
    felt,
    halo: `radial-gradient(60% 45% at 50% 0%, ${rgba(a, 0.30)} 0%, transparent 70%)`,
    aurora: drift,
    rim: rgba(a, 0.55),
  };
}