import { getSession } from "@/lib/session";
import { claimBonus } from "@/server/actions";
import { prisma } from "@/lib/prisma";
import Gallery from "@/components/Gallery";
import AuthForm from "@/components/AuthForm";
import Link from "next/link";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const s = await getSession();

  if (!s) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#1b2447] p-8 text-white">
        <h1 className="bg-gradient-to-r from-sky-300 via-sky-400 to-blue-600 bg-clip-text text-6xl font-black text-transparent drop-shadow-[0_0_30px_rgba(56,189,248,0.4)]">
          NEXUS-K
        </h1>
        <p className="text-slate-400 tracking-[0.4em] text-xs">BLUE DIAMOND CASINO</p>
        <AuthForm error={error} />
      </main>
    );
  }

  const user = await prisma.user.findUnique({ where: { email: s.email } });
  const userId = user?.id;
  const recent = userId
    ? await prisma.spin.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  let featured: { prov: string; name: string; sx: number; sy: number; rtp: number[] }[] = [];
  try {
    const res = await fetch(`${ENGINE}/game/list?inc=slot&exc=~all&sort=true`, {
      cache: "no-store",
    });
    featured = (await res.json()).list?.slice(0, 12) ?? [];
  } catch {
    /* engine offline */
  }

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-r from-[#0b1a4b] via-[#122a6e] to-[#0b1a4b] p-10">
        <div className="relative z-10">
          <p className="text-xs tracking-[0.4em] text-sky-300">WELCOME BACK{user ? `, ${user.email.split("@")[0].toUpperCase()}` : ""}</p>
          <h2 className="mt-2 text-4xl font-black">Experience Luxury, Play Royal.</h2>
          <p className="mt-2 max-w-xl text-slate-300/80">
            347 slots from Novomatic, NetEnt, CT Interactive and more — powered by the Nexus-K engine.
          </p>
          <Link href="/lobby" className="mt-6 inline-block rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-8 py-3 font-bold shadow-[0_0_25px_rgba(56,189,248,0.5)] transition hover:brightness-110">
            Play Now
          </Link>
        </div>
        <div className="absolute right-10 top-6 text-8xl opacity-40">💎🎰</div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* recent activity */}
        <section className="rounded-2xl border border-white/5 bg-[#2a3866] p-5">
          <h3 className="mb-4 font-bold text-slate-200">RECENT ACTIVITY</h3>
          {recent.length === 0 && <p className="text-sm text-slate-500">No spins yet — place your first bet!</p>}
          <ul className="space-y-3">
            {recent.map((sp) => (
              <li key={sp.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-slate-400">🎰 {sp.alias || "Game"}</span>
                <span className={`font-mono ${sp.win > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {sp.win > 0 ? `+${sp.win}` : `-${sp.bet}`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* daily bonus */}
        <section className="rounded-2xl border border-amber-500/20 bg-[#2a3866] p-5">
          <h3 className="mb-4 font-bold text-slate-200">DAILY BONUS</h3>
          <div className="text-5xl">🎁</div>
          <p className="mt-2 text-sm text-slate-400">Claim your daily 250 coin bonus.</p>
          <form action={claimBonus}>
            <button className="mt-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-6 py-2 font-bold text-black transition hover:brightness-110">
              CLAIM NOW
            </button>
          </form>
        </section>

        {/* hot picks */}
        <section className="rounded-2xl border border-white/5 bg-[#2a3866] p-5">
          <h3 className="mb-4 font-bold text-slate-200">WHY NEXUS-K</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>💎 347+ games, 10 providers</li>
            <li>⚡ Real engine, provably fair math</li>
            <li>🔒 Secure JWT session</li>
          </ul>
        </section>
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-xl font-black">TRENDING NOW</h3>
          <Link href="/lobby" className="text-sm text-sky-400">View all →</Link>
        </div>
        <Gallery games={featured} />
      </section>
    </div>
  );
}
