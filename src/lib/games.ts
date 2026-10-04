// The game catalogue, and who is allowed to see what in it.
//
// Games come from two places, and they arrive differently on purpose:
//
//   * **Engine games.** The Go slotopol engine lists its catalogue over HTTP. It is
//     not in this database, we do not own it, and a provider's update changes it
//     without telling us. That is why the operator's flags are *sparse overrides*
//     keyed by alias rather than rows we own: a game we have never heard of is
//     visible and in service by default, so an engine-side update shows up in the
//     lobby with nobody having to add it.
//   * **Local games.** Implemented in this app, with their own assets and their own
//     server-authoritative spin. African Buffalo is the first. These are the only
//     games whose money does not move through the engine, which is exactly why
//     they need to be listed explicitly rather than discovered.

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { stateOf, type GameState } from "@/lib/maintenance";

const BUFFALO_ASSETS = "/assets/african_buffalo_slot_assets";

export type LocalGame = {
  /** URL segment under /play. Unique, and what the operator's flags are keyed on. */
  route: string;
  /** The `PROV/NAME` key, matching the shape an engine game would arrive with. */
  key: string;
  title: string;
  prov: string;
  cover: string;
  blurb: string;
  /** Reels and lines, for the lobby card's meta line. */
  sx: number;
  sy: number;
  rtp: number;
};

export const LOCAL_GAMES: readonly LocalGame[] = [
  {
    route: "african-buffalo",
    key: "NEXUS/African Buffalo",
    title: "African Buffalo",
    prov: "Nexus Originals",
    cover: `${BUFFALO_ASSETS}/symbols/buffalo_full.png`,
    blurb: "512 ways · expanding buffalo on the reels",
    sx: 5,
    sy: 3,
    rtp: 96.4,
  },
] as const;

const byRoute = new Map(LOCAL_GAMES.map((g) => [g.route, g]));

export function localGame(route: string): LocalGame | undefined {
  return byRoute.get(route);
}

/** The engine's view of a catalogue entry, as `/lobby` receives it. */
export type EngineGame = { prov: string; name: string; sx: number; sy: number; rtp: number[] };

/**
 * One row for the lobby, whatever it came from. `href` is explicit because the two
 * kinds of game are reached differently: an engine game is `PROV/NAME` inside the
 * /play segment, a local game is its own segment.
 */
export type LobbyGame = {
  key: string;
  title: string;
  prov: string;
  href: string;
  cover: string;
  blurb: string;
  sx: number;
  sy: number;
  rtp: number;
  local: boolean;
  /** Suspended on its own. Still listed, so a player can see why it will not open. */
  maint: boolean;
  maintNote: string;
};

export type Blocked = { blocked: true; reason: "hidden" | "maintenance"; note: string } | { blocked: false };

/**
 * Whether a game may be played, and if not, why.
 *
 * `hidden` and `maintenance` are different failures on purpose and get different
 * answers, because the operator's two switches mean different things: hidden is
 * "this is gone", maintenance is "this is here and being worked on". Telling a
 * player a hidden game is "under maintenance" would invite them to wait for
 * something that is never coming back.
 */
export const gameAccess = cache(async (alias: string): Promise<Blocked> => {
  const flags = await allFlags();
  const s = stateOf(flags, alias);
  if (!s.visible) return { blocked: true, reason: "hidden", note: "" };
  if (s.maint) return { blocked: true, reason: "maintenance", note: s.maintNote };
  return { blocked: false };
});

/** The operator's overrides, read once per render rather than per game. */
export const allFlags = cache(async (): Promise<Map<string, GameState>> => {
  const rows = await prisma.gameFlag.findMany();
  return new Map(
    rows.map((r) => [
      r.alias,
      { visible: r.visible, maint: r.maint, maintNote: r.maintNote, sort: r.sort, note: r.note },
    ]),
  );
});

/**
 * The merged, filtered, sorted catalogue for the lobby.
 *
 * Hidden games are dropped rather than greyed out — a hidden game is one the
 * operator does not want running, and leaving a clickable card for it invites the
 * report "the game is still there". Suspended games are kept, marked, because the
 * operator *did* leave it running and a player who was told to expect it back needs
 * to see that it is coming back.
 */
export function buildLobby(
  engineGames: EngineGame[],
  flags: Map<string, GameState>,
): { games: LobbyGame[]; providers: string[] } {
  const rows: LobbyGame[] = [];

  for (const g of LOCAL_GAMES) {
    const s = stateOf(flags, g.key);
    if (!s.visible) continue;
    rows.push({
      key: g.key,
      title: g.title,
      prov: g.prov,
      href: `/play/${g.route}`,
      cover: g.cover,
      blurb: g.blurb,
      sx: g.sx,
      sy: g.sy,
      rtp: g.rtp,
      local: true,
      maint: s.maint,
      maintNote: s.maintNote,
    });
  }

  for (const g of engineGames) {
    const key = `${g.prov}/${g.name}`;
    const s = stateOf(flags, key);
    if (!s.visible) continue;
    rows.push({
      key,
      title: g.name,
      prov: g.prov,
      href: `/play/${encodeURIComponent(key)}`,
      cover: "",
      blurb: "",
      sx: g.sx,
      sy: g.sy,
      rtp: Math.max(0, ...g.rtp),
      local: false,
      maint: s.maint,
      maintNote: s.maintNote,
    });
  }

  // An explicit sort wins, and a game nobody has sorted keeps its upstream order.
  // Sorting purely by `sort` would lump every untouched game at 0 and reshuffle the
  // catalogue an operator curated at the provider; the `i` tiebreak makes the
  // "stable" part explicit rather than relying on the engine's sort being stable.
  const games = rows
    .map((g, i) => ({ g, i, s: stateOf(flags, g.key).sort }))
    .sort((a, b) =>
      a.s === b.s ? a.i - b.i : a.s === 0 ? 1 : b.s === 0 ? -1 : a.s - b.s,
    )
    .map((x) => x.g);

  const providers = [...new Set(games.map((g) => g.prov))];
  return { games, providers };
}

/** Buffers the filter query applies to a `LobbyGame`. */
export function matchesLobbyFilter(
  g: LobbyGame,
  q: string,
  prov: string,
): boolean {
  if (prov && g.prov !== prov) return false;
  if (!q) return true;
  const hay = `${g.prov} ${g.title}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}