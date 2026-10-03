"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { logSpin } from "@/server/actions";

const GLYPHS = ["🍒", "🍋", "🍊", "⭐", "💎", "🔔", "7️⃣", "🍇", "♠️", "❤️", "🍀", "👑", "🔔", "🃏", "🌴", "🐬"];
const COLORS = [
  "bg-red-900/60", "bg-yellow-900/60", "bg-orange-900/60", "bg-amber-900/60",
  "bg-cyan-900/60", "bg-green-900/60", "bg-violet-900/60", "bg-pink-900/60",
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
    // animate columns with a quick shuffle, landing on the server grid
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
    cell.className = `play-cell flex h-16 w-16 items-center justify-center rounded-lg text-3xl ${COLORS[final % COLORS.length]}`;
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

  if (error) return <p className="mt-20 text-red-400">{error}</p>;
  if (!grid) return <p className="mt-20 text-zinc-400">Loading {alias}…</p>;

  const rows = grid[0]?.length ?? 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <Link href="/lobby" className="text-amber-400 underline">← Lobby</Link>
        <h1 className="text-2xl font-black text-amber-300">{alias}</h1>
        <div className="font-mono text-amber-200">Wallet: {wallet}</div>
      </div>

      <div className="rounded-2xl border-4 border-amber-500 bg-zinc-900 p-5 shadow-[0_0_60px_rgba(245,158,11,0.3)]">
        <div className="flex gap-2">
          {grid.map((col, c) => (
            <div key={c} className="flex flex-col gap-2">
              {col.map((v, r) => {
                const idx = c * rows + r;
                return (
                  <div
                    key={r}
                    ref={(el) => { cellRefs.current[idx] = el; }}
                    className={`play-cell flex h-16 w-16 items-center justify-center rounded-lg text-3xl ${COLORS[v % COLORS.length]}`}
                  >
                    {GLYPHS[v % GLYPHS.length]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="h-6 font-bold text-green-400">{msg}</div>
      {gain > 0 && <div className="font-mono text-cyan-300">Gain: {gain}</div>}
      {sel > 0 && <div className="text-xs text-zinc-500">{sel} lines</div>}

      <div className="flex items-center gap-2">
        {[1, 2, 5, 10, 25].map((b) => (
          <button key={b} onClick={() => setBet(b)} disabled={busy}
            className={`rounded-lg px-4 py-2 font-mono ${bet === b ? "bg-amber-500 text-black" : "bg-zinc-800 text-amber-300"}`}>
            {b}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <button onClick={doSpin} disabled={busy}
          className="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-12 py-4 text-xl font-black tracking-widest text-black shadow-lg disabled:opacity-50">
          {busy ? "…" : "SPIN"}
        </button>
        {gain > 0 && (
          <>
            <button onClick={doubleup} disabled={busy} className="rounded-xl border border-cyan-500 px-6 py-4 font-bold text-cyan-300">
              DOUBLE ×2
            </button>
            <button onClick={collect} disabled={busy} className="rounded-xl border border-green-500 px-6 py-4 font-bold text-green-300">
              COLLECT
            </button>
          </>
        )}
      </div>
    </div>
  );
}
