"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import confetti from "canvas-confetti";
import { logSpin } from "@/server/actions";
import {
  themeFor, assetFor, sceneFor, multTile,
  badgeFor, type BadgeKind,
} from "@/lib/theme";
import Loader from "@/components/Loader";
import ConsoleButton from "@/components/game/ConsoleButton";
import CountUp from "@/components/CountUp";
import { publishBalance, subscribeBalance } from "@/server/realtime";

type Grid = number[][];

/**
 * One winning combination as the engine reports it.
 *
 * `mp` is the multiplier the row is scaled by — `slot.WinItem.MP` in the Go
 * source. It is not a reel symbol: each game fills the field its own way (African
 * Simba multiplies by its ways count and by 3 during free spins, `cherryhot` by a
 * full first column), and most hardcode `1`.
 *
 * **`pay` is the unscaled figure.** The engine totals a spin as `Σ pay × mp`
 * (`Wins.Gain()`, engine/game/slot/slot.go:40) and credits the wallet from that
 * sum — `Pay` never carries the multiplier inside it. Anything adding `pay` on
 * its own therefore reports a win smaller than the one actually deposited, and
 * disagrees with the balance the engine itself writes.
 *
 * Every literal in the engine that sets `Pay` also sets `MP`, so a serialized
 * `pay` always arrives with its `mp`; the `?? 1` only covers a row that carries
 * neither, which pays nothing either way.
 */
type Win = {
  /**
   * Coins this row pays. Optional because a scatter that only triggers free
   * spins arrives with no `pay` key at all; read it as "nothing won on this row"
   * rather than assuming it is a number.
   */
  pay?: number;
  mp?: number;
  sym: number;
  num: number;
  /**
   * Index of the payline this win belongs to; `0` for scatter and other unlined
   * combinations. Also optional for the same reason `pay` is — the engine omits
   * both on rows that only carry free spins or a jackpot id.
   */
  li?: number;
  xy: [number, number][];
};

/**
 * Shape of an engine reply. `what` carries the engine's error message when set;
 * the remaining fields are present on a successful call.
 */
type EngineReply = {
  what?: string;
  /** Engine replied with no payload — an empty body rather than JSON. */
  empty?: boolean;
  gid: number;
  /**
   * Games built on the generic grid type answer with `{ grid }` only — the
   * engine's marshaller swallows the sibling bet/sel fields — so they are
   * optional here and fetched separately when missing.
   */
  game: { grid?: unknown; bet?: number; sel?: number };
  sel?: number;
  bet?: number;
  wallet: number;
  wins: Win[];
};

/**
 * Normalises the engine's two grid encodings into `number[][]`:
 * games with a fixed-size grid send arrays, games on the generic grid send
 * base64 columns (one byte per symbol).
 */
function decodeGrid(raw: unknown): Grid {
  if (!Array.isArray(raw)) return [];
  const cols: number[][] = [];
  for (const col of raw) {
    if (Array.isArray(col)) {
      cols.push(col.map(Number));
    } else if (typeof col === "string") {
      try {
        cols.push(Array.from(atob(col), (ch) => ch.charCodeAt(0)));
      } catch {
        /* malformed column — skip it rather than breaking the whole grid */
      }
    }
  }
  return cols;
}

