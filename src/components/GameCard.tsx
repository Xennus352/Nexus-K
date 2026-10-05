"use client";

import Link from "next/link";
import { themeFor, assetFor, coverFor, sceneFor } from "@/lib/theme";

export type GameCardData = {
  prov: string;
  name: string;
  sx: number;
  sy: number;
  rtp?: number[];
  /** The local-game override: render this exact cover rather than the theme's coin. */
  cover?: string;
  /** Explicit href, for games that are not `PROV/NAME` inside /play. */
  href?: string;
  /** This game is suspended; link still opens, and says why. */
  maint?: boolean;
  /** Promoted by the lobby — worn as a badge on the cover. */
  trending?: boolean;
  /** Fallback href when it is just a name, for engine games. Kept raw for labels. */
  local?: boolean;
};

/**
 * The pack badge shown top-right. Kept as one lookup rather than inferred so a
 * pack can be added without silently leaving an empty bordered chip on every
 * card it produces — `?? "Slots"` guards that case regardless.
 */
const PACK_LABEL: Record<string, string> = {
  buffalo: "Savannah",
  zeus: "Olympus",
  egypt: "Egypt",
  viking: "Viking",
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
  // The pack nominates what may be shown and the title gets first refusal on it
  // (see `coverFor`) — a thumbnail is read before its caption, so *Crown* wears
  // the crown rather than whichever reel symbol the hash drew.
  const cover = g.local ? g.cover : coverFor(key);
  const href = g.href ?? `/play/${encodeURIComponent(key)}`;
  return (
    <Link
      href={href}
      prefetch={false}
      className={`game-card group block overflow-hidden rounded-2xl border bg-[#35478a] transition hover:-translate-y-1 ${g.maint ? "border-amber-400/30" : "border-white/5"}`}
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
          {g.local ? "NEXUS" : PACK_LABEL[assets.kind] ?? "Slots"}
        </span>
        {/* Top-left rather than top-right: the pack label already owns that
            corner, and a promotion wants to be the first thing read. The
            maintenance chip steps down a row when both apply rather than sit
            underneath it. */}
        {g.trending && (
          <span className="absolute left-2 top-2 rounded-md bg-gradient-to-r from-orange-500 to-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-[0_0_12px_rgba(251,146,60,0.85)]">
            🔥 Trending
          </span>
        )}
        {g.maint && (
          <span
            className={`absolute left-2 rounded-md border border-amber-400/60 bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300 backdrop-blur-sm ${g.trending ? "top-9" : "top-2"}`}
          >
            Maintenance
          </span>
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
