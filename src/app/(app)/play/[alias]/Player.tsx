"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import confetti from "canvas-confetti";
import { logSpin } from "@/server/actions";
import {
  themeFor, assetFor, sceneFor, buttonsFor, multArt, MULTIPLIERS,
  badgeFor, type BadgeKind, type Multiplier,
} from "@/lib/theme";
import Loader from "@/components/Loader";

type Grid = number[][];
type Win = { pay: number; sym: number; num: number; li: number; xy: [number, number][] };

/**
 * Shape of an engine reply. `what` carries the engine's error message when set;
 * the remaining fields are present on a successful call.
 */
type EngineReply = {
  what?: string;
  /** Engine replied with no payload (e.g. a successful collect). */
  empty?: boolean;
  gid: number;
  /**
   * Games built on the generic grid type answer with `{ grid }` only — the
   * engine's marshaller swallows the sibling bet/sel fields — so they are
   * optional here and fetched separately when missing.
   */
  game: { grid?: unknown; gain?: number; bet?: number; sel?: number };
  sel?: number;
  bet?: number;
  wallet: number;
  gain: number;
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

class SoundFX {
  ctx: AudioContext | null = null;
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  blip(freq: number, dur: number, vol = 0.2, type: OscillatorType = "sine") {
    this.init();
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq / 2), this.ctx!.currentTime + dur);
    gain.gain.setValueAtTime(vol, this.ctx!.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx!.currentTime + dur);
    osc.connect(gain); gain.connect(this.ctx!.destination);
    osc.start(); osc.stop(this.ctx!.currentTime + dur);
  }
  spinTick() { this.blip(120, 0.08, 0.12, "triangle"); }
  reelStop() { this.blip(220, 0.1, 0.25); }
  win() {
    const now = this.ctx?.currentTime ?? 0;
    [261.63, 329.63, 392.0, 523.25, 659.25].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.3, 0.2, "triangle"), i * 80);
    });
    void now;
  }
}

const audio = new SoundFX();

/** Night scrim with a variable alpha, used for vignettes over the cabinet art. */
function rgbaCss(alpha: number): string {
  return `rgba(4, 6, 14, ${alpha})`;
}

/**
 * A control drawn on the real button plate art from public/assets/buttons.
 * The plate sits behind the label with a soft scrim so text stays readable
 * whatever the plate art looks like.
 */
function Plate({
  art, label, title, onClick, disabled, active, testId, className = "", children,
}: {
  art: string;
  label?: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={title ?? label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`relative isolate flex items-center justify-center overflow-hidden rounded-2xl transition active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${
        active ? "ring-2 ring-white/70" : "hover:brightness-110"
      } ${className}`}
    >
      <img src={art} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.42))" }}
      />
      <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">{children ?? label}</span>
    </button>
  );
}

async function shuffleCell(
  cell: HTMLDivElement | null,
  final: number,
  steps: number,
  count: number,
  htmlFor: (v: number) => string,
  onTick: () => void
) {
  if (!cell) return;
  for (let i = 0; i < steps; i++) {
    cell.innerHTML = htmlFor(Math.floor(Math.random() * count));
    onTick();
    await gsap.fromTo(cell, { y: -16 }, { y: 0, duration: 0.07, ease: "power1.out" });
  }
  cell.innerHTML = htmlFor(final);
  await gsap.fromTo(cell, { y: -22, scale: 1.2 }, { y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" });
}

export default function Player({ uid, alias }: { uid: number; alias: string }) {
  const t = themeFor(alias);
  const assets = assetFor(alias);
  const [gid, setGid] = useState<number | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [wallet, setWallet] = useState(0);
  const [bet, setBet] = useState(1);
  const [sel, setSel] = useState(0);
  const [gain, setGain] = useState(0);
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
  const machineRef = useRef<HTMLDivElement | null>(null);
  // Background art depends on the reel count, which is only known after the first deal.
  const cols = grid?.length ?? 5;
  const ready = grid !== null;
  const scene = useMemo(() => sceneFor(alias, cols), [alias, cols]);
  const buttons = useMemo(() => buttonsFor(alias), [alias]);

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
      setWallet(j.wallet);
      if (typeof j.game.bet === "number") setBet(j.game.bet);
      if (typeof j.game.sel === "number") setSel(j.game.sel);
      // Generic-grid games omit bet/sel from the deal, so read them back.
      const [sb, bb] = await Promise.all([enginePost("slot/sel/get", { gid: j.gid }), enginePost("slot/bet/get", { gid: j.gid })]);
      if (typeof sb?.sel === "number" && sb.sel > 0) setSel(sb.sel);
      if (typeof bb?.bet === "number" && bb.bet > 0) setBet(bb.bet);
    })();
  }, [uid, alias]);

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
    const j = await enginePost("slot/spin", { gid, bet });
    const finals = decodeGrid(j?.game?.grid);
    if (!j || j.what || finals.length === 0) { setBusy(false); setAuto(false); setNotice(`⚠️ ${j?.what ?? "engine returned no data"}`); return; }

    const flat: number[] = [];
    finals.forEach((col) => col.forEach((v) => flat.push(v)));
    const px = assets.pixelGrid ? ' style="image-rendering:pixelated"' : "";
    const htmlFor = (v: number) =>
      `<img src="${assets.images[v % assets.images.length]}" alt="" class="h-full w-full object-contain p-1"${px} />`;
    await Promise.all(cellRefs.current.map((c, i) =>
      shuffleCell(c, flat[i], 5 + (i % 3), assets.images.length, htmlFor, () => { if (soundOn && Math.random() < 0.3) audio.spinTick(); })
    ));
    if (soundOn) audio.reelStop();

    setGrid(finals);
    setWallet(j.wallet);
    setGain(j.game.gain ?? j.gain ?? 0);
    if (typeof j.game.bet === "number" && j.game.bet > 0) setBet(j.game.bet);
    if (typeof j.game.sel === "number" && j.game.sel > 0) setSel(j.game.sel);
    const pay = (j.wins ?? []).reduce((a: number, w: Win) => a + w.pay, 0);
    setLastWin(pay);
    setWins(j.wins ?? []);
    if (pay > 0) {
      if (soundOn) audio.win();
      gsap.fromTo(".play-cell", { scale: 1 }, { scale: 1.12, duration: 0.15, repeat: 3, yoyo: true, stagger: 0.02 });
      if (pay >= Math.max(stake * 5, 20)) {
        setBigWin(pay);
        try { confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } }); } catch { /* non-fatal */ }
      }
    }
    setHistory((h) => [{ bet: stake, win: pay, time: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
    logSpin(alias, stake, pay);
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
   * Gamble ladder. The engine wagers the whole pending gain against the
   * chosen multiplier (1 < mult <= 10) and only pays out when the balance can
   * cover `gain × mult`, so multipliers we cannot cover are disabled in the UI.
   */
  async function gamble(mult: Multiplier) {
    if (busy || gid == null || gain <= 0) return;
    if (wallet < gain * mult) {
      setNotice(`⚠️ ×${mult} needs ${gain * mult} in your balance to gamble`);
      return;
    }
    setBusy(true);
    const risk = gain;
    const j = await enginePost("slot/doubleup", { gid, mult });
    if (!j || j.what || j.gain == null) { setNotice(`⚠️ ${j?.what ?? "engine returned no result"}`); setBusy(false); return; }
    const won = (j.gain ?? 0) > risk;
    setGain(j.gain ?? 0);
    setWallet(j.wallet);
    setLastWin(j.gain ?? 0);
    setNotice(won ? `🎉 Won ×${mult}! ${risk} → ${j.gain}` : `💔 Lost the gamble — ${risk} staked`);
    if (soundOn) audio.blip(won ? 880 : 160, 0.3, 0.22, won ? "triangle" : "sawtooth");
    setBusy(false);
  }

  async function collect() {
    if (gid == null) return;
    // Collect only clears the pending gamble state; the engine answers with a
    // bare `null` on success, so an empty reply means "done", not "failed".
    const j = await enginePost("slot/collect", { gid });
    if (j?.what) { setNotice(`⚠️ ${j.what}`); return; }
    if (typeof j?.wallet === "number") setWallet(j.wallet);
    setGain(0);
    setNotice("");
  }

  if (error) return <p className="mt-20 text-rose-400">{error}</p>;
  if (!grid) return <Loader label={`DEALING ${alias.toUpperCase()}…`} />;

  const rows = grid[0]?.length ?? 0;
  // The engine charges the bet per line, so the real stake is bet × active lines.
  const lines = sel || 1;
  const totalBet = bet * lines;
  const maxBet = () => Math.max(1, Math.floor(wallet / lines));
  const sym = (v: number) => <img
    src={assets.images[v % assets.images.length]}
    alt=""
    className="h-full w-full object-contain p-1"
    style={assets.pixelGrid ? { imageRendering: "pixelated" } : undefined}
  />;

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-5 text-white">
      {/* Header bar */}
      <header className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/25 bg-[#3b4f96]/75 p-3 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] sm:gap-4 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-sky-600 to-sky-300 shadow-lg shadow-sky-500/30">
            {assets.character
              ? <img src={assets.character} alt="" className="h-full w-full rounded-full object-contain" />
              : <span className="text-xl">👑</span>}
          </div>
          <div className="min-w-0">
            <h1 className="truncate bg-gradient-to-br from-sky-200 via-sky-400 to-blue-600 bg-clip-text text-base font-black tracking-wider text-transparent sm:text-xl font-cinzel">
              {alias.toUpperCase()}
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-sky-200/50">Nexus-K Luxury Slots</p>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
          <div className="min-w-0 flex-1 rounded-xl border border-sky-500/30 bg-black/60 px-2 py-1.5 text-center sm:min-w-[130px] sm:flex-none sm:px-4 sm:py-2">
            <span className="block text-[10px] font-semibold uppercase text-sky-400/70">Balance</span>
            <span data-testid="game-balance" className="block truncate font-mono text-base font-bold text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)] sm:text-xl">💎 {wallet.toLocaleString()}</span>
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-sky-500/30 bg-black/60 px-2 py-1.5 text-center sm:min-w-[130px] sm:flex-none sm:px-4 sm:py-2">
            <span className="block text-[10px] font-semibold uppercase text-emerald-400/70">Last Win</span>
            <span className="block truncate font-mono text-base font-bold text-emerald-400 sm:text-xl">+{lastWin}</span>
          </div>
          <button onClick={() => setShowPaytable(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20" title="Paytable">☰</button>
          <button onClick={() => setSoundOn(!soundOn)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20" title="Sound">{soundOn ? "🔊" : "🔇"}</button>
        </div>
      </header>

      {/* Machine frame — themed cabinet with drifting aurora glow, never flat black */}
      <div
        ref={machineRef}
        data-scene={scene.style}
        className="relative w-full overflow-hidden rounded-3xl border-2 p-4 shadow-2xl sm:p-8"
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
        </div>

        {/* Marquee */}
        <div
          className="relative mb-3 flex items-center justify-between gap-2 rounded-xl border p-2 px-4 text-center"
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
        <div
          className="relative w-full overflow-hidden rounded-xl border-2"
          style={{
            borderColor: scene.rim,
            backgroundImage: scene.felt,
            boxShadow: `inset 0 0 40px rgba(0,0,0,0.75), 0 0 30px ${scene.rim}`,
          }}
        >
          {/* payline SVG overlay */}
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {wins.map((w, i) => (
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

          {/* Big win overlay */}
          {bigWin > 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-black/80 backdrop-blur-md">
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

          <div className="relative flex gap-px p-2">
            {grid.map((col, c) => (
              <div key={c} className="flex flex-1 flex-col gap-px" style={{ borderRight: `1px solid ${scene.rim}` }}>
                {col.map((v, r) => {
                  const idx = c * rows + r;
                  return (
                    <div key={r} ref={(el) => { cellRefs.current[idx] = el; }}
                      className="play-cell flex items-center justify-center text-4xl sm:text-5xl"
                      style={{
                        height: `clamp(64px, ${380 / rows}px, 120px)`,
                        backgroundImage: assets.cellFrame ? `url(${assets.cellFrame})` : undefined,
                        backgroundSize: assets.cellFrame ? "100% 100%" : undefined,
                        backgroundRepeat: "no-repeat",
                        boxShadow: assets.cellFrame ? undefined : `inset 0 0 22px rgba(0,0,0,0.5)`,
                      }}>
                      {sym(v)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Console */}
        <div className="relative mt-4 flex flex-col items-center justify-between gap-4 pt-4 lg:flex-row" style={{ borderTop: `1px solid ${scene.rim}` }}>
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border p-2" style={{ borderColor: scene.rim, backgroundImage: scene.felt }}>
            <Plate art={buttons.minus} title="Lower bet" onClick={() => setBet(Math.max(1, bet - 1))} disabled={busy} className="h-11 w-11 text-xl font-black">
              −
            </Plate>
            <div className="min-w-[104px] text-center">
              <span className="block text-[9px] font-semibold uppercase text-sky-400/60">Total Bet</span>
              <span data-testid="total-bet" className="font-mono text-lg font-bold text-sky-300">{totalBet}</span>
              <span className="block text-[9px] text-slate-400/70">{bet} × {lines} lines</span>
            </div>
            <Plate art={buttons.plus} title="Raise bet" onClick={() => setBet(bet + 1)} disabled={busy} className="h-11 w-11 text-xl font-black">
              +
            </Plate>
            <Plate art={buttons.keep} title="Max bet" onClick={() => setBet(maxBet())} disabled={busy} className="h-11 px-4 text-xs font-black uppercase tracking-wider">
              Max
            </Plate>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-3">
            <Plate
              art={buttons.auto}
              testId="auto-btn"
              title={auto ? "Stop autoplay" : "Autoplay"}
              onClick={() => setAuto(!auto)}
              active={auto}
              className="h-16 min-w-[92px] flex-col gap-0.5 text-xs font-black uppercase tracking-wider"
            >
              <span className="text-base leading-none">{auto ? "⏹" : "🔄"}</span>
              <span className="leading-none">{auto ? "Stop" : "Auto"}</span>
            </Plate>
            <Plate
              art={buttons.spin}
              testId="spin-btn"
              title="Spin"
              onClick={() => { setAuto(false); void safeSpin(); }}
              disabled={busy}
              className="min-w-[150px] flex-1 px-10 py-4 text-2xl font-black uppercase tracking-widest"
            >
              {busy ? "…" : "Spin ▶"}
            </Plate>
          </div>

          <div className="flex gap-2">
            <Plate art={buttons.menu} title="Spin history" onClick={() => setShowHistory(true)} className="h-11 w-11 text-base">
              🕘
            </Plate>
          </div>
        </div>

        {gain > 0 && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <span data-testid="gamble-amount" className="font-mono text-cyan-300">Gamble {gain}</span>
              {MULTIPLIERS.map((m) => {
                const art = multArt(m);
                const affordable = wallet >= gain * m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-testid={m === 2 ? "double-btn" : `gamble-${m}x`}
                    onClick={() => gamble(m)}
                    disabled={busy || !affordable}
                    title={
                      affordable
                        ? `Gamble for ×${m} — risks ${gain}, wins ${gain * m}`
                        : `×${m} needs ${gain * m} in your balance`
                    }
                    className="relative h-12 w-[68px] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <img src={art} alt={`Gamble ×${m}`} className="absolute inset-0 h-full w-full object-contain" />
                  </button>
                );
              })}
              <Plate art={buttons.keep} testId="collect-btn" title="Collect the win" onClick={collect} disabled={busy} className="h-12 px-5 text-sm font-black uppercase tracking-wider">
                Keep
              </Plate>
            </div>
            <p className="text-[11px] text-slate-400/70">Win is already in your balance — gamble it or keep it.</p>
          </div>
        )}

        {notice && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-center font-bold text-rose-300">
            {notice}
          </div>
        )}
      </div>

      <Link href="/lobby" className="text-sm text-sky-400 underline">← Back to lobby</Link>

      {/* Paytable modal */}
      {showPaytable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={() => setShowPaytable(false)}>
          <div className="w-full max-w-3xl rounded-3xl border bg-[#33478a]/92 p-6 backdrop-blur-xl" style={{ borderColor: scene.rim, backgroundImage: scene.cabinet }} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-center text-2xl font-bold font-cinzel" style={{ color: t.accent }}>SYMBOL PAYTABLE</h2>
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
            <h2 className="mb-4 text-center text-2xl font-bold text-sky-300 font-cinzel">SPIN HISTORY</h2>
            <div className="space-y-2 overflow-y-auto">
              {history.length === 0 && <p className="py-4 text-center text-sm text-sky-200/50">No spins yet.</p>}
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-sky-500/10 bg-black/40 p-2 text-xs">
                  <span className="text-sky-200/60">{h.time}</span>
                  <span className="text-slate-300">Bet: {h.bet}</span>
                  <span className={h.win > 0 ? "font-bold text-emerald-400" : "text-slate-500"}>{h.win > 0 ? `+${h.win}` : "0"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
