import Link from "next/link";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { BOOT_COOKIE } from "@/lib/boot-flag";
import { redirect } from "next/navigation";
import GameCard from "@/components/GameCard";
import LobbyBoot from "@/components/LobbyBoot";
import { allFlags, buildLobby, matchesLobbyFilter, type EngineGame } from "@/lib/games";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

/** Per-request catalogue tracing. Off in production, where it is pure noise. */
const TRACE = process.env.NODE_ENV !== "production";

type GameInfo = {
  prov: string; name: string; date: string; gt: number;
  sx: number; sy: number; ln: number; rtp: number[];
};

export default async function Lobby({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; prov?: string }>;
}) {
  const s = await getSession();
  if (!s) redirect("/?error=Login+required");
  const { q, prov } = await searchParams;

  let engineGames: EngineGame[] = [];
  let engineError = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${ENGINE}/game/list?inc=all&exc=~all&sort=true`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await res.json();
    engineGames = (data.list ?? [])
      .filter((g: GameInfo) => g.gt === 1)
      .map((g: GameInfo) => ({ prov: g.prov, name: g.name, sx: g.sx, sy: g.sy, rtp: g.rtp, gt: g.gt, ln: g.ln }));
    // One line rather than three, and dev only: this block runs on every lobby
    // visit, and the counts are the first thing anyone debugging the catalogue
    // wants and the last thing production needs said out loud.
    if (TRACE) console.log(`[LOBBY] engine ${res.status}: ${engineGames.length} slots of ${data.list?.length ?? 0} listed`);
  } catch (e) {
    engineError = true;
    // A warning, not an error. The engine being unreachable is a state this page
    // already handles — banner above, local catalogue below — and logging it as
    // an error puts a red overlay on every lobby visit and buries the failures
    // that are actually faults.
    console.warn(`[LOBBY] engine unreachable at ${ENGINE}:`, e instanceof Error ? e.message : String(e));
  } finally {
    // Also on the failure path: the timer used to outlive a rejected fetch and
    // abort a controller nothing was waiting on any more.
    clearTimeout(timeout);
  }

  // The operator's per-game on/off switches, applied to both catalogues at once.
  const flags = await allFlags();
  const { games: merged, providers } = buildLobby(engineGames, flags);
  const filtered = merged.filter((g) => matchesLobbyFilter(g, q ?? "", prov ?? ""));
  // `q` and `prov` are absent on an unfiltered visit, and printing the word
  // "undefined" for them reads like a bug in the search rather than no search.
  if (TRACE)
    console.log(
      `[LOBBY] merged ${merged.length}, filtered ${filtered.length}` +
        (q ? `, q "${q}"` : "") +
        (prov ? `, prov "${prov}"` : ""),
    );

  // Asked here rather than inside `LobbyBoot`, which is the only way a warm lobby
  // can arrive unwrapped. See `src/lib/boot-flag.ts` for why this is a cookie and
  // not `sessionStorage`.
  const booted = (await cookies()).has(BOOT_COOKIE);

  const lobby = (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black">🎰 CASINO <span className="rounded bg-red-500 px-2 py-0.5 text-xs align-middle">HOT</span></h1>
        <p className="text-sm text-slate-500">{filtered.length} games</p>
      </div>

      <form className="mb-6 flex flex-wrap items-center gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="🔍 Search games…"
          className="rounded-xl border border-white/10 bg-[#35478a] px-4 py-2.5 outline-none focus:border-sky-500"
        />
        <select name="prov" defaultValue={prov ?? ""} className="rounded-xl border border-white/10 bg-[#35478a] px-4 py-2.5">
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button className="cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 font-bold">Filter</button>
      </form>

      {engineError && (
        <p className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          The game engine is not answering right now, so the catalogue games cannot be listed.
          The local games below still work.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-[#35478a] p-6 text-sm text-slate-400">
          No games match that search.{" "}
          <Link href="/lobby" className="font-bold text-sky-300 hover:underline">
            Clear the filters
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {filtered.map((g) => (
            <GameCard
              key={g.key}
              g={{
                prov: g.prov,
                name: g.title,
                sx: g.sx,
                sy: g.sy,
                rtp: g.rtp ? [g.rtp] : undefined,
                cover: g.cover || undefined,
                href: g.href,
                maint: g.maint,
                local: g.local,
                trending: g.trending,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );

  return booted ? lobby : <LobbyBoot>{lobby}</LobbyBoot>;
}
