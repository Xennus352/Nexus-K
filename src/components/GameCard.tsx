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
  lux: "Gold Reels",
  fruits2: "Fruit 16-bit",
  pixelfood: "Pixel Food",
  fantasy: "Fantasy",
};

const SCENE_LABEL: Record<string, string> = {
  vip: "VIP Lounge",
  volcano: "Fantasy Fire",
  theme: "",
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
      className="game-card group block overflow-hidden rounded-2xl border border-white/5 bg-[#35478a] transition hover:-translate-y-1"
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
        {scene.deco && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              backgroundImage: scene.deco,
              backgroundSize: `${Math.round((scene.decoSize ?? 190) * 0.8)}px ${Math.round((scene.decoSize ?? 190) * 0.8)}px`,
              maskImage: scene.decoMask,
              WebkitMaskImage: scene.decoMask,
            }}
          />
        )}
        {scene.props.slice(0, 5).map((p, i) => (
          <img
            key={i}
            src={p.src}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute select-none object-contain"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: Math.round(p.size * 0.6),
              imageRendering: "pixelated",
              opacity: 0.45,
              filter: `drop-shadow(0 4px 6px rgba(0,0,0,0.5)) rotate(${p.tilt}deg)`,
            }}
          />
        ))}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(transparent, rgba(3,6,14,0.75))" }} />
        <span className="absolute bottom-1.5 left-2 text-[9px] font-bold uppercase tracking-widest text-slate-200/80">
          {SCENE_LABEL[scene.style]}
        </span>
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
