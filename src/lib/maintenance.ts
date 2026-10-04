// Site-wide maintenance.
//
// Deliberately only the site-wide switch. The per-game switches live in
// `src/lib/games.ts`, next to the catalogue they filter, because they are a
// property of a game rather than of the site — one file, one question, but the
// question is always asked *about something*.
//
// The read does not go through the 30-second settings cache. That cache exists so a
// page render does not fan out into dozens of Mongo round-trips, but it is the wrong
// trade for a kill switch: an operator who flips this and then loads a page to check
// it would be looking at a stale answer for up to half a minute, and "is it
// actually on?" is the one question that must never be stale. `cache()` still
// applies — one render reads the database once — and nothing more.

import { cache } from "react";
import { prisma } from "@/lib/prisma";

const MAINT_KEY = "site.maintenance";
const NOTE_KEY = "site.maintenance_note";

export type Maintenance = {
  /** Players are locked out of the site. The back office stays reachable. */
  active: boolean;
  /** What players are told. An empty string falls back to the built-in wording. */
  note: string;
};

export const DEFAULT_NOTICE =
  "We are doing some work on the servers. Everything is back shortly — your balance and history are untouched.";

/**
 * Whether the whole site is down for maintenance.
 *
 * Read straight from the collection rather than through `setting()`, deliberately:
 * see the note at the top of this file.
 */
export const siteMaintenance = cache(async (): Promise<Maintenance> => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [MAINT_KEY, NOTE_KEY] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const raw = map.get(MAINT_KEY) ?? "0";
  return {
    active: raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes",
    note: (map.get(NOTE_KEY) ?? "").trim(),
  };
});

/** The wording to actually show: the operator's if they wrote one, otherwise ours. */
export function maintenanceText(note: string): string {
  return note.length > 0 ? note : DEFAULT_NOTICE;
}

export type GameState = {
  visible: boolean;
  maint: boolean;
  maintNote: string;
  sort: number;
  note: string;
};

/** The state of one game, with the absence of a row meaning "open". */
export function stateOf(flags: Map<string, GameState>, alias: string): GameState {
  return flags.get(alias) ?? { visible: true, maint: false, maintNote: "", sort: 0, note: "" };
}