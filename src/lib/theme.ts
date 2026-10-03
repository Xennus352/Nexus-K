// Deterministic per-game theme: every game gets its own palette + symbol set.

type Theme = {
  // tailwind gradient for card cover / cabinet bg
  cover: string;
  accent: string; // hex color used for glows/borders
  accentText: string;
  symbols: string[]; // emoji reel symbols
  scene: string; // big background emoji
  tagline: string;
};

const PACKS: { keys: string[]; t: Theme }[] = [
  {
    keys: ["egypt", "pyramid", "pharaoh", "cleopatra", "sphinx", "desert", "scarab", "anubis", "zeus of", "nile"],
    t: {
      cover: "from-amber-600/80 to-yellow-950", accent: "#f59e0b", accentText: "text-amber-300",
      symbols: ["🏺", "🐫", "👑", "🦂", "🗝️", "🐍", "💎", "🏜️"], scene: "🐪", tagline: "Ancient Treasures",
    },
  },
  {
    keys: ["ocean", "sea", "fish", "dolphin", "pirate", "treasure", "pearl", "shark", "aqua", "mermaid", "atlantis", "reef"],
    t: {
      cover: "from-cyan-600/80 to-blue-950", accent: "#22d3ee", accentText: "text-cyan-300",
      symbols: ["🐙", "🐬", "⚓", "🐚", "🐠", "🦈", "💎", "🦜"], scene: "🌊", tagline: "Deep Blue Riches",
    },
  },
  {
    keys: ["space", "galaxy", "astro", "star", "nova", "cosmic", "planet", "ufo", "moon", "comet"],
    t: {
      cover: "from-violet-600/80 to-indigo-950", accent: "#a78bfa", accentText: "text-violet-300",
      symbols: ["🪐", "🚀", "👽", "⭐", "☄", "🛸", "🌌", "💎"], scene: "🚀", tagline: "Out of this World",
    },
  },
  {
    keys: ["dragon", "fire", "flame", "phoenix", "burning", "inferno", "volcano", "lava", "dragons"],
    t: {
      cover: "from-red-600/80 to-rose-950", accent: "#f87171", accentText: "text-red-300",
      symbols: ["🐉", "🔥", "🌋", "🗡️", "🛡️", "💎", "🦅", "⚡"], scene: "🔥", tagline: "Fury of the Dragons",
    },
  },
  {
    keys: ["magic", "wizard", "witch", "spell", "potion", "sorcerer", "mystic", "enchant", "arcana", "tarot"],
    t: {
      cover: "from-purple-600/80 to-fuchsia-950", accent: "#c084fc", accentText: "text-purple-300",
      symbols: ["🧙", "🔮", "✨", "🪄", "🎩", "🦉", "🃏", "⭐"], scene: "🔮", tagline: "Arcane Fortunes",
    },
  },
  {
    keys: ["wild", "west", "cowboy", "gold rush", "outlaw", "saloon", "range", "sheriff"],
    t: {
      cover: "from-orange-700/80 to-amber-950", accent: "#fb923c", accentText: "text-orange-300",
      symbols: ["🤠", "🌵", "🐎", "🔫", "💰", "🐂", "⭐", "🃏"], scene: "🤠", tagline: "Frontier Gold",
    },
  },
  {
    keys: ["fruit", "juicy", "sweet", "candy", "sugar", "berry", "cherry", "lemon", "watermelon", "fruity", "hot shots"],
    t: {
      cover: "from-pink-500/80 to-rose-950", accent: "#f472b6", accentText: "text-pink-300",
      symbols: ["🍒", "🍋", "🍉", "🍇", "🍊", "🍓", "7️⃣", "💎"], scene: "🍒", tagline: "Juicy Wins",
    },
  },
  {
    keys: ["jungle", "safari", "lion", "tiger", "animal", "wild cat", "elephant", "monkey", "ape", "jungle"],
    t: {
      cover: "from-emerald-600/80 to-green-950", accent: "#34d399", accentText: "text-emerald-300",
      symbols: ["🦁", "🐯", "🐘", "🐵", "🐍", "🌿", "💎", "🐒"], scene: "🦁", tagline: "Call of the Wild",
    },
  },
  {
    keys: ["greek", "olympus", "zeus", "athena", "gods", "hero", "troy", "medusa", "myth"],
    t: {
      cover: "from-sky-500/80 to-slate-900", accent: "#7dd3fc", accentText: "text-sky-200",
      symbols: ["⚡", "🏛️", "🦅", "🛡️", "🔱", "🦁", "💎", "🍇"], scene: "🏛️", tagline: "Gifts of the Gods",
    },
  },
  {
    keys: ["luck", "irish", "clover", "leprechaun", "pot of gold", "rainbow", "emerald", "lucky"],
    t: {
      cover: "from-green-500/80 to-emerald-950", accent: "#4ade80", accentText: "text-green-300",
      symbols: ["🍀", "🌈", "🪙", "🎩", "☘️", "🦄", "💎", "🍻"], scene: "🍀", tagline: "Luck Be With You",
    },
  },
  {
    keys: ["horror", "vampire", "zombie", "ghost", "halloween", "dracula", "dark", "curse", "bones", "grave"],
    t: {
      cover: "from-slate-700/80 to-black", accent: "#94a3b8", accentText: "text-slate-300",
      symbols: ["🦇", "💀", "👻", "🧛", "🕷️", "🎃", "⚰️", "🩸"], scene: "🦇", tagline: "Spin the Curse",
    },
  },
  {
    keys: ["christmas", "santa", "holiday", "winter", "snow", "xmas", "rudolph", "elf"],
    t: {
      cover: "from-red-500/80 to-emerald-950", accent: "#f87171", accentText: "text-red-200",
      symbols: ["🎅", "🎄", "🔔", "🦌", "❄️", "🎁", "⭐", "⛄"], scene: "🎄", tagline: "Holiday Riches",
    },
  },
  {
    keys: ["egyptian", "jewel", "gem", "diamond", "crystal", "ruby", "sapphire", "gems", "jewels", "wealth", "gold", "coin", "fortune"],
    t: {
      cover: "from-blue-600/80 to-slate-950", accent: "#60a5fa", accentText: "text-blue-300",
      symbols: ["💎", "👑", "💰", "🪙", "🔔", "⭐", "🗝️", "💰"], scene: "💎", tagline: "Gems & Gold",
    },
  },
];

