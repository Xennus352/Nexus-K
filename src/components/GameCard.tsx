"use client";

import Link from "next/link";
import { themeFor, assetFor, sceneFor } from "@/lib/theme";

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

const PACK_LABEL: Record<string, string> = {
  kemet: "Kemet",
  classic: "Classic",
  fruits2: "Fruit 16-bit",
  pixelfood: "Pixel Food",
  fantasy: "Fantasy",
};

export default function GameCard({ g }: { g: GameCardData }) {
  const key = `${g.prov}/${g.name}`;
  const theme = themeFor(key);
  const assets = assetFor(key);
  const scene = sceneFor(key, g.sx);
  const cover = assets.images[hash(key) % assets.images.length];
  const alias = encodeURIComponent(key);
  return (
    <Link
      href={`/play/${alias}`}
      prefetch={false}
      className="game-card group block overflow-hidden rounded-2xl border border-white/5 bg-[#2a3866] transition hover:-translate-y-1"
      style={{ boxShadow: `0 0 0 1px ${scene.rim}` }}
    >
      <div
        className={`relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br ${theme.cover} transition group-hover:brightness-110`}
        style={{
          backgroundImage: scene.cabinet,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Ambient halo + vignette so the art reads on every theme */}
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: scene.halo }} />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(transparent, rgba(3,6,14,0.75))" }} />
        <img
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          className="relative h-20 w-20 object-contain drop-shadow-lg transition group-hover:scale-110"
          style={{ imageRendering: assets.pixelGrid ? "pixelated" : "auto" }}
        />
        <span
          className="absolute right-2 top-2 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm"
          style={{ borderColor: scene.rim, color: theme.accent, background: "rgba(3,6,14,0.55)" }}
        >
          {PACK_LABEL[assets.kind]}
        </span>
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
