"use client";

import Link from "next/link";
import { themeFor, assetFor } from "@/lib/theme";

export type GameCardData = {
  prov: string;
  name: string;
  sx: number;
  sy: number;
  rtp?: number[];
};

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export default function GameCard({ g }: { g: GameCardData }) {
  const theme = themeFor(`${g.prov}/${g.name}`);
  const assets = assetFor(`${g.prov}/${g.name}`);
  const cover = assets.images[hash(`${g.prov}/${g.name}`) % assets.images.length];
  const alias = encodeURIComponent(`${g.prov}/${g.name}`);
  return (
    <Link
      href={`/play/${alias}`}
      prefetch={false}
      className="game-card group block overflow-hidden rounded-2xl border border-white/5 bg-[#2a3866] transition hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(56,189,248,0.25)]"
    >
      <div
        className={`flex h-28 items-center justify-center bg-gradient-to-br ${theme.cover} transition`}
        style={assets.bg ? { backgroundImage: `url(${assets.bg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {assets.bg ? null : (
          <img src={cover} alt="" loading="lazy" decoding="async" className="h-20 w-20 object-contain drop-shadow-lg transition group-hover:scale-110" />
        )}
      </div>
      <div className="p-3">
        <div className="truncate font-bold leading-tight">{g.name}</div>
        <div className="text-xs text-slate-400">{g.prov}</div>
        <div className="mt-2 text-[11px]" style={{ color: theme.accent }}>
          {g.sx}×{g.sy}{g.rtp ? ` · RTP up to ${Math.max(...g.rtp).toFixed(0)}%` : ""}
        </div>
      </div>
    </Link>
  );
}
