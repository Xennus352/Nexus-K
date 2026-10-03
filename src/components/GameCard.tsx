"use client";

import Link from "next/link";
import { themeFor } from "@/lib/theme";

export type GameCardData = {
  prov: string;
  name: string;
  sx: number;
  sy: number;
  rtp?: number[];
};

export default function GameCard({ g }: { g: GameCardData }) {
  const t = themeFor(`${g.prov}/${g.name}`);
  const alias = encodeURIComponent(`${g.prov}/${g.name}`);
  return (
    <Link
      href={`/play/${alias}`}
      className="game-card group block overflow-hidden rounded-2xl border border-white/5 bg-[#2a3866] transition hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(56,189,248,0.25)]"
    >
      <div className={`flex h-28 items-center justify-center bg-gradient-to-br ${t.cover} text-5xl transition group-hover:scale-110`}>
        {t.scene}
      </div>
      <div className="p-3">
        <div className="truncate font-bold leading-tight">{g.name}</div>
        <div className="text-xs text-slate-500">{g.prov}</div>
        <div className="mt-2 text-[11px]" style={{ color: t.accent }}>
          {g.sx}×{g.sy}{g.rtp ? ` · RTP up to ${Math.max(...g.rtp).toFixed(0)}%` : ""}
        </div>
      </div>
    </Link>
  );
}