const CLASSIC = "/gfx/classic";
const KEMET = "/gfx";

export type AssetPack = {
  kind: "kemet" | "classic";
  images: string[];
  /** Index in `images` that is the wild symbol, when known. */
  wildIndex?: number;
  /** Tile art placed behind each reel symbol (kemet pack). */
  cellFrame?: string;
  bg?: string;
  logo?: string;
  bigwin?: string;
  bigwinDecor?: string;
  character?: string;
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

const KEMET_KEYWORDS = ["egypt", "pyramid", "pharaoh", "cleopatra", "anubis", "kemet", "scarab", "sphinx", "mummy"];

export function assetFor(alias: string): AssetPack {
  const n = alias.toLowerCase();
  if (KEMET_KEYWORDS.some((k) => n.includes(k))) {
    const base = KEMET;
    return {
      kind: "kemet",
      images: KEMET_IMAGES,
      wildIndex: 4,
      cellFrame: `${base}/frame.webp`,
      bg: `${base}/bg.webp`,
      logo: `${base}/logo.webp`,
      bigwin: `${base}/bigwin.webp`,
      bigwinDecor: `${base}/bigwin-decor.webp`,
      character: `${base}/anubis.webp`,
    };
  }
  return { kind: "classic", images: CLASSIC_IMAGES };
}

const FALLBACK: Theme[] = [
  { cover: "from-blue-700/80 to-slate-950", accent: "#38bdf8", accentText: "text-sky-300",
    symbols: ["🍒", "⭐", "💎", "🔔", "7️⃣", "🍇", "🎰", "🍀"], scene: "🎰", tagline: "Classic Casino" },
  { cover: "from-fuchsia-700/80 to-slate-950", accent: "#e879f9", accentText: "text-fuchsia-300",
    symbols: ["⭐", "💎", "👑", "🎰", "💰", "🍀", "🔔", "🍒"], scene: "⭐", tagline: "High Roller" },
  { cover: "from-amber-600/80 to-slate-950", accent: "#fbbf24", accentText: "text-amber-300",
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
