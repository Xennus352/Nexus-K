"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { spin } from "@/server/actions";

const EMOJI: Record<string, string> = {
  cherry: "🍒", lemon: "🍋", orange: "🍊", star: "⭐",
  diamond: "💎", bell: "🔔", seven: "7️⃣",
};

const BETS = [10, 50, 100, 500];

export default function SlotMachine({ initialBalance }: { initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(100);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState("");
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  async function handleSpin() {
    if (spinning) return;
    setSpinning(true);
    setMessage("");
    const result = await spin(bet);
    if (!result.ok || !result.grid) {
      setMessage(result.error ?? "Error");
      setSpinning(false);
      return;
    }

    // animate each of the 9 cells: quick random shuffles then land on server result
    const finals = result.grid.flat();
    await Promise.all(
      cellRefs.current.map((cell, i) =>
        shuffleCell(cell, EMOJI[finals[i]], 6 + (i % 3) * 2)
      )
    );

    setBalance(result.balance!);
    if ((result.win ?? 0) > 0) {
      setMessage(`WIN ${(result.win! / 100).toFixed(2)}!`);
      gsap.fromTo(
        ".slot-cell",
        { scale: 1 },
        { scale: 1.15, duration: 0.15, repeat: 3, yoyo: true, stagger: 0.03 }
      );
    } else {
      setMessage(`-${(bet / 100).toFixed(2)}`);
    }
    setSpinning(false);
  }

  async function shuffleCell(cell: HTMLDivElement | null, finalEmoji: string, steps: number) {
    if (!cell) return;
    const symbols = Object.values(EMOJI);
    for (let i = 0; i < steps; i++) {
      cell.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      await gsap.fromTo(
        cell,
        { y: -18 },
        { y: 0, duration: 0.08, ease: "power1.out" }
      );
    }
    cell.textContent = finalEmoji;
    await gsap.fromTo(
      cell,
      { y: -24, scale: 1.2 },
      { y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" }
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="rounded-2xl border-4 border-amber-500 bg-zinc-900 p-6 shadow-[0_0_60px_rgba(245,158,11,0.35)]">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="slot-cell flex h-20 w-20 items-center justify-center rounded-lg bg-zinc-950 text-4xl"
              ref={(el) => { cellRefs.current[i] = el; }}
            >
              {EMOJI.cherry}
            </div>
          ))}
        </div>
      </div>

      <div className="text-lg font-mono text-amber-300">
        Balance: ${(balance / 100).toFixed(2)}
      </div>
      <div className="h-6 font-bold text-green-400">{message}</div>

      <div className="flex gap-2">
        {BETS.map((b) => (
          <button
            key={b}
            onClick={() => setBet(b)}
            disabled={spinning}
            className={`rounded-lg px-4 py-2 font-mono ${
              bet === b ? "bg-amber-500 text-black" : "bg-zinc-800 text-amber-300"
            }`}
          >
            ${(b / 100).toFixed(2)}
          </button>
        ))}
      </div>

      <button
        onClick={handleSpin}
        disabled={spinning}
        className="rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-12 py-4 text-xl font-black tracking-widest text-black shadow-lg disabled:opacity-50"
      >
        {spinning ? "SPINNING..." : "SPIN"}
      </button>
    </div>
  );
}
