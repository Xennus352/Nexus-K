// The game catalogue — all games come from the Go slotopol engine.
//
// The engine lists its catalogue over HTTP. It is not in this database,
// we do not own it, and a provider's update changes it without telling us.
// That is why the operator's flags are *sparse overrides* keyed by alias
// rather than rows we own: a game we have never heard of is visible and
// in service by default, so an engine-side update shows up in the lobby
// with nobody having to add it.

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { stateOf, type GameState } from "@/lib/maintenance";
import { trendingIndex } from "@/lib/theme";

export type EngineGame = {
  prov: string;
  name: string;
  sx: number;
  sy: number;
  rtp: number[];
  gt: number;
  ln?: number;
};

/** No local games — all games come from the Go engine. */
export const LOCAL_GAMES: readonly { route: string }[] = [] as const;

const byRoute = new Map(LOCAL_GAMES.map((g) => [g.route, g]));

export function localGame(route: string): { route: string } | undefined {
  return byRoute.get(route);
}

/**
 * The operator's overrides, read once per render rather than per game.
 */
export const allFlags = cache(async (): Promise<Map<string, GameState>> => {
  const rows = await prisma.gameFlag.findMany();
  return new Map(
    rows.map((r) => [
      r.alias,
      { visible: r.visible, maint: r.maint, maintNote: r.maintNote, sort: r.sort, note: r.note },
    ]),
  );
});

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
  maint: boolean;
  maintNote: string;
  /** Promoted: sorted to the front of the grid and badged. */
  trending: boolean;
};

export type Blocked = { blocked: true; reason: "hidden" | "maintenance"; note: string } | { blocked: false };

export const gameAccess = cache(async (alias: string): Promise<Blocked> => {
  const flags = await allFlags();
  const s = stateOf(flags, alias);
  if (!s.visible) return { blocked: true, reason: "hidden", note: "" };
  if (s.maint) return { blocked: true, reason: "maintenance", note: s.maintNote };
  return { blocked: false };
});

export function buildLobby(
  engineGames: EngineGame[],
  flags: Map<string, GameState>,
): { games: LobbyGame[]; providers: string[] } {
  const rows: LobbyGame[] = [];

  for (const g of engineGames) {
    if (g.gt !== 1) continue; // only slot games (gt=1)
    const key = `${g.prov}/${g.name}`;
    const s = stateOf(flags, key);
    if (!s.visible) continue;

    const rtpValues = Array.isArray(g.rtp) && g.rtp.length > 0 ? g.rtp : [95];
    const avgRtp = rtpValues.reduce((a, b) => a + b, 0) / rtpValues.length;

    rows.push({
      key,
      title: g.name,
      prov: g.prov,
      href: `/play/${encodeURIComponent(key)}`,
      cover: "",
      blurb: `${g.ln ?? "20"} lines · RTP ${avgRtp.toFixed(1)}%`,
      sx: g.sx,
      sy: g.sy,
      rtp: Math.round(avgRtp),
      local: false,
      maint: s.maint,
      maintNote: s.maintNote,
      trending: false,
    });
  }

  const games = rows
    .map((g, i) => ({ g, i, s: stateOf(flags, g.key).sort }))
    .sort((a, b) =>
      a.s === b.s ? a.i - b.i : a.s === 0 ? 1 : b.s === 0 ? -1 : a.s - b.s,
    )
    .map((x) => x.g);

  /* Promote the pinned title to the front of the grid and badge it. Moved rather
     than re-sorted, so every other game keeps the operator's own order behind
     it, and only ever one card wears the badge: two TRENDING cards at the top of
     a lobby read as a bug rather than a promotion. `trendingIndex` is the same
     lookup the home page's TRENDING NOW strip uses, so the two sections cannot
     disagree about what is trending. */
  games.forEach((g) => { g.trending = false; });
  const hot = trendingIndex(games.map((g) => g.key));
  if (hot >= 0) {
    const [g] = games.splice(hot, 1);
    g.trending = true;
    games.unshift(g);
  }

  const providers = [...new Set(games.map((g) => g.prov))];
  return { games, providers };
}

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