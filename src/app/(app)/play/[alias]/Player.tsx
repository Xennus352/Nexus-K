"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import confetti from "canvas-confetti";
import { logSpin } from "@/server/actions";
import { themeFor, assetFor } from "@/lib/theme";
import Loader from "@/components/Loader";

type Grid = number[][];
type Win = { pay: number; sym: number; num: number; li: number; xy: [number, number][] };

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

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/engine/game/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid: 1, uid, alias }),
      });
      const j = await res.json();
      if (j.what) { setError(j.what); return; }
      setGid(j.gid);
      setGrid(j.game.grid);
      setWallet(j.wallet);
      setBet(j.game.bet ?? 1);
      setSel(j.game.sel ?? 0);
    })();
  }, [uid, alias]);

  async function doSpin() {
    if (busy || gid == null) return;
    setBusy(true);
    setWins([]);
    if (soundOn) audio.reelStop();
    const res = await fetch("/api/engine/slot/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gid, bet }),
    });
    const j = await res.json();
    if (j.what) { setBusy(false); setAuto(false); setNotice(`⚠️ ${j.what}`); return; }

    const finals: Grid = j.game.grid;
    const flat: number[] = [];
    finals.forEach((col) => col.forEach((v) => flat.push(v)));
    const htmlFor = (v: number) => assets
      ? `<img src="${assets.images[v % assets.images.length]}" alt="" class="h-full w-full object-contain p-1" />`
      : t.symbols[v % t.symbols.length];
    await Promise.all(cellRefs.current.map((c, i) =>
      shuffleCell(c, flat[i], 5 + (i % 3), assets.images.length, htmlFor, () => { if (soundOn && Math.random() < 0.3) audio.spinTick(); })
    ));
    if (soundOn) audio.reelStop();

    setGrid(finals);
    setWallet(j.wallet);
    setGain(j.game.gain ?? 0);
    const pay = (j.wins ?? []).reduce((a: number, w: Win) => a + w.pay, 0);
    setLastWin(pay);
    setWins(j.wins ?? []);
    if (pay > 0) {
      if (soundOn) audio.win();
      gsap.fromTo(".play-cell", { scale: 1 }, { scale: 1.12, duration: 0.15, repeat: 3, yoyo: true, stagger: 0.02 });
      if (pay >= bet * 5) {
        setBigWin(pay);
        try { confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } }); } catch { /* non-fatal */ }
      }
    }
    setHistory((h) => [{ bet, win: pay, time: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
    logSpin(alias, bet, pay);
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

  async function doubleup() {
    if (busy || gid == null || gain <= 0) return;
    setBusy(true);
    const res = await fetch("/api/engine/slot/doubleup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gid, mult: 2 }),
    });
    const j = await res.json();
    if (j.what) { setNotice(`⚠️ ${j.what}`); setBusy(false); return; }
    if (!j.what) {
      setGain(j.gain ?? 0);
      setWallet(j.wallet);
      setLastWin((j.gain ?? 0) > 0 ? j.gain : 0);
    }
    setBusy(false);
  }

  async function collect() {
    if (gid == null) return;
    const res = await fetch("/api/engine/slot/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gid }),
    });
    const j = await res.json();
    if (j.what) { setNotice(`⚠️ ${j.what}`); return; }
    setWallet(j.wallet); setGain(0); setNotice("");
  }

  if (error) return <p className="mt-20 text-rose-400">{error}</p>;
  if (!grid) return <Loader label={`DEALING ${alias.toUpperCase()}…`} />;

  const cols = grid.length;
  const rows = grid[0]?.length ?? 0;
  const sym = (v: number) => assets
    ? <img src={assets.images[v % assets.images.length]} alt="" className="h-full w-full object-contain p-1" />
    : t.symbols[v % t.symbols.length];

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-5 text-white">
      {/* Header bar */}
      <header className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/25 bg-[#263259]/70 p-3 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] sm:gap-4 sm:p-4">
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
            <span className="block truncate font-mono text-base font-bold text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)] sm:text-xl">💎 {wallet.toLocaleString()}</span>
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-sky-500/30 bg-black/60 px-2 py-1.5 text-center sm:min-w-[130px] sm:flex-none sm:px-4 sm:py-2">
            <span className="block text-[10px] font-semibold uppercase text-emerald-400/70">Last Win</span>
            <span className="block truncate font-mono text-base font-bold text-emerald-400 sm:text-xl">+{lastWin}</span>
          </div>
          <button onClick={() => setShowPaytable(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20" title="Paytable">☰</button>
          <button onClick={() => setSoundOn(!soundOn)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20" title="Sound">{soundOn ? "🔊" : "🔇"}</button>
        </div>
      </header>

      {/* Machine frame */}
      <div
        className="relative w-full overflow-hidden rounded-3xl border-2 border-sky-500/40 bg-gradient-to-b from-slate-900/60 via-slate-950/80 to-black p-3 shadow-2xl sm:p-6"
        style={assets.bg
          ? { backgroundImage: `linear-gradient(rgba(3,7,18,0.82), rgba(2,4,10,0.94)), url(${assets.bg})`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined}
      >
        {/* Marquee */}
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-gradient-to-r from-blue-950/70 via-black to-blue-950/70 p-2 px-4 text-center">
          <span className="hidden text-xs font-bold uppercase tracking-widest text-sky-200/80 sm:inline">{sel} PAYLINES</span>
          {assets.logo ? (
            <img src={assets.logo} alt={alias} className="h-8 w-auto max-w-[70%] object-contain sm:h-11" />
          ) : (
            <span className="text-sm font-bold tracking-widest text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.8)] sm:text-base font-cinzel">
              ★ {t.scene} {t.tagline.toUpperCase()} ★
            </span>
          )}
          <span className="hidden text-xs font-bold uppercase tracking-widest text-sky-200/80 sm:inline">REAL ENGINE</span>
        </div>

        {/* Reel window */}
        <div className="relative w-full overflow-hidden rounded-xl border-2 border-sky-500/50 bg-black shadow-[inset_0_0_30px_rgba(0,0,0,0.95),0_0_25px_rgba(56,189,248,0.2)]">
          {/* payline SVG overlay */}
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {wins.map((w, i) => (
              <polyline
                key={i}
                points={w.xy.map(([x, y]) => `${((x - 0.5) / cols) * 100},${((y - 0.5) / rows) * 100}`).join(" ")}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 4px #f59e0b)" }}
              />
            ))}
          </svg>

          {/* Big win overlay */}
          {bigWin > 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-black/80 backdrop-blur-md">
              {assets.bigwinDecor && (
                <img src={assets.bigwinDecor} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60" />
              )}
              <div className="relative flex flex-col items-center gap-1">
                {assets.kind === "kemet" && assets.bigwin ? (
                  <img src={assets.bigwin} alt="Big Win" className="w-64 max-w-[75%] sm:w-96" />
                ) : (
                  <h2 className="bg-gradient-to-br from-sky-200 via-sky-400 to-blue-600 bg-clip-text text-4xl font-black tracking-wider text-transparent sm:text-6xl font-cinzel">BIG WIN!</h2>
                )}
                <p className="text-slate-300">YOU WON</p>
                <div className="text-4xl font-bold text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)] sm:text-5xl font-cinzel">+{bigWin}</div>
                <button onClick={() => setBigWin(0)} className="mt-4 rounded-full bg-gradient-to-b from-amber-300 to-yellow-600 px-8 py-3 text-lg font-bold uppercase tracking-wider text-slate-950 shadow-lg transition hover:brightness-110">Collect!</button>
              </div>
            </div>
          )}

          <div className="flex gap-px p-2">
            {grid.map((col, c) => (
              <div key={c} className="flex flex-1 flex-col gap-px border-r border-sky-500/15 last:border-r-0">
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
        <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-sky-500/20 pt-4 lg:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-sky-500/30 bg-black/60 p-2">
            <button onClick={() => setBet(Math.max(1, bet - 1))} disabled={busy} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/20 text-sky-300 transition active:scale-95 disabled:opacity-40">−</button>
            <div className="min-w-[90px] text-center">
              <span className="block text-[9px] font-semibold uppercase text-sky-400/60">Total Bet</span>
              <span className="font-mono text-lg font-bold text-sky-300">{bet}</span>
            </div>
            <button onClick={() => setBet(bet + 1)} disabled={busy} className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/20 text-sky-300 transition active:scale-95 disabled:opacity-40">+</button>
            <button onClick={() => setBet(25)} disabled={busy} className="rounded-xl border border-sky-500/50 bg-sky-600/30 px-3 py-2 text-xs font-bold uppercase tracking-wider text-sky-300">Max</button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => setAuto(!auto)} className={`flex min-w-[90px] flex-col items-center gap-1 rounded-2xl border px-4 py-4 text-xs font-bold uppercase tracking-wider transition ${auto ? "border-sky-300 bg-sky-600/50 text-white" : "border-sky-500/40 bg-sky-900/30 text-sky-200"}`}>
              <span className="text-base">🔄</span><span>{auto ? "Stop" : "Auto"}</span>
            </button>
            <button onClick={() => { setAuto(false); void safeSpin(); }} disabled={busy}
              className="flex-1 rounded-2xl bg-gradient-to-b from-sky-300 via-sky-400 to-blue-600 px-10 py-4 text-2xl font-black uppercase tracking-widest text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.5)] transition hover:brightness-110 disabled:opacity-50">
              {busy ? "…" : "Spin ▶"}
            </button>
          </div>

          <button onClick={() => setShowHistory(true)} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-sky-300">History</button>
        </div>

        {gain > 0 && (
          <div className="mt-3 flex items-center justify-center gap-4 text-sm">
            <span className="font-mono text-cyan-300">Gain: {gain}</span>
            <button onClick={doubleup} disabled={busy} className="rounded-lg border border-sky-500/50 px-4 py-1.5 font-bold text-sky-300 hover:bg-sky-500/10">Double ×2</button>
            <button onClick={collect} disabled={busy} className="rounded-lg border border-emerald-500/50 px-4 py-1.5 font-bold text-emerald-300 hover:bg-emerald-500/10">Collect</button>
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
          <div className="w-full max-w-3xl rounded-3xl border border-sky-500/40 bg-[#263259]/90 p-6 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-6 text-center text-2xl font-bold text-sky-300 font-cinzel">SYMBOL PAYTABLE</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {assets.images.map((src, i) => (
                <div key={i}
                  className="flex flex-col items-center gap-1 rounded-xl border border-sky-500/15 bg-black/50 p-2"
                  style={assets.cellFrame ? { backgroundImage: `url(${assets.cellFrame})`, backgroundSize: "100% 100%" } : undefined}
                >
                  <img src={src} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
                  <span className="text-[9px] uppercase text-sky-200/50">{i === assets.wildIndex ? "Wild" : `Symbol ${i + 1}`}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 border-t border-sky-500/30 pt-4 text-xs text-sky-200/60">Engine-powered real slot math. Wins pay left-to-right on active lines.</p>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={() => setShowHistory(false)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl border border-sky-500/40 bg-[#263259]/90 p-6" onClick={(e) => e.stopPropagation()}>
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
