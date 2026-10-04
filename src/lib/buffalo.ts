// African Buffalo: the paytable, the reels and the spin resolution.
//
// This runs on the server and only on the server. The reels a client shows are
// derived from the outcome this returns; the client never decides which symbols
// landed. Everything about the money (the bet that was charged, the win that was
// paid) flows from one call, so the answer cannot be edited from a dev-tool
// request to say the reels were different.

export const ASSETS = "/assets/african_buffalo_slot_assets";

/** Full paytable key → the image file that renders it, without the extension. */
export type Sym = {
  id: string;
  img: string;
  /** Payout for 3, 4 and 5 on a payline, in units of that line's stake. */
  p3: number;
  p4: number;
  p5: number;
  /** Payout for 2 of a kind on a payline, in units of that line's stake. */
  p2?: number;
  /** Wild substitutes for every symbol except the scatter. */
  wild?: boolean;
  /** The scatter pays anywhere on the screen, not on a line. */
  scatter?: boolean;
  /** Adds to the spin's win multiplier when it lands. */
  mult?: number;
};

export const SYMS: Sym[] = [
  { id: "wild", img: "wild_buffalo", p2: 5, p3: 25, p4: 100, p5: 500, wild: true },
  { id: "lion", img: "lion", p2: 3, p3: 15, p4: 50, p5: 200 },
  { id: "elephant", img: "elephant", p2: 3, p3: 12, p4: 40, p5: 180 },
  { id: "giraffe", img: "giraffe", p2: 2, p3: 10, p4: 30, p5: 150 },
  { id: "crocodile", img: "crocodile", p2: 2, p3: 8, p4: 25, p5: 100 },
  { id: "rhino", img: "rhino", p3: 6, p4: 20, p5: 80 },
  { id: "zebra", img: "zebra", p3: 5, p4: 15, p5: 60 },
  { id: "eagle", img: "eagle", p3: 4, p4: 12, p5: 50 },
  { id: "A", img: "buffalo_A", p3: 3, p4: 10, p5: 30 },
  { id: "K", img: "buffalo_K", p3: 3, p4: 8, p5: 25 },
  { id: "Q", img: "buffalo_Q", p3: 2, p4: 6, p5: 20 },
  { id: "J", img: "buffalo_J", p3: 2, p4: 5, p5: 15 },
  { id: "10", img: "symbol_10", p3: 2, p4: 4, p5: 10 },
  { id: "scatter", img: "scatter_sunset", p3: 2, p4: 5, p5: 20, scatter: true },
  { id: "x2", img: "multiplier_x2", p3: 0, p4: 0, p5: 0, mult: 2 },
  { id: "x3", img: "multiplier_x3", p3: 0, p4: 0, p5: 0, mult: 3 },
  { id: "x5", img: "multiplier_x5", p3: 0, p4: 0, p5: 0, mult: 5 },
];

const byImg = new Map(SYMS.map((s) => [s.img, s]));
/** The image URL for a paytable id — grid cells and wins carry ids, not file names. */
export function symImg(id: string): string {
  const s = SYMS.find((x) => x.id === id);
  return `${ASSETS}/symbols/${s?.img ?? "bonus_chest"}.png`;
}

/**
 * The reel stops. Each entry is a symbol id, in strip order. The weights are
 * coarse but not arbitrary: the card ranks and the "10" are common, the animal
 * high-pays are rarer, the wild and scatter are rarer again, and the pure
 * multiplier symbols exist so a x2 can sit next to a lost spin.
 */
const STRIP = (() => {
  const low = ["A", "K", "Q", "J", "10"];
  const mid = ["eagle", "zebra", "rhino", "crocodile"];
  const high = ["giraffe", "elephant", "lion"];
  const reel: string[] = [];
  const push = (id: string, n: number) => {
    for (let i = 0; i < n; i++) reel.push(id);
  };
  low.forEach((id) => push(id, 6));
  mid.forEach((id) => push(id, 4));
  high.forEach((id) => push(id, 3));
  push("wild", 2);
  push("scatter", 2);
  push("x2", 1);
  push("x3", 1);
  push("x5", 1);
  return reel;
})();

export const REEL_LEN = STRIP.length;

/** A window of `rows` symbols starting at `pos`, wrapping around the strip. */
export function windowAt(pos: number, rows = 3): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) out.push(STRIP[(pos + r) % STRIP.length]);
  return out;
}

/**
 * The ten paylines on a 5-reel, 3-row window. `rows[r]` is which row of reel `c`
 * this line reads. Stored flat for the browser to highlight the same lines the
 * server scored.
 */
export const LINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0],
];

export type Win = {
  line: number | null; // which payline, or null for a scatter
  sym: string;
  count: number;
  /** Multiplier this win was awarded at, after any symbol-side multiplier. */
  multiplier: number;
  /** What it paid, in coins. */
  amount: number;
  /** Which cells lit up, as [reel,row]. */
  cells: [number, number][];
};

export type Outcome = {
  /** The symbols, reel by reel, top to bottom. `grid[reel][row]`. */
  grid: string[][];
  wins: Win[];
  /** Sum of `amount` over every win, after the spin's own multiplier. */
  totalWin: number;
  /** Net spin multiplier, from the multiplier symbols on the grid. */
  multiplier: number;
  /** Scatter count anywhere on the grid. */
  scatters: number;
  spinsLeftAfter: number;
  feature: boolean;
  /** Server-picked free spins to award. */
  awarded: number;
};

