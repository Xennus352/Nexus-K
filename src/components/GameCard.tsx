"use client";

import Link from "next/link";

const COVERS = [
  "from-fuchsia-600/70 to-purple-900",
  "from-amber-500/70 to-red-900",
  "from-emerald-500/70 to-teal-900",
  "from-sky-500/70 to-blue-900",
  "from-rose-500/70 to-rose-900",
  "from-violet-500/70 to-indigo-900",
];

const GEMS = ["💎", "🎰", "🍒", "👑", "7️⃣", "⭐", "🍀", "🐉"];

export type GameCardData = {
  prov: string;
  name: string;
  sx: number;
  sy: number;
  rtp?: number[];
};

export default function GameCard({ g }: { g: GameCardData }) {
  let h = 0;
  for (const ch of g.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const alias = encodeURIComponent(`${g.prov}/${g.name}`);
  return (
    <Link
      href={`/play/${alias}`}
      className="game-card group block overflow-hidden rounded-2xl border border-white/5 bg-[#0b1533] transition hover:-translate-y-1 hover:border-sky-400/50 hover:shadow-[0_8px_30px_rgba(56,189,248,0.25)]"
    >
      <div className={`flex h-28 items-center justify-center bg-gradient-to-br ${COVERS[h % COVERS.length]} text-5xl transition group-hover:scale-110`}>
        {GEMS[h % GEMS.length]}
      </div>
      <div className="p-3">
        <div className="truncate font-bold leading-tight">{g.name}</div>
        <div className="text-xs text-slate-500">{g.prov}</div>
        <div className="mt-2 text-[11px] text-sky-400">
          {g.sx}×{g.sy}{g.rtp ? ` · RTP up to ${Math.max(...g.rtp).toFixed(0)}%` : ""}
        </div>
      </div>
    </Link>
  );
}
