"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LINES, symImg, SYMS } from "@/lib/buffalo";
import type { LocalGame } from "@/lib/games";

const ASSETS = "/assets/african_buffalo_slot_assets";

type SpinResponse = {
  grid: string[][];
  wins: { line: number | null; sym: string; count: number; multiplier: number; amount: number; cells: [number, number][] }[];
  totalWin: number;
  multiplier: number;
  scatters: number;
  feature: boolean;
  spinsLeftAfter: number;
  awarded: number;
  awardedMultiplier: number;
  wallet: number | null;
  bet: number;
};

const BETS = [10, 20, 50, 100, 250, 500];

type HistoryRow = { bet: number; win: number; at: string };

export default function BuffaloCabinet({ uid, game }: { uid: number; game: LocalGame }) {
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [betIdx, setBetIdx] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [winning, setWinning] = useState<Set<string>>(new Set());
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [feature, setFeature] = useState<{ spinsLeft: number; multiplier: number } | null>(null);
  const [message, setMessage] = useState("Spin to start the hunt.");
  const [showPaytable, setShowPaytable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [bigWin, setBigWin] = useState(false);
  const [megaWin, setMegaWin] = useState(false);
  const messageTimer = useRef<number | null>(null);

  const bet = BETS[betIdx];

  const cellKey = (r: number, row: number) => `${r},${row}`;

  const flashMessage = (text: string, ms = 3200) => {
    setMessage(text);
    if (messageTimer.current) window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(""), ms);
  };

  // Load the visit state: the feature round left running, and the live balance.
  useEffect(() => {
    let live = true;
    fetch("/api/game/buffalo/spin")
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setWallet(d.wallet ?? null);
        setFeature(d.feature && d.feature.spinsLeft > 0 ? d.feature : null);
        // A neutral starting grid, spun up. The first real spin replaces it.
        setGrid(Array.from({ length: 5 }, (_, r) => Array.from({ length: 3 }, (_, row) => SYMS[(r * 3 + row) % SYMS.length].id)));
      })
      .catch(() => setMessage("Could not reach the game server."));
    return () => {
      live = false;
    };
  }, []);

  const spin = useCallback(async () => {
    if (spinning) return;
    setSpinning(true);
    setWinning(new Set());
    setLastWin(null);
    setBigWin(false);
    setMegaWin(false);

    try {
      const res = await fetch("/api/game/buffalo/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet }),
      });
      const data = (await res.json()) as SpinResponse & { error?: string };

      if (!res.ok) {
        flashMessage(data.error ?? "Spin refused.");
        setSpinning(false);
        return;
      }

      setGrid(data.grid);
      setWallet(data.wallet ?? null);
      setHistory((h) => [{ bet: data.bet, win: data.totalWin, at: new Date().toLocaleTimeString() }, ...h].slice(0, 12));

      const lit = new Set<string>();
      for (const w of data.wins) for (const [r, row] of w.cells) lit.add(cellKey(r, row));
      setWinning(lit);
      setLastWin(data.totalWin);

      if (data.awarded > 0) {
        flashMessage(`${data.awarded} free spins locked in at x${data.awardedMultiplier}.`);
      }
      // A new round takes the multiplier it was awarded at; a continuing round keeps
      // the one it started with; an exhausted one is gone.
      if (data.awarded > 0) {
        setFeature({ spinsLeft: data.spinsLeftAfter, multiplier: data.awardedMultiplier });
      } else if (data.spinsLeftAfter > 0) {
        setFeature((f) => (f ? { ...f, spinsLeft: data.spinsLeftAfter } : f));
      } else {
        setFeature(null);
      }

      if (data.totalWin >= bet * 20) setBigWin(true);
      if (data.totalWin >= bet * 50) { setMegaWin(true); setBigWin(false); }

      if (data.totalWin > 0) {
        flashMessage(`Won ${data.totalWin.toLocaleString()} coins.`);
      } else if (!(data.awarded > 0)) {
        flashMessage("No line paid. Spin again.", 2500);
      }
    } catch {
      flashMessage("Network hiccup — spin not confirmed.");
    } finally {
      setSpinning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, bet]);

  const featureRound = !!feature && feature.spinsLeft > 0;

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white">
      {/* The two background plates, swapped by the round so free spins feel different. */}
      <img
        src={`${ASSETS}/backgrounds/${featureRound ? "storm_savannah" : "savannah_sunset"}.png`}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={`${ASSETS}/backgrounds/dust_lightning_fx.png`}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-screen animate-pulse"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />

      {/* Top bar: back, title, balance, paytable + history. */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 py-3">
        <Link href="/lobby" className="cursor-pointer rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs font-bold backdrop-blur transition hover:bg-black/60">
          ← Lobby
        </Link>
        <h1 className="text-sm font-black tracking-[0.3em] text-amber-200 drop-shadow">AFRICAN BUFFALO</h1>
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs font-bold backdrop-blur">
          💰 {wallet === null ? "—" : wallet.toLocaleString()}
        </div>
      </header>

      <div className="relative z-20 flex items-center justify-center gap-2 px-4 pb-2">
        <button
          onClick={() => setShowPaytable(true)}
          className="cursor-pointer rounded-xl border border-white/15 bg-black/40 px-4 py-1.5 text-xs font-bold backdrop-blur transition hover:bg-black/60"
        >
          PAYTABLE
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="cursor-pointer rounded-xl border border-white/15 bg-black/40 px-4 py-1.5 text-xs font-bold backdrop-blur transition hover:bg-black/60"
        >
          HISTORY
        </button>
      </div>

      {/* The reel window. */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-3">
        {message && (
          <div className="mb-3 max-w-[90%] rounded-2xl border border-amber-300/30 bg-black/60 px-4 py-2 text-center text-xs font-semibold text-amber-100 backdrop-blur">
            {message}
          </div>
        )}

        <div className="relative w-full max-w-[min(92vw,620px)]">
          <img src={`${ASSETS}/ui/reel_frame.png`} alt="" aria-hidden className="relative z-10 w-full drop-shadow-2xl" />

          {grid && (
            <div
              className="absolute inset-[6%] grid"
              style={{ gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(3, 1fr)" }}
            >
              {Array.from({ length: 5 }, (_, r) =>
                Array.from({ length: 3 }, (_, row) => {
                  const id = grid[r][row];
                  const lit = winning.has(cellKey(r, row));
                  return (
                    <div key={`${r}-${row}`} className="relative flex items-center justify-center">
                      <img
                        src={symImg(id)}
                        alt={id}
                        className={`h-[82%] w-auto object-contain drop-shadow transition-transform ${lit ? "scale-110 brightness-125" : ""} ${spinning ? "spin-drop" : ""}`}
                      />
                      {lit && <span aria-hidden className="absolute inset-1 rounded-xl bg-amber-300/25 ring-2 ring-amber-300/80" />}
                    </div>
                  );
                }),
              )}
            </div>
          )}

          {/* Free spins sit over the reels as long as the round runs. */}
          {featureRound && (
            <div className="absolute -top-4 right-0 z-20 flex items-center gap-2 rounded-full border border-amber-300/50 bg-black/70 px-3 py-1.5 text-[11px] font-black text-amber-200 shadow">
              <img src={`${ASSETS}/ui/free_spins_counter.png`} alt="" className="h-6 w-6 object-cover" />
              {feature.spinsLeft} free · x{feature.multiplier}
            </div>
          )}

          {(bigWin || megaWin) && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <img
                src={`${ASSETS}/ui/${megaWin ? "mega_win_banner" : "big_win_banner"}.png`}
                alt={megaWin ? "Mega win" : "Big win"}
                className="w-[70%] animate-bounce object-contain drop-shadow-[0_0_30px_rgba(255,180,0,0.7)]"
              />
            </div>
          )}
        </div>

        {lastWin !== null && lastWin > 0 && (
          <p className="mt-3 text-2xl font-black text-amber-200 drop-shadow">+{lastWin.toLocaleString()}</p>
        )}
      </main>

      {/* Controls. */}
      <footer className="relative z-20 flex flex-col items-center gap-3 px-4 pb-6">
        <p className="text-[11px] font-semibold tracking-widest text-amber-200/80">{featureRound ? `FREE SPINS — x${feature.multiplier}` : `FEATURE · 3+ scatters`}</p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setBetIdx(Math.max(0, betIdx - 1))}
            disabled={spinning || featureRound}
            className="cursor-pointer rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-xl font-black transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease bet"
          >
            −
          </button>
          <div className="min-w-[86px] rounded-2xl border border-amber-300/40 bg-black/60 px-5 py-3 text-center">
            <p className="text-[10px] tracking-widest text-amber-200/70">BET</p>
            <p className="text-2xl font-black text-amber-100">{bet}</p>
          </div>
          <button
            onClick={() => setBetIdx(Math.min(BETS.length - 1, betIdx + 1))}
            disabled={spinning || featureRound}
            className="cursor-pointer rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-xl font-black transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase bet"
          >
            +
          </button>

          <button
            onClick={spin}
            disabled={spinning}
            className="cursor-pointer rounded-full border-2 border-amber-300/70 bg-gradient-to-b from-amber-400 to-orange-600 px-10 py-5 text-xl font-black tracking-widest text-black shadow-[0_0_30px_rgba(255,150,0,0.5)] transition hover:brightness-110 active:scale-95 disabled:cursor-wait disabled:opacity-60"
          >
            {spinning ? "…" : "SPIN"}
          </button>
        </div>
      </footer>

      {showPaytable && <PaytableModal onClose={() => setShowPaytable(false)} />}
      {showHistory && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowHistory(false)}>
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#141a33] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black tracking-widest text-amber-200">LAST SPINS</h2>
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto text-sm">
              {history.length === 0 && <p className="text-slate-400">No spins yet.</p>}
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                  <span className="font-mono text-slate-300">bet {h.bet}</span>
                  <span className={`font-mono font-bold ${h.win > 0 ? "text-emerald-300" : "text-slate-500"}`}>{h.win > 0 ? `+${h.win}` : "0"}</span>
                  <span className="text-[11px] text-slate-500">{h.at}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-4 w-full cursor-pointer rounded-xl bg-white/10 px-4 py-3 font-bold transition hover:bg-white/20">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaytableModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-[#141a33] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black tracking-widest text-amber-200">PAYTABLE</h2>
        <img src={`${ASSETS}/ui/paytable_panel.png`} alt="" aria-hidden className="absolute -top-3 left-0 w-full opacity-60 pointer-events-none" />

        <div className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {SYMS.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-2 py-1">
              <img src={symImg(s.id)} alt={s.id} className="h-10 w-10 object-contain" />
              <span className="flex-1 text-sm font-bold text-slate-200">{s.wild ? "Wild Buffalo" : s.scatter ? "Sunset Scatter" : s.mult ? `Multiplier x${s.mult}` : s.img.replace("buffalo_", "")}</span>
              <span className="text-right font-mono text-[11px] leading-tight text-slate-300">
                {s.p5 > 0 && <>5× <b>{s.p5}</b><br /></>}
                {s.p4 > 0 && <>4× <b>{s.p4}</b><br /></>}
                {s.p3 > 0 && <>3× <b>{s.p3}</b><br /></>}
                {s.p2 ? <>2× <b>{s.p2}</b></> : null}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-slate-400">
          3+ sunset scatters anywhere trigger free spins. Wild Buffalo replaces every symbol except the
          scatter. Multiplier symbols anywhere on screen multiply the total win of the spin.
        </p>
        <button onClick={onClose} className="mt-3 w-full cursor-pointer rounded-xl bg-white/10 px-4 py-3 font-bold transition hover:bg-white/20">Close</button>
      </div>
    </div>
  );
}