async function enginePost(path: string, body: unknown): Promise<EngineReply | null> {
  const res = await fetch(`/api/engine/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => null)) as EngineReply | null;
}

/**
 * Sound effects, backed by the recordings that shipped with the original app
 * (copied to public/sfx by scripts/optimize-upload-code.sh).
 *
 * One pooled <audio> element per clip, restarted on every play. Creating a node
 * per event instead would open a new decoder each time — reels stop several
 * times a second — and leak on mobile Safari.
 */
type SoundName = "spin" | "reel" | "tick" | "click" | "win" | "lose" | "coin";

/** Clips that came out of the dump as mp3; the rest are wav. */
const CLICK_SFX = new Set<SoundName>(["spin", "tick", "click", "coin"]);

class SoundFX {
  /** One element per clip name, restarted on each play. */
  private pool = new Map<string, HTMLAudioElement>();

  constructor() {
    if (typeof window === "undefined") return;
    // Unlock on the first gesture so autoplay policies do not block the spin.
    const unlock = () => this.play("spin", 0.2);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  private clip(name: SoundName): HTMLAudioElement {
    let el = this.pool.get(name);
    if (!el) {
      // The dumped app shipped .mp3 for the reel/tick/click set and .wav for the
      // longer win/lose stings.
      const ext = CLICK_SFX.has(name) ? "mp3" : "wav";
      el = new Audio(`/sfx/${name}.${ext}`);
      el.preload = "auto";
      this.pool.set(name, el);
    }
    return el;
  }

  play(name: SoundName, volume = 0.5) {
    if (typeof window === "undefined") return;
    try {
      const el = this.clip(name);
      el.currentTime = 0;
      el.volume = volume;
      // A blocked or missing clip must never interrupt a spin.
      void el.play().catch(() => {});
    } catch {
      /* audio is decorative */
    }
  }

  /* Aliases for readability at the call sites. */
  reelStop() {
    this.play("reel");
  }
  spinTick() {
    this.play("tick", 0.25);
  }
  win() {
    this.play("win");
  }
  lose() {
    this.play("lose");
  }
  click() {
    this.play("click", 0.3);
  }
  coin() {
    this.play("coin");
  }
}

const audio = new SoundFX();

/** Night scrim with a variable alpha, used for vignettes over the cabinet art. */
function rgbaCss(alpha: number): string {
  return `rgba(4, 6, 14, ${alpha})`;
}

/**
 * Rolls the symbols inside one reel cell. The rolling art lives in its own
 * layer that React never touches, because replacing React-owned children would
 * desync it from the DOM; the reel's real symbol is rendered by React underneath
 * and simply uncovered when the roll stops.
 */
/**
 * A reel's stop signal. `at` is the symbol to come to rest on, set once the
 * engine has answered; `halt` stops the reel without a new symbol, for a spin
 * that failed — there is no grid to land on, and leaving the reels turning
 * forever would be worse than showing the previous one.
 *
 * `at` is compared against `null` and never against truthiness: symbol index 0
 * is a real symbol, and `!stop.at` would spin for ever on a game whose first
 * symbol is the low pay.
 */
type Stop = { at: number | null; halt: boolean };

/** The shortest a spin may feel, however fast the engine answers. */
const MIN_SPIN = 0.7;
/** Seconds between one reel coming to rest and the next one. */
const REEL_STAGGER = 0.22;

/** Cells that are part of a paying line this spin (used for the gem tiles). */
function winCellsOf(wins: Win[], rows: number): Set<number> {
  const set = new Set<number>();
  for (const w of wins) for (const [c, r] of w.xy) set.add(c * rows + r);
  return set;
}

/**
 * Multiplier tiles, keyed by the cell they sit in (`col * rows + row`).
 *
 * These are reel cells, not overlays floating over the felt: the tile replaces
 * the symbol in that cell for as long as the win is on screen, which is how a
 * multiplier symbol actually reads on a physical reel. The engine still owns
 * both halves of the contract — it chose the grid and it priced the line — so
 * all this decides is *where* the tile sits and *which* of the pack's plates
 * it wears. It never decides what the tile says: `mp` is whatever the engine
 * multiplied that line by, and a line with `mp <= 1` contributes nothing
 * rather than an invented factor.
 *
 * The tile goes on the line's *first* hit cell, not the midpoint of its hits.
 * Midpoint reads better for a classic fixed payline, but "ways" games report a
 * scattered set of positions (`li: 243` on African Simba) whose midpoint lands
 * on empty felt between reels. The first cell is leftmost by construction, so
 * it is always on a symbol that actually paid. When two multiplied lines start
 * on the same cell the larger factor wins — one cell can only wear one tile,
 * and both payouts are in the win total regardless.
 *
 * Module-level rather than a `useMemo` because `doSpin` needs the same answer
 * *before* React renders: the reel's landing frame is built from this, and a
 * tile that only existed after the handover would pop in a beat after its own
 * reel stopped instead of rolling in with it.
 */
function multTilesOf(
  wins: Win[],
  cols: number,
  rows: number,
  alias: string,
): Map<number, { mp: number; art?: string }> {
  const tiles = new Map<number, { mp: number; art?: string }>();
  for (const w of wins) {
    const mp = w.mp ?? 1;
    if (mp <= 1 || w.xy.length === 0) continue;
    const [cx, cy] = w.xy[0];
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    const key = cx * rows + cy;
    const prev = tiles.get(key);
    if (!prev || mp > prev.mp) tiles.set(key, { mp, art: multTile(mp, alias) });
  }
  return tiles;
}

/**
 * Tumbles one cell until it is told where to stop.
 *
 * Driven by a stop signal rather than a step count, so the reels can start the
 * instant the player presses spin and only learn their destination when the
 * reply lands. Tumbling during the round trip is the point: a cabinet that sits
 * still while the request is in flight reads as a dead button.
 *
 * A motion blur is painted for as long as the symbol is changing and eased off
 * as the reel settles — the same cue a physical reel gives, and what stops a
 * fast tumble from reading as a strobe of almost-legible symbols.
 *
 * The cell's *settled* symbol is hidden for as long as this runs. `.cell-roll`
 * only paints the symbol currently tumbling — it has no background — so React's
 * own render underneath shows straight through it. That render is the previous
 * result at the moment spin is pressed and the new grid as soon as the reply
 * lands (`setGrid` runs while the reel is still turning), which reads as the
 * final symbol pinned in place with other symbols drawing over it rather than
 * as a reel turning. Revealing it again is the handover, per cell, on the frame
 * the reel lands.
 */
async function tumbleCell(
  roll: HTMLElement | null,
  count: number,
  htmlFor: (v: number) => string,
  landFor: (v: number) => string,
  onTick: () => void,
  stop: Stop,
) {
  if (!roll) return;
  /* Hide React's children, not the cell: the frame and felt are painted by the
     cell element itself and stay up. `visibility` inherits, so the cell opts out
     once and the roll opts back in — rather than every possible child of the
     cell (`.cell-sym`, `.mult-tile`, whatever `sym()` returns) having to be
     named here, which would break silently the next time one is added. */
  const cell = roll.parentElement;
  cell?.style.setProperty("visibility", "hidden");
  roll.style.setProperty("visibility", "visible");
  try {
    roll.style.filter = "blur(1.6px)";
    while (stop.at === null && !stop.halt) {
      roll.innerHTML = htmlFor(Math.floor(Math.random() * count));
      onTick();
      await gsap.fromTo(roll, { y: -16 }, { y: 0, duration: 0.07, ease: "power1.out" });
    }
    if (stop.halt) {
      await gsap.to(roll, { opacity: 0, duration: 0.15 });
      return;
    }
    /* The landing frame, not a random symbol: `landFor` resolves the art this
       cell actually settles on — a multiplier tile or a winning gem when the
       reply put one there, the plain symbol otherwise. Landing on the tile is
       what makes the multiplier *part of the reel* rather than a badge that
       appears over it a beat later: it drops in with the same y/scale the
       symbol does, and the handover below uncovers an identical tile underneath. */
    roll.innerHTML = landFor(stop.at!);
    await gsap.fromTo(roll, { y: -22, scale: 1.2 }, { y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" });
    // Blur eases off over the landing rather than snapping to sharp.
    await gsap.to(roll, { filter: "blur(0px)", duration: 0.18, ease: "power2.out" });
    // Hand over to the symbol React rendered for this spin.
    await gsap.to(roll, { opacity: 0, duration: 0.12 });
  } finally {
    /* Empty the overlay first, then uncover — the reverse would flash two
       symbols in one cell. Reached on every exit, including a tween that
       rejects, because a cell left hidden stays hidden until the next spin. */
    roll.innerHTML = "";
    gsap.set(roll, { opacity: 1, filter: "none" });
    roll.style.removeProperty("visibility");
    cell?.style.removeProperty("visibility");
  }
}

export default function Player({ uid, alias }: { uid: number; alias: string }) {
  const t = themeFor(alias);
  const assets = assetFor(alias);
  const [gid, setGid] = useState<number | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [wallet, setWallet] = useState(0);
  const [bet, setBet] = useState(1);
  const [sel, setSel] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [wins, setWins] = useState<Win[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [auto, setAuto] = useState(false);
  const [history, setHistory] = useState<{ bet: number; win: number; time: string }[]>([]);
  const [bigWin, setBigWin] = useState(0);
  const [notice, setNotice] = useState("");
  const [showPaytable, setShowPaytable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rollRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const machineRef = useRef<HTMLDivElement | null>(null);
  // Background art depends on the reel count, which is only known after the first deal.
  const cols = grid?.length ?? 5;
  const ready = grid !== null;
  const scene = useMemo(() => sceneFor(alias, cols), [alias, cols]);

  /**
   * Keeps this tab's balance in step with the player's other tabs.
   *
   * Two reasons it is not just `setWallet(j.wallet)`: the topbar on every other
   * page has its own copy of the balance, and a spin in this tab used to leave it
   * showing the pre-spin figure until a navigation happened. Subscribing means the
   * lobby and wallet update the moment a spin settles.
   */
  useEffect(() => subscribeBalance(uid, setWallet), [uid]);

  /** Applies a new engine balance and tells the other tabs about it. */
  const applyWallet = useCallback((next: number) => {
    setWallet(next);
    publishBalance({ uid, balance: next });
  }, [uid]);

  // Slow drifting glow blobs behind the cabinet (GSAP, theme-coloured).
  useEffect(() => {
    const root = machineRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".aurora-blob").forEach((el, i) => {
        const dir = i % 2 ? 1 : -1;
        gsap.to(el, {
          x: dir * (26 + i * 16),
          y: -dir * (14 + i * 11),
          scale: 1.16,
          opacity: 0.85,
          duration: 6 + i * 2.4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });
    }, root);
    return () => ctx.revert();
  }, [scene, ready]);

  // Food-court props drift gently (Pixel Food games).
  useEffect(() => {
    const root = machineRef.current;
    if (!root || scene.props.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".scene-prop").forEach((el, i) => {
        gsap.to(el, {
          y: i % 2 ? 10 : -10,
          x: i % 3 ? -6 : 6,
          duration: 4.5 + (i % 5),
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: Number(el.dataset.delay ?? 0),
        });
      });
    }, root);
    return () => ctx.revert();
  }, [scene, ready]);

  // Volcanic scenes breathe embers upwards out of the lava glow.
  useEffect(() => {
    const root = machineRef.current;
    if (!root || scene.embers.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".ember").forEach((el) => {
        const rise = 30 + Math.random() * 40;
        gsap.fromTo(
          el,
          { y: 0, opacity: 0 },
          {
            keyframes: [
              { opacity: 0.9, duration: 0.6 },
              { y: -rise, opacity: 0, duration: 4.5 + Math.random() * 2.5 },
            ],
            delay: Number(el.dataset.delay ?? 0),
            repeat: -1,
            ease: "none",
          }
        );
      });
    }, root);
    return () => ctx.revert();
  }, [scene, ready]);

  // Big win: slow-rotating light rays behind the payout.
  useEffect(() => {
    if (!bigWin) return;
    const el = document.querySelector<HTMLElement>(".bigwin-rays");
    if (!el) return;
    const tw = gsap.to(el, { rotate: 360, duration: 18, repeat: -1, ease: "none" });
    return () => { tw.kill(); };
  }, [bigWin]);

  useEffect(() => {
    (async () => {
      const j = await enginePost("game/new", { cid: 1, uid, alias });
      const g = decodeGrid(j?.game?.grid);
      if (!j || j.what || g.length === 0) { setError(j?.what ?? "engine returned no data"); return; }
      setGid(j.gid);
      setGrid(g);
      applyWallet(j.wallet);
      if (typeof j.game.bet === "number") setBet(j.game.bet);
      if (typeof j.game.sel === "number") setSel(j.game.sel);
      // Generic-grid games omit bet/sel from the deal, so read them back.
      const [sb, bb] = await Promise.all([enginePost("slot/sel/get", { gid: j.gid }), enginePost("slot/bet/get", { gid: j.gid })]);
      if (typeof sb?.sel === "number" && sb.sel > 0) setSel(sb.sel);
      if (typeof bb?.bet === "number" && bb.bet > 0) setBet(bb.bet);
    })();
  }, [uid, alias, applyWallet]);

  async function doSpin() {
    if (busy || gid == null) return;
    // The engine stakes bet × active lines, so check the real cost up front.
    const stake = bet * (sel || 1);
    if (stake > wallet) {
      setAuto(false);
      setNotice(`⚠️ Not enough balance for a ${stake} bet — lower the bet or deposit.`);
      return;
    }
    setBusy(true);
    setWins([]);
    if (soundOn) audio.reelStop();

    const px = assets.pixelGrid ? ' style="image-rendering:pixelated"' : "";
    const htmlFor = (v: number) =>
      `<img src="${assets.images[v % assets.images.length]}" alt="" class="h-full w-full object-contain p-1"${px} />`;
    /**
     * Art each cell actually settles on, keyed by flat cell index.
     *
     * Empty until the reply lands — the reels are already turning by then, and
     * the landing frame is only needed once a reel is told where to stop. A
     * multiplier tile or a winning gem goes in here so the reel drops onto the
     * *same* art React will uncover, instead of landing on a plain symbol and
     * swapping for the tile a beat later.
     */
    const landing = new Map<number, string>();
    const landFor = (i: number, v: number) => {
      const art = landing.get(i);
      return art
        ? `<img src="${art}" alt="" class="h-full w-full object-contain p-1"${px} />`
        : htmlFor(v);
    };

    /* The reels start before the request is even on the wire. The old sequence
       waited for the reply and *then* animated, so the cabinet sat frozen for
       the whole round trip — the "reel spin delay" — and only then burst into
       a fixed-length tumble. Stopping is a signal now, not a step count. */
    const started = performance.now();
    const stops: Stop[] = cellRefs.current.map(() => ({ at: null, halt: false }));
    const tumbling = cellRefs.current.map((_, i) =>
      tumbleCell(rollRefs.current[i], assets.images.length, htmlFor, (v) => landFor(i, v), () => {
        if (soundOn && Math.random() < 0.3) audio.spinTick();
      }, stops[i]),
    );

    /* Every exit from this block has to stop the reels, so it runs in a
       `finally`. The happy path stops them by assigning `at`; the two unhappy
       ones — a request that throws, and a reply carrying no grid — have nothing
       to assign. That mattered less when a tumble was a fixed step count that
       ended on its own: now it ends only when it is told to, and an unhalted
       reel would spin for ever while auto-spin, having cleared `busy` a second
       later, started a *second* loop writing to the same cell. */
    /* The payoff is assembled inside the `try` but played after the `finally`,
       so it has to be reachable from both. Stays null on a spin that never got
       a usable reply: that path returns out of the `try` and never plays it. */
    let showResult: (() => void) | null = null;
    try {
      const j = await enginePost("slot/spin", { gid, bet });
      const finals = decodeGrid(j?.game?.grid);
      // Read the row count off the reply rather than off `rows`: that state is
      // declared below this function, and pulling it in here would make the spin
      // depend on a value that has not been initialised when auto-spin starts.
      const rowsNow = finals[0]?.length ?? 0;
      if (!j || j.what || finals.length === 0 || rowsNow === 0) {
        setBusy(false); setAuto(false); setNotice(`⚠️ ${j?.what ?? "engine returned no data"}`);
        return;
      }

      /* The grid goes into React *now*, while every cell is still covered by its
         tumbling reel. The handover is per cell and the first column comes to
         rest roughly a fifth of a second before the release loop below has
         finished queueing the last one, so React has to already be holding this
         spin's symbols before any cell uncovers — otherwise a reel lands on the
         *previous* spin's symbol and swaps it a beat later, which is the same
         stuck item the tumble has just spent a second hiding. Publishing early
         also gives the new art a head start on loading, so an uncovering cell
         never flashes an image that has not arrived. */
      setGrid(finals);
      /* The win is published with the grid, not after the reels land: the cell
         has to uncover the very tile its reel just dropped onto, and a tile that
         only existed after the handover would pop in a beat after its own reel
         stopped. This publishes *art* only — everything that reveals a win to
         the player is gated on `busy` or deferred to `showResult` below. */
      setWins(j.wins ?? []);
      if (typeof j.game.bet === "number" && j.game.bet > 0) setBet(j.game.bet);
      if (typeof j.game.sel === "number" && j.game.sel > 0) setSel(j.game.sel);

      const flat: number[] = [];
      finals.forEach((col) => col.forEach((v) => flat.push(v)));

      /* Fill the landing art with the same helpers React renders from, so the
         two cannot drift apart: the plate a reel lands on and the plate a cell
         uncovers must be identical, or the handover would visibly swap them. */
      const spinWins = j.wins ?? [];
      const spinCells = winCellsOf(spinWins, rowsNow);
      const spinTiles = multTilesOf(spinWins, finals.length, rowsNow, alias);
      for (let i = 0; i < flat.length; i++) {
        const tile = spinTiles.get(i);
        if (tile?.art) landing.set(i, tile.art);
        else if (spinCells.has(i) && assets.gemTiles) {
          landing.set(i, assets.gemTiles[flat[i] % assets.gemTiles.length]);
        }
      }

      /* Land left to right, never two reels at once. Each release takes the
         later of its own deadline (MIN_SPIN + column × REEL_STAGGER from the
         moment spin started) and one stagger gap after the previous reel went.
         Both terms are needed: on a *fast* reply the deadline is what holds
         each reel, and on a slow one every deadline has already passed — with
         only that term the whole cabinet would arrive as one thud, which is
         precisely the abrupt stop this replaces. */
      let lastRelease = 0;
      await Promise.all(
        Array.from({ length: finals.length }, (_, c) => (async () => {
          const dueAt = Math.max(
            started + (MIN_SPIN + c * REEL_STAGGER) * 1000,
            lastRelease + REEL_STAGGER * 1000,
            performance.now(),
          );
          lastRelease = dueAt;
          const wait = dueAt - performance.now();
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          for (let r = 0; r < rowsNow; r++) {
            const i = c * rowsNow + r;
            if (i < stops.length && i < flat.length) stops[i].at = flat[i];
          }
        })()),
      );

      /* Everything that *reports* the result waits until the `finally` below has
         seen every reel to rest. `setGrid`/`setWins` above could not wait — the
         cells needed the art before they uncovered — but this can, and waiting
         is the point: the payline, the wallet, the win sound and the big-win
         burst are the payoff, and firing them while the right-hand reels are
         still turning both spoils the spin and draws a payline over symbols
         that are about to move. Built as a closure so it survives the `finally`
         awaiting the tumble, and played once, after.

         Two things have to be true of `pay` at once. First, not every row in
         `wins` is a paid line — a scatter that only awards free spins comes back
         as `{ sym, num, xy, fs }` with no `pay` key at all (the engine tags it
         `omitempty`), so a bare `reduce((a, w) => a + w.pay, 0)` turns the whole
         spin total into `NaN`, which then poisons the spin log, the player's
         `totalWin` and the "last win" readout. Coerce, do not assume. Second,
         `pay` is the *unscaled* figure for the row: the engine settles a spin as
         `Σ pay × mp` (`Wins.Gain()`), so summing `pay` alone under-reports every
         spin where a multiplier landed, leaving the header, the history, the
         big-win threshold and the persisted spin log disagreeing with the
         balance the engine deposited. `mp` is absent only for a row that carries
         no `pay`, where ×1 and ×0 give the same answer. */
      const pay = (j.wins ?? []).reduce(
        (a: number, w: Win) => a + (typeof w.pay === "number" ? w.pay * (w.mp ?? 1) : 0),
        0,
      );
      showResult = () => {
        applyWallet(j.wallet);
        setLastWin(pay);
        if (pay > 0) {
          if (soundOn) audio.win();
          gsap.fromTo(".play-cell", { scale: 1 }, { scale: 1.12, duration: 0.15, repeat: 3, yoyo: true, stagger: 0.02 });
        }
        /* Written on *every* spin, not only when it qualifies. `bigWin` is not
           cleared anywhere else, so a losing spin used to leave the previous
           burst on screen — and with that overlay now covering the reels, it
           would have covered them for the spin after it too. */
        const isBig = pay >= Math.max(stake * 5, 20);
        setBigWin(isBig ? pay : 0);
        if (isBig) {
          try { confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } }); } catch { /* non-fatal */ }
        }
        setHistory((h) => [{ bet: stake, win: pay, time: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
        logSpin(alias, stake, pay);
      };
    } finally {
      /* No-op on the happy path — every reel already has its `at`. Anything
         still turning is told to stop where it is, so the reels hand back to
         React's own symbols instead of tumbling through an error screen. */
      for (const s of stops) if (s.at === null && !s.halt) s.halt = true;
      await Promise.all(tumbling);
    }
    // Every reel has stopped and handed back to React. Only now is the spin a result.
    if (soundOn) audio.reelStop();
    showResult?.();
  }

  async function safeSpin() {
    try {
      await doSpin();
    } catch (e) {
      console.error(e);
      setNotice("⚠️ Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (auto && !busy && gid != null) {
      const id = setTimeout(safeSpin, 1000);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, busy, gid]);

  /**
   * The engine prices a spin and credits it in the same call — there is no
   * pending amount sitting on the other side for a player to act on, so the
   * screen presents the win and moves on. `slot.DropMultiplier` is what makes
   * a multiplier worth looking for: it lands on the reel itself.
   */

  const rows = grid?.[0]?.length ?? 0;
  /**
   * A phone held upright.
   *
   * Watched rather than read from `window` at render time: the server has no
   * window, and a resize has to re-render the grid anyway. Read inside a
   * `matchMedia` effect, same as the rotate prompt, so the two agree on what
   * "portrait" means.
   */
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px) and (orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  /**
   * The smallest stake the engine will accept, and the largest the wallet covers.
   *
   * Both are `1`-floored rather than allowed to reach 0: `maxBet` dividing a
   * balance by the line count must never produce a bet of zero, or the spin would
   * be a no-op that still costs a request.
   */
  const minBet = 1;
  // Cells that are part of a paying line this spin (used for the gem tiles).
  const winCells = useMemo(() => winCellsOf(wins, rows), [wins, rows]);

  /**
   * Multiplier tiles, keyed by the cell they sit in. See `multTilesOf` — the
   * rule lives there because `doSpin` needs the same answer before React
   * renders, in order to build each reel's landing frame.
   */
  const multTiles = useMemo(() => multTilesOf(wins, cols, rows, alias), [wins, cols, rows, alias]);

  /**
   * The glow pulse on the landed tiles.
   *
   * Deliberately *not* the entrance: the reel now drops onto the tile itself,
   * so a `scale 0.3 → 1` pop would make the tile vanish and regrow the instant
   * its own reel uncovered it. What is left is the light — staggered in reel
   * order, and held off until `busy` clears, because the tiles are published
   * with the grid (see `setWins` in `doSpin`) and this must not burn its
   * one-and-a-half seconds behind cells that are still covered. The context
   * reverts the styles when the win clears, so an unmultiplied next spin
   * starts from nothing.
   */
  useEffect(() => {
    const root = machineRef.current;
    if (!root || busy || multTiles.size === 0) return;
    const tiles = root.querySelectorAll<HTMLElement>(".mult-tile");
    if (tiles.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        tiles,
        { boxShadow: "0 0 0 rgba(250,204,21,0)" },
        {
          boxShadow: "0 0 26px rgba(250,204,21,0.95)",
          duration: 0.45,
          ease: "sine.inOut",
          repeat: 3,
          yoyo: true,
          stagger: 0.08,
        },
      );
    }, root);
    return () => ctx.revert();
  }, [multTiles, busy]);

  if (error) return <p className="mt-20 text-rose-400">{error}</p>;
  if (!grid) return <Loader label={`DEALING ${alias.toUpperCase()}…`} />;
  // The engine charges the bet per line, so the real stake is bet × active lines.
  const lines = sel || 1;
  const totalBet = bet * lines;
  const maxBet = () => Math.max(minBet, Math.floor(wallet / lines));
  /**
   * Resets the stake to the floor.
   *
   * The counterpart to Max, and deliberately not "÷2" or some middle value: the
   * reason a player reaches for Min is that they have lost most of the balance
   * and want to keep playing cheaply, which means the smallest stake the engine
   * takes. Anything else leaves them still able to lose it in one spin.
   */
  const minBetTo = () => {
    setBet(minBet);
    setNotice("");
  };
  const sym = (v: number) => (
    // The settled symbol needs to beat the cell's background frame and lose to the
    // roll layer; both are pinned in globals.css. `cell-sym` is what selects it.
    <span className="cell-sym block h-full w-full">
      <img
        src={assets.images[v % assets.images.length]}
        alt=""
        className="h-full w-full object-contain p-1"
        style={assets.pixelGrid ? { imageRendering: "pixelated" } : undefined}
      />
    </span>
  );

  return (
    /*
     * The cabinet is a fixed-layout instrument, not a document: it must occupy
     * the whole viewport with no scrolling, so the root is a 100dvh column that
     * hands its leftover height to the reel window. `min-h-0` on the two flex
     * children below is what actually lets them shrink — without it a flex item
     * refuses to go below its content height and the console gets pushed off
     * screen on short displays.
     *
     * `max-w-[min(100%,1100px)]` replaces the old `max-w-5xl`: the cabinet now
     * fills a large display instead of hugging 960px of it, but is still capped
     * so a 4K monitor does not stretch 5 reels across two feet of felt.
     */
    <div
      className="relative isolate flex h-[100dvh] w-full select-none flex-col items-center justify-center gap-3 overflow-hidden bg-black p-2 text-white sm:gap-4 sm:p-4"
      style={{
        backgroundImage: scene.backdrop,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Full-bleed scene art behind everything.
          `isolate` is load-bearing: it makes the root a stacking context, so
          this `-z-10` layer lands *above* the root's own background and below
          every child. Without it the negative layer drops out of the root's
          context entirely and hides behind the page's `bg-black` — which is how
          a pack that ships a perfectly good backdrop ended up rendering black. */}
      {scene.image && (
        <img
          src={scene.image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
        />
      )}
      {/* Header bar */}
      <header className="flex w-full max-w-[min(100%,1100px)] shrink-0 flex-nowrap items-center justify-between gap-3 rounded-2xl border border-sky-500/25 bg-[#3b4f96]/75 p-3 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] sm:gap-4 sm:p-4 [@media(max-height:560px)]:gap-1 [@media(max-height:560px)]:p-1.5 [@media(max-height:560px)]:rounded-xl">
        <div className="flex min-w-0 items-center gap-3 [@media(max-height:560px)]:gap-1.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-sky-600 to-sky-300 shadow-lg shadow-sky-500/30 [@media(max-height:560px)]:h-7 [@media(max-height:560px)]:w-7">
            {assets.character
              ? <img src={assets.character} alt="" className="h-full w-full rounded-full object-contain" />
              : <span className="text-xl">👑</span>}
          </div>
          {/* The subtitle is the first thing to go when height is scarce — the
              machine name and the balance matter, the strapline does not. */}
          <div className="min-w-0">
            <h1 className="truncate bg-gradient-to-br from-sky-200 via-sky-400 to-blue-600 bg-clip-text text-base font-black tracking-wider text-transparent sm:text-xl font-cinzel [@media(max-height:560px)]:text-sm">
              {alias.toUpperCase()}
            </h1>
            <p className="hidden text-[10px] uppercase tracking-widest text-sky-200/50 [@media(max-height:560px)]:hidden sm:block">Nexus-K Luxury Slots</p>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3 [@media(max-height:560px)]:gap-1">
          <div className="min-w-0 flex-1 rounded-xl border border-sky-500/30 bg-black/60 px-2 py-1.5 text-center sm:min-w-[130px] sm:flex-none sm:px-4 sm:py-2 [@media(max-height:560px)]:py-0.5">
            <span className="block text-[10px] font-semibold uppercase text-sky-400/70">Balance</span>
            {/* Counts to the new figure and flashes green or rose for the direction of
                travel, so a win or a loss is legible without reading the digits. */}
            <span
              data-testid="game-balance"
              className="block truncate font-mono text-base font-bold drop-shadow-[0_0_8px_rgba(56,189,248,0.7)] sm:text-xl [@media(max-height:560px)]:text-sm"
            >
              💎 <CountUp value={wallet} />
            </span>
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-sky-500/30 bg-black/60 px-2 py-1.5 text-center sm:min-w-[130px] sm:flex-none sm:px-4 sm:py-2 [@media(max-height:560px)]:py-0.5">
            <span className="block text-[10px] font-semibold uppercase text-emerald-400/70">Last Win</span>
            <span className="block truncate font-mono text-base font-bold text-emerald-400 sm:text-xl [@media(max-height:560px)]:text-sm">+{lastWin}</span>
          </div>
          <button onClick={() => setShowPaytable(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20 [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:w-10" title="Paytable">☰</button>
          <button onClick={() => setSoundOn(!soundOn)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20 [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:w-10" title="Sound">{soundOn ? "🔊" : "🔇"}</button>
        </div>
      </header>

      {/* Machine frame — themed cabinet with drifting aurora glow, never flat black */}
      <div
        ref={machineRef}
        data-scene={scene.style}
        /* `min-h-0` is load-bearing: it is what lets this frame shrink below its
           content so the console below stays on screen on a short display. */
        className="@container relative flex min-h-0 w-full max-w-[min(100%,1100px)] flex-1 flex-col overflow-hidden rounded-3xl border-2 p-4 shadow-2xl sm:p-8 [@media(max-height:560px)]:p-2 [@media(max-height:560px)]:rounded-2xl"
        style={{
          borderColor: scene.rim,
          backgroundImage: scene.cabinet,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: `0 24px 60px rgba(0,0,0,0.75), 0 0 45px ${scene.rim}`,
        }}
      >
        {/* Aurora / ambient light layer */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {scene.aurora.map((b, i) => (
            <div
              key={i}
              className="aurora-blob absolute rounded-full"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `${b.size}%`,
                height: `${b.size}%`,
                marginLeft: `-${b.size / 2}%`,
                marginTop: `-${b.size / 2}%`,
                background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
                filter: "blur(34px)",
                opacity: 0.55,
              }}
            />
          ))}
          {/* Food-court props behind the cabinet (Pixel Food games) */}
          {scene.props.map((p, i) => (
            <img
              key={`p${i}`}
              src={p.src}
              alt=""
              aria-hidden
              className="scene-prop pointer-events-none absolute select-none"
              data-delay={p.delay}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                imageRendering: "pixelated",
                filter: `drop-shadow(0 6px 10px rgba(0,0,0,0.45)) rotate(${p.tilt}deg)`,
              }}
            />
          ))}
          {/* Rising embers over the lava glow (volcanic scenes) */}
          {scene.embers.map((e, i) => (
            <div
              key={`e${i}`}
              className="ember absolute rounded-full"
              data-delay={e.delay}
              style={{
                left: `${e.x}%`,
                top: `${e.y}%`,
                width: e.size,
                height: e.size,
                background: "radial-gradient(circle, #fff3c4 0%, #ff9a2e 45%, rgba(255,90,10,0) 72%)",
                boxShadow: "0 0 6px rgba(255,154,46,0.8)",
              }}
            />
          ))}
          {/* Art-deco filigree + border frame on the VIP wall */}
          {scene.deco && (
            <div
              data-deco="1"
              aria-hidden
              className="absolute inset-0 opacity-90"
              style={{
                backgroundImage: scene.decoFrame
                  ? `${scene.decoFrame}, ${scene.deco}`
                  : scene.deco,
                backgroundSize: scene.decoFrame
                  ? `100% 100%, ${scene.decoSize}px ${scene.decoSize}px`
                  : `${scene.decoSize}px ${scene.decoSize}px`,
                backgroundRepeat: scene.decoFrame ? "no-repeat, repeat" : "repeat",
                maskImage: scene.decoMask,
                WebkitMaskImage: scene.decoMask,
              }}
            />
          )}
          {/* Vignette keeps the reels readable on top of the art */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 100% at 50% 0%, transparent 40%, ${rgbaCss(0.06)} 100%)`,
            }}
          />
          {/* Mascot standee in the cabinet margin (only where there is room) */}
          {assets.characterFramed && (
            <img
              src={assets.characterFramed}
              alt=""
              aria-hidden
              className="pointer-events-none absolute left-[0.6%] top-[34%] hidden w-[7.5%] min-w-[40px] max-w-[110px] select-none object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)] [@container(min-width:760px)]:block"
            />
          )}
        </div>

        {/* Marquee */}
        <div
          /* The cabinet-name strip is decorative, so it yields its height to the reels
           on short viewports. That band is worth ~30px, which on a landscape
           phone is the difference between readable symbols and slivers. */
          className="relative mb-3 hidden shrink-0 items-center justify-between gap-2 rounded-xl border p-2 px-4 text-center [@media(max-height:560px)]:hidden [@media(min-height:561px)]:flex"
          style={{ borderColor: scene.rim, backgroundImage: scene.felt }}
        >
          <span className="hidden text-xs font-bold uppercase tracking-widest sm:inline" style={{ color: t.accent }}>{sel} PAYLINES</span>
          {assets.logo ? (
            <img src={assets.logo} alt={alias} className="h-8 w-auto max-w-[70%] object-contain sm:h-11" />
          ) : (
            <span
              className="text-sm font-bold tracking-widest sm:text-base font-cinzel"
              style={{ color: t.accent, textShadow: `0 0 14px ${scene.rim}` }}
            >
              ★ {t.scene} {t.tagline.toUpperCase()} ★
            </span>
          )}
          <span className="hidden text-xs font-bold uppercase tracking-widest sm:inline" style={{ color: t.accent }}>REAL ENGINE</span>
        </div>

        {/* Reel window — themed felt + soft top light */}
        {/* The felt takes whatever height the cabinet has left (`flex-1 min-h-0`)
            and centres the reels in it. Cells below divide *that* height rather
            than a hardcoded pixel count, so the cabinet scales with the viewport
            instead of overflowing short displays and stranding black bars beside
            a fixed-size reel window on large ones. */}
        <div
          /* `container-type: size` turns this box into the reference for `cqw`/`cqh`
             below, which is what lets the reel grid fit itself to *both* axes:
             see the `min()` on the grid. */
          className="@felt relative mx-auto flex min-h-0 w-full max-h-full flex-1 flex-col justify-center overflow-hidden rounded-xl border-2 [container-type:size]"
          style={{
            borderColor: scene.rim,
            backgroundImage: scene.felt,
            boxShadow: `inset 0 0 40px rgba(0,0,0,0.75), 0 0 30px ${scene.rim}`,
          }}
        >
          

          {/* Pixel-art packs get a faint scanline grid over the felt */}
          {assets.pixelGrid && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 opacity-[0.06]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 4px)",
              }}
            />
          )}

          {/* Big win overlay — gated on `busy` so a burst that was never
              collected cannot sit over the next spin. */}
          {bigWin > 0 && !busy && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-black/80 backdrop-blur-md">
              {assets.bigwinDecor && (
                <img src={assets.bigwinDecor} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60" />
              )}
              {/* Theme-coloured light rays behind the amount */}
              <div
                aria-hidden
                className="bigwin-rays pointer-events-none absolute left-1/2 top-1/2 h-[190%] w-[190%] -translate-x-1/2 -translate-y-1/2 opacity-70"
                style={{
                  backgroundImage: `repeating-conic-gradient(from 0deg, ${t.accent} 0deg 3deg, transparent 3deg 12deg)`,
                  maskImage: "radial-gradient(circle, #fff 12%, transparent 62%)",
                  WebkitMaskImage: "radial-gradient(circle, #fff 12%, transparent 62%)",
                }}
              />
              <div className="relative flex flex-col items-center gap-1">
                {assets.kind === "kemet" && assets.bigwin ? (
                  <img src={assets.bigwin} alt="Big Win" className="w-64 max-w-[75%] sm:w-96" />
                ) : (
                  <>
                    <img src={badgeFor("bigwin", alias)} alt="" className="h-16 w-auto object-contain sm:h-24" />
                    <h2
                      className="-mt-1 text-3xl font-black tracking-wider font-cinzel sm:text-5xl"
                      style={{ color: t.accent, textShadow: `0 0 24px ${t.accent}, 0 4px 12px rgba(0,0,0,0.9)` }}
                    >
                      BIG WIN!
                    </h2>
                  </>
                )}
                <p className="text-slate-300">YOU WON</p>
                <div
                  className="text-4xl font-bold sm:text-5xl font-cinzel"
                  style={{ color: "#fde68a", textShadow: "0 0 18px rgba(251,191,36,0.9)" }}
                >
                  +{bigWin}
                </div>
                <button onClick={() => setBigWin(0)} className="mt-4 rounded-full bg-gradient-to-b from-amber-300 to-yellow-600 px-8 py-3 text-lg font-bold uppercase tracking-wider text-slate-950 shadow-lg transition hover:brightness-110">Collect!</button>
              </div>
            </div>
          )}

          {/* The win is presented by the reel grid and the counters themselves —
              there is no pending amount to act on, so nothing covers the reels
              between spins. */}

          {/* Reel grid — sized by aspect ratio, fitted to whichever axis runs out first.
              `h-full max-w-full` plus an explicit `cols/rows` ratio means the reels
              stay square and the grid is bounded by the smaller of the two
              available dimensions: it can never overflow the felt, and it never
              leaves the window half-empty. Cells then need no height of their own
              — they just divide the grid, which is what makes the cabinet scale
              smoothly instead of snapping to fixed pixel rows. */}
          <div
            /* `min()` over the felt's own container-query dimensions picks the axis
               that binds first, so the grid is always the largest box of this aspect
               ratio that fits — filling a wide display, shrinking on a short one,
               and overflowing neither. Cells are `flex-1` with no height of their
               own, so they follow the grid exactly.

               The one place that rule is wrong is a tall phone held upright: there
               the grid is width-limited, so it ends up much shorter than the felt
               and strands empty felt above and below. There the cells are allowed
               to stretch past the nominal ratio instead, spending the spare height
               on taller reels. Symbols are `object-contain`, so only the gaps
               between them grow — no symbol is ever distorted. */
            className="relative mx-auto flex gap-px p-2 [@media(max-height:560px)]:p-1"
            style={{
              width: `min(100cqw, calc(100cqh * ${cols || 1} / ${rows || 1}))`,
              height: `min(100cqh, calc(100cqw * ${rows || 1} / ${cols || 1}))`,
              // Portrait phones only: tall and narrow, so height is the spare axis.
              ...(portrait ? { height: "100cqh" } : null),
            }}
          >
            {assets.emptyFrame && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={{ backgroundImage: `url(${assets.emptyFrame})`, backgroundSize: "100% 100%" }}
              />
            )}

            {/* Win overlays, inside the grid rather than the felt.
                They are positioned in a 0-100 space derived from `cols`/`rows`,
                so their containing block has to be exactly the box those
                coordinates describe. While this was a sibling of the grid the
                badges and paylines drifted off the reels the moment the grid
                became narrower than the felt — the grid is now sized to fit
                inside the felt, so it usually is. Same box, same maths, aligned. */}
            <svg
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Gated on `busy`: `wins` is published with the grid so the cells
                  can uncover their own tile, which would otherwise draw these
                  lines over reels that are still turning. */}
              {!busy && wins.map((w, i) => (
                <polyline
                  key={i}
                  points={w.xy.map(([x, y]) => `${((x - 0.5) / cols) * 100},${((y - 0.5) / rows) * 100}`).join(" ")}
                  fill="none"
                  stroke={t.accent}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  style={{ filter: `drop-shadow(0 0 5px ${t.accent})` }}
                />
              ))}
            </svg>

            {grid.map((col, c) => (
              <div key={c} className="relative flex min-h-0 flex-1 flex-col gap-px" style={{ borderRight: `1px solid ${scene.rim}` }}>
                {col.map((v, r) => {
                  const idx = c * rows + r;
                  // Winning cells swap to the framed gem tile when the pack has one.
                  const gem = winCells.has(idx) && assets.gemTiles
                    ? assets.gemTiles[v % assets.gemTiles.length]
                    : null;
                  // A multiplier the engine priced onto this cell takes the whole
                  // cell: it *is* the symbol here, which is what makes it native
                  // to the grid rather than a badge hovering over the felt.
                  const tile = multTiles.get(idx);
                  return (
                    <div key={r} ref={(el) => { cellRefs.current[idx] = el; }}
                      className="play-cell relative flex min-h-0 flex-1 items-center justify-center text-2xl sm:text-4xl [@media(max-height:520px)]:text-xl lg:text-5xl"
                      style={{
                        /* The old height was `clamp(64px, 380/rows, 120px)` — a
                           fixed pixel budget that ignored the viewport entirely,
                           which is what left the cabinet pinned to the top-left
                           with dead space beside it. The grid's aspect ratio now
                           owns the geometry and each cell simply divides it, so
                           the cabinet scales with the viewport. The floor keeps
                           a 12-row grid from collapsing into unreadable slivers. */
                        minHeight: "0.75rem",
                        backgroundImage: assets.cellFrame ? `url(${assets.cellFrame})` : undefined,
                        backgroundSize: assets.cellFrame ? "100% 100%" : undefined,
                        backgroundRepeat: "no-repeat",
                        /* The glow is painted by the cell itself, which the
                           tumble does *not* hide — so it is gated on `busy` for
                           the same reason the payline above is. */
                        boxShadow: assets.cellFrame
                          ? gem && !busy
                            ? `0 0 20px ${t.accent}`
                            : undefined
                          : `inset 0 0 22px rgba(0,0,0,0.5)`,
                      }}>
                      {tile ? (
                        <span
                          className="mult-tile block h-full w-full overflow-hidden rounded-lg"
                          data-testid="line-mult"
                        >
                          {tile.art ? (
                            <img
                              src={tile.art}
                              alt={`×${tile.mp} multiplier`}
                              className="h-full w-full object-contain p-1"
                            />
                          ) : (
                            /* No plate for this factor (a pack ships only the tiles
                               it has art for) — legible text rather than dropping
                               a multiplier the engine actually paid. */
                            <span
                              className="flex h-full w-full items-center justify-center rounded-lg border border-amber-300/70 bg-black/70 font-mono text-xl font-black text-amber-300 sm:text-3xl"
                              style={{ textShadow: `0 0 10px ${t.accent}` }}
                            >
                              ×{tile.mp}
                            </span>
                          )}
                        </span>
                      ) : gem ? (
                        <span className="cell-sym block h-full w-full">
                          <img src={gem} alt="" className="h-full w-full object-contain p-1" />
                        </span>
                      ) : (
                        sym(v)
                      )}
                      {/* Rolling layer: GSAP fills this while the reel spins. The
                          cell clips it — see `.play-cell` in globals.css for why a
                          rolling symbol used to appear to slide over the row above. */}
                      <span aria-hidden className="cell-roll" ref={(el) => { rollRefs.current[idx] = el; }} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Console */}
        {/* `shrink-0` keeps the controls at their natural height; without it they
            are the first thing the reel window squeezes on a short viewport. */}
        <div
          /* Wraps by default, because a narrow viewport genuinely needs two rows.
            Only when *height* is scarce — a landscape phone, which is wide enough
            for one row — is it forced onto a single line, since wrapping there
            would cost the reels the vertical room they are short of. */
          className="relative mt-4 flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 pt-4 [@media(max-height:560px)]:flex-nowrap [@media(max-height:560px)]:gap-1 [@media(max-height:560px)]:pt-1"
          style={{ borderTop: `1px solid ${scene.rim}` }}
        >
          <div className="flex min-w-0 flex-nowrap items-center justify-center gap-2 rounded-2xl border p-2 [@media(max-height:560px)]:gap-1 [@media(max-height:560px)]:p-1" style={{ borderColor: scene.rim, backgroundImage: scene.felt }}>
            <ConsoleButton
              tone="neutral"
              title="Lower bet"
              onClick={() => setBet(Math.max(minBet, bet - 1))}
              disabled={busy || bet <= minBet}
              className="h-11 w-11 text-xl [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:w-10 [@media(max-height:560px)]:text-base"
            >
              −
            </ConsoleButton>
            <div className="min-w-[104px] text-center [@media(max-height:560px)]:min-w-[72px]">
              <span className="block text-[9px] font-semibold uppercase text-sky-400/60">Total Bet</span>
              <span data-testid="total-bet" className="block font-mono text-lg font-bold text-sky-300 [@media(max-height:560px)]:text-sm">{totalBet}</span>
              {/* The per-line breakdown is detail, not information: on a short
                  viewport the stake and the balance both matter more. */}
              <span className="hidden text-[9px] text-slate-400/70 [@media(max-height:560px)]:hidden sm:block">{bet} × {lines} lines</span>
            </div>
            <ConsoleButton
              tone="neutral"
              title="Raise bet"
              onClick={() => setBet(bet + 1)}
              disabled={busy}
              className="h-11 w-11 text-xl [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:w-10 [@media(max-height:560px)]:text-base"
            >
              +
            </ConsoleButton>
            {/* Min and Max sit together as the two ends of the same scale, so they
                read as a pair rather than as two unrelated shortcuts. */}
            <ConsoleButton
              tone="blue"
              testId="min-btn"
              title={`Set the lowest stake (${minBet})`}
              onClick={minBetTo}
              disabled={busy || bet <= minBet}
              className="h-11 px-3 text-xs [@media(max-height:560px)]:h-10"
            >
              Min
            </ConsoleButton>
            <ConsoleButton
              tone="amber"
              testId="max-btn"
              title="Max bet"
              onClick={() => setBet(maxBet())}
              disabled={busy || bet >= maxBet()}
              className="h-11 px-3 text-xs [@media(max-height:560px)]:h-10"
            >
              Max
            </ConsoleButton>
          </div>

          <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-center gap-3 [@media(max-height:560px)]:gap-1">
            <ConsoleButton
              tone={auto ? "rose" : "blue"}
              testId="auto-btn"
              title={auto ? "Stop autoplay" : "Autoplay"}
              onClick={() => setAuto(!auto)}
              active={auto}
              className="h-16 min-w-[92px] flex-col gap-0.5 text-xs [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:min-w-[64px] [@media(max-height:560px)]:text-[10px]"
            >
              <span className="text-base leading-none">{auto ? "⏹" : "🔄"}</span>
              <span className="leading-none">{auto ? "Stop" : "Auto"}</span>
            </ConsoleButton>
            <ConsoleButton
              tone="gold"
              emphasis
              testId="spin-btn"
              title="Spin"
              onClick={() => { setAuto(false); void safeSpin(); }}
              disabled={busy}
              className="min-w-[150px] flex-1 px-10 py-4 text-2xl tracking-widest [@media(max-height:560px)]:min-w-[110px] [@media(max-height:560px)]:px-4 [@media(max-height:560px)]:py-3 [@media(max-height:560px)]:text-base"
            >
              {busy ? "…" : "Spin ▶"}
            </ConsoleButton>
          </div>

          <div className="flex gap-2">
            <ConsoleButton
              tone="neutral"
              testId="history-btn"
              title="Spin history"
              onClick={() => setShowHistory(true)}
              className="h-11 w-11 text-base [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:w-10"
            >
              🕘
            </ConsoleButton>
          </div>
        </div>

        {notice && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-center font-bold text-rose-300">
            {notice}
          </div>
        )}
      </div>

      {/* A bare underlined link read as a browser default sitting under a themed
            cabinet. This is the one control a player presses most often, so it
            gets a real plate: the same layered face as the console, at rest. */}
      <Link
        href="/lobby"
        className="nk-btn group relative isolate inline-flex cursor-pointer select-none items-center gap-2 overflow-hidden rounded-2xl border border-sky-400/30 bg-gradient-to-b from-[#4a5da0] to-[#232f5c] px-6 py-3 text-sm font-bold uppercase tracking-wider text-sky-100 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.55),0_0_24px_rgba(56,189,248,0.35)] active:translate-y-0"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.35), 0 3px 0 rgba(10,14,32,0.9), 0 6px 14px rgba(0,0,0,0.5)",
          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-50 transition-transform duration-300 group-hover:translate-x-1/4"
          style={{
            background:
              "linear-gradient(105deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 34%, transparent 64%)",
          }}
        />
        <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">←</span>
        Back to lobby
      </Link>

      {/* Paytable modal */}
      {showPaytable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={() => setShowPaytable(false)}>
          <div className="w-full max-w-3xl rounded-3xl border bg-[#33478a]/92 p-6 backdrop-blur-xl" style={{ borderColor: scene.rim, backgroundImage: scene.cabinet }} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 flex items-center justify-center gap-3 text-2xl font-bold font-cinzel" style={{ color: t.accent }}>
              {assets.logoShort && <img src={assets.logoShort} alt="" className="h-8 w-auto object-contain" />}
              SYMBOL PAYTABLE
            </h2>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
              {(["wild", "scatter", "jackpot", "bonus"] as BadgeKind[]).map((k) => (
                <span key={k} className="flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: scene.rim }}>
                  <img src={badgeFor(k, alias)} alt="" className="h-6 w-auto object-contain" />
                  <span className="text-slate-200/80">{k}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {assets.images.map((src, i) => {
                const isWild = i === assets.wildIndex;
                return (
                  <div key={i}
                    className="relative flex flex-col items-center gap-1 rounded-xl border p-2"
                    style={{
                      borderColor: isWild ? "rgba(250,204,21,0.85)" : scene.rim,
                      boxShadow: isWild ? "0 0 18px rgba(250,204,21,0.35)" : undefined,
                      backgroundImage: assets.cellFrame ? `url(${assets.cellFrame})` : undefined,
                      backgroundSize: assets.cellFrame ? "100% 100%" : undefined,
                    }}
                  >
                    <img src={src} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" style={{ imageRendering: assets.pixelGrid ? "pixelated" : "auto" }} />
                    {isWild && (
                      <img src={badgeFor("wild", alias)} alt="Wild" className="absolute -right-1 -top-1 h-6 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                    )}
                    <span className="text-[9px] uppercase text-sky-200/50">{isWild ? "Wild" : `Symbol ${i + 1}`}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 border-t pt-4 text-xs text-sky-200/60" style={{ borderColor: scene.rim }}>Engine-powered real slot math. Wins pay left-to-right on active lines.</p>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={() => setShowHistory(false)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl border border-sky-500/40 bg-[#33478a]/92 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-sky-300 font-cinzel">SPIN HISTORY</h2>
              <button onClick={() => setShowHistory(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition" title="Close">✕</button>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[60vh]">
              {history.length === 0 ? (
                <p className="py-8 text-center text-sm text-sky-200/50">No spins yet.</p>
              ) : (
                history.map((h, i) => {
                  const won = h.win > 0;
                  const net = h.win - h.bet;
                  return (
                    <div
                      key={i}
                      className={`flex flex-col gap-1 rounded-xl border p-3 transition ${
                        won ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-sky-200/60">{h.time}</span>
                        <span className={`font-bold ${won ? "text-emerald-300" : "text-rose-300"}`}>
                          {won ? `+${h.win}` : `−${h.bet}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-slate-400">
                        <span>Bet: <span className="text-slate-300 font-mono">{h.bet}</span></span>
                        <span>Net: <span className={`font-mono ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{net >= 0 ? "+" : ""}{net}</span></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