export type Rng = () => number; // [0,1), injected so tests can be deterministic

function weighted(rng: Rng): number {
  return Math.floor(rng() * STRIP.length);
}

/**
 * Scores one grid. `lineStake` is the bet per payline, `multiplier` is the spin's
 * own multiplier, from any free-spins round in progress.
 */
export function score(grid: string[][], lineStake: number, multiplier: number): Outcome {
  const wins: Win[] = [];
  const scatterCells: [number, number][] = [];
  let scatterCount = 0;

  // --- scatters: anywhere, and pays anywhere ---
  for (let r = 0; r < 5; r++) {
    for (let row = 0; row < 3; row++) {
      const s = byImg.get(grid[r][row]);
      if (s?.scatter) {
        scatterCount++;
        scatterCells.push([r, row]);
      }
    }
  }
  const totalMultiplier = symbolMultiplier(grid) * multiplier;

  // --- line wins ---
  for (let l = 0; l < LINES.length; l++) {
    const line = LINES[l];
    const cells: [number, number][] = [];
    for (let c = 0; c < 5; c++) cells.push([c, line[c]]);

    // Walk the line from the left, building the winning run. A wild always
    // extends it; the first real symbol fixes which group the run belongs to, and
    // everything after must match that symbol or be a wild. A pure run of wilds
    // pays as the wild itself.
    let target: string | null = null;
    let count = 0;
    for (let c = 0; c < 5; c++) {
      const s = byImg.get(grid[c][line[c]]);
      if (!s || s.scatter || s.mult !== undefined) break;
      if (s.wild) {
        count++;
        continue;
      }
      if (target === null) {
        target = s.id;
        count++;
      } else if (target === s.id) {
        count++;
      } else break;
    }

    // A wild-only or wild-led run never fixed a target; it pays as wild only when
    // it is at least two long, because a single wild standing on its own is not a
    // paying line under any symbol's table.
    const winnerId = target ?? (count >= 2 ? "wild" : null);
    if (winnerId === null || count < 2) continue;

    const winner = SYMS.find((s) => s.id === winnerId);
    const pay = count === 2 ? winner?.p2 : count === 3 ? winner?.p3 : count === 4 ? winner?.p4 : winner?.p5;
    if (winner && pay && pay > 0) {
      wins.push({
        line: l,
        sym: winner.id,
        count,
        multiplier: totalMultiplier,
        amount: Math.round(pay * lineStake * totalMultiplier),
        cells: cells.slice(0, count),
      });
    }
  }

  // --- the scatter pays the bet, not the line ---
  if (scatterCount >= 2) {
    const s = byImg.get("scatter_sunset")!;
    const pay = scatterCount >= 5 ? s.p5 : scatterCount === 4 ? s.p4 : s.p3;
    if (pay > 0) {
      wins.push({
        line: null,
        sym: "scatter",
        count: scatterCount,
        multiplier: totalMultiplier,
        amount: Math.round(pay * (lineStake * LINES.length) * totalMultiplier),
        cells: scatterCells,
      });
    }
  }

  const totalWin = wins.reduce((a, w) => a + w.amount, 0);
  const feature = totalMultiplier > 1;
  return {
    grid,
    wins,
    totalWin,
    multiplier: totalMultiplier,
    scatters: scatterCount,
    spinsLeftAfter: 0, // filled in by the route, which knows the feature round
    feature,
    awarded: 0,
  };
}

/**
 * The distinct multiplier symbols anywhere on the grid, multiplied together.
 * One x2 and one x3 anywhere makes a x6 spin. Capped at x10 so a very lucky
 * screen cannot award an absurd multiple; that cap is game design, not a bug.
 */
export function symbolMultiplier(grid: string[][]): number {
  const found = new Set<number>();
  for (const reel of grid) {
    for (const img of reel) {
      const m = byImg.get(img)?.mult;
      if (m !== undefined) found.add(m);
    }
  }
  let m = 1;
  for (const v of found) m *= v;
  return Math.min(m, 10);
}

/** Free spins granted for a scatter count. The muliplier they run at. */
export function freeSpinsFor(scatters: number): { spins: number; multiplier: number } {
  if (scatters >= 5) return { spins: 20, multiplier: 3 };
  if (scatters >= 4) return { spins: 15, multiplier: 2 };
  if (scatters >= 3) return { spins: 10, multiplier: 2 };
  return { spins: 0, multiplier: 1 };
}

export function spinOutcome(rng: Rng): { grid: string[][]; pos: number[] } {
  const pos: number[] = [];
  const grid: string[][] = [];
  for (let r = 0; r < 5; r++) {
    const p = weighted(rng);
    pos.push(p);
    grid.push(windowAt(p, 3));
  }
  return { grid, pos };
}

export function wildImg(): string {
  return "wild_buffalo";
}
export function scatterImg(): string {
  return "scatter_sunset";
}
export function multId(img: string): number | undefined {
  return byImg.get(img)?.mult;
}
export { byImg as symByImg };
