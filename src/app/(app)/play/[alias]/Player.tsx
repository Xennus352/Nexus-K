"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { logSpin } from "@/server/actions";

const GLYPHS = ["🍒", "🍋", "🍊", "⭐", "💎", "🔔", "7️⃣", "🍇", "♠️", "❤️", "🍀", "👑", "🔔", "🃏", "🌴", "🐬"];
const COLORS = [
  "bg-blue-950/60 border-sky-500/30", "bg-indigo-950/60 border-sky-500/30",
  "bg-sky-950/60 border-sky-500/30", "bg-blue-900/50 border-sky-400/30",
  "bg-cyan-950/60 border-sky-500/30", "bg-slate-900/60 border-blue-500/30",
];

type Grid = number[][];

export default function Player({ uid, alias }: { uid: number; alias: string }) {
  const [gid, setGid] = useState<number | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [wallet, setWallet] = useState<number>(0);
  const [bet, setBet] = useState(1);
  const [sel, setSel] = useState(0);
  const [gain, setGain] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    setMsg("");
    const res = await fetch("/api/engine/slot/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gid, bet }),
    });
    const j = await res.json();
    if (j.what) { setMsg(j.what); setBusy(false); return; }

    const finals: number[][] = j.game.grid;
    const flat: number[] = [];
    finals.forEach((col) => col.forEach((v) => flat.push(v)));
    await Promise.all(
      cellRefs.current.map((cell, i) => shuffle(cell, flat[i], 5 + (i % 3)))
    );
    setGrid(finals);
    setWallet(j.wallet);
    setGain(j.game.gain ?? 0);
    const pay = (j.wins ?? []).reduce((a: number, w: { pay: number }) => a + w.pay, 0);
    if (pay > 0) {
      setMsg(`WIN +${pay}`);
      gsap.fromTo(".play-cell", { scale: 1 }, { scale: 1.12, duration: 0.15, repeat: 3, yoyo: true, stagger: 0.02 });
    } else {
      setMsg("");
    }
    logSpin(alias, bet, pay);
    setBusy(false);
  }

  async function shuffle(cell: HTMLDivElement | null, final: number, steps: number) {
    if (!cell) return;
    for (let i = 0; i < steps; i++) {
      cell.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      await gsap.fromTo(cell, { y: -16 }, { y: 0, duration: 0.07, ease: "power1.out" });
    }
    cell.textContent = GLYPHS[final % GLYPHS.length];
    cell.className = `play-cell flex h-16 w-16 items-center justify-center rounded-xl border text-3xl bg-blue-950/60 border-sky-500/30`;
    await gsap.fromTo(cell, { y: -22, scale: 1.2 }, { y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" });
  }

  async function doubleup() {
    if (busy || gid == null || gain <= 0) return;
    setBusy(true);
    const res = await fetch("/api/engine/slot/doubleup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gid, mult: 2 }),
    });
    const j = await res.json();
    if (!j.what) {
      setGain(j.gain ?? 0);
      setWallet(j.wallet);
      setMsg((j.gain ?? 0) > 0 ? `Doubleup → +${j.gain}` : "Doubleup lost!");
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
    if (!j.what) { setWallet(j.wallet); setGain(0); setMsg("Collected!"); }
  }

  if (error) return <p className="mt-20 text-rose-400">{error}</p>;
  if (!grid) return <p className="mt-20 text-slate-400">Loading {alias}…</p>;

  const rows = grid[0]?.length ?? 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <Link href="/lobby" className="text-sky-400 underline">← Lobby</Link>
        <h1 className="text-2xl font-black text-sky-200">{alias}</h1>
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-1 font-mono text-sky-200">
          💎 {wallet}
        </div>
      </div>

      <div className="rounded-3xl border-2 border-sky-500/40 bg-gradient-to-b from-[#0b173d] to-[#060a1c] p-6 shadow-[0_0_80px_rgba(56,189,248,0.35)]">
        <div className="mb-4 text-center text-xl font-black tracking-[0.5em] text-amber-400">
          JACKPOT
        </div>
        <div className="flex gap-2">
          {grid.map((col, c) => (
            <div key={c} className="flex flex-col gap-2">
              {col.map((v, r) => {
                const idx = c * rows + r;
                return (
                  <div
                    key={r}
                    ref={(el) => { cellRefs.current[idx] = el; }}
                    className={`play-cell flex h-16 w-16 items-center justify-center rounded-xl border text-3xl ${COLORS[v % COLORS.length]}`}
                  >
                    {GLYPHS[v % GLYPHS.length]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="h-6 font-bold text-emerald-400">{msg}</div>
      {gain > 0 && <div className="font-mono text-cyan-300">Gain: {gain}</div>}
      {sel > 0 && <div className="text-xs text-slate-500">{sel} lines</div>}

      <div className="flex items-center gap-2">
        {[1, 2, 5, 10, 25].map((b) => (
          <button key={b} onClick={() => setBet(b)} disabled={busy}
            className={`rounded-lg border px-4 py-2 font-mono ${bet === b ? "border-sky-400 bg-sky-500/20 text-sky-200" : "border-white/10 bg-[#0b1533] text-slate-400"}`}>
            {b}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <button onClick={doSpin} disabled={busy}
          className="rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 px-14 py-4 text-xl font-black tracking-widest text-black shadow-[0_0_30px_rgba(251,191,36,0.5)] transition hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "SPIN"}
        </button>
        {gain > 0 && (
          <>
            <button onClick={doubleup} disabled={busy} className="rounded-2xl border border-sky-500/50 px-6 py-4 font-bold text-sky-300 hover:bg-sky-500/10">
              DOUBLE ×2
            </button>
            <button onClick={collect} disabled={busy} className="rounded-2xl border border-emerald-500/50 px-6 py-4 font-bold text-emerald-300 hover:bg-emerald-500/10">
              COLLECT
            </button>
          </>
        )}
      </div>
    </div>
  );
}
