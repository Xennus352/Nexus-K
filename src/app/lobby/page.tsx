import Link from "next/link";
import { logout } from "@/server/actions";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

type GameInfo = {
  prov: string;
  name: string;
  date: string;
  gt: number;
  sx: number;
  sy: number;
  ln: number;
  rtp: number[];
};

export default async function Lobby({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; prov?: string }>;
}) {
  const { q, prov } = await searchParams;
  let games: GameInfo[] = [];
  let providers: string[] = [];
  try {
    const res = await fetch(`${ENGINE}/game/list?inc=all&exc=~all&sort=true`, {
      cache: "no-store",
    });
    const j = await res.json();
    games = (j.list ?? []).filter((g: GameInfo) => g.gt === 1);
    providers = [...new Set(games.map((g) => g.prov))];
  } catch {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <p className="text-red-400">Cannot reach the game engine at {ENGINE}. Is `./engine/slotopol web` running?</p>
      </main>
    );
  }

  const filtered = games.filter(
    (g) =>
      (!q || `${g.prov} ${g.name}`.toLowerCase().includes(q.toLowerCase())) &&
      (!prov || g.prov === prov)
  );

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-amber-400">🎰 Nexus-K Lobby</h1>
          <form action={logout}>
            <button className="rounded-lg border border-zinc-700 px-3 py-1 text-sm">Logout</button>
          </form>
        </div>

        <form className="mb-6 flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search games…"
            className="rounded-lg bg-zinc-800 px-4 py-2"
          />
          <select name="prov" defaultValue={prov ?? ""} className="rounded-lg bg-zinc-800 px-4 py-2">
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-black">Filter</button>
        </form>

        <p className="mb-4 text-sm text-zinc-500">{filtered.length} games</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((g) => {
            const alias = encodeURIComponent(`${g.prov}/${g.name}`);
            const rtp = Math.max(...g.rtp).toFixed(1);
            return (
              <Link
                key={alias}
                href={`/play/${alias}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-amber-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]"
              >
                <div className="text-2xl">🎲</div>
                <div className="mt-2 font-bold leading-tight">{g.name}</div>
                <div className="text-xs text-zinc-500">{g.prov}</div>
                <div className="mt-2 text-xs text-zinc-400">
                  {g.sx}×{g.sy} · RTP up to {rtp}%
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
