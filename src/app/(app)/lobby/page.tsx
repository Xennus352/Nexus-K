import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import GameCard from "@/components/GameCard";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

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

  let games: GameInfo[] = [];
  let providers: string[] = [];
  try {
    const res = await fetch(`${ENGINE}/game/list?inc=all&exc=~all&sort=true`, {
      cache: "no-store",
    });
    games = ((await res.json()).list ?? []).filter((g: GameInfo) => g.gt === 1);
    providers = [...new Set(games.map((g) => g.prov))] as string[];
  } catch {
    return (
      <p className="mt-10 text-rose-400">
        Cannot reach the game engine at {ENGINE}. Is `./engine/slotopol web` running?
      </p>
    );
  }

  const filtered = games.filter(
    (g) =>
      (!q || `${g.prov} ${g.name}`.toLowerCase().includes(q.toLowerCase())) &&
      (!prov || g.prov === prov)
  );

  return (
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
          className="rounded-xl border border-white/10 bg-[#2a3866] px-4 py-2.5 outline-none focus:border-sky-500"
        />
        <select name="prov" defaultValue={prov ?? ""} className="rounded-xl border border-white/10 bg-[#2a3866] px-4 py-2.5">
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 font-bold">Filter</button>
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {filtered.map((g) => (
          <GameCard key={`${g.prov}/${g.name}`} g={g} />
        ))}
      </div>
    </div>
  );
}
