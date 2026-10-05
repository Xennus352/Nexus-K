import Link from "next/link";
import { getSession } from "@/lib/session";
import { claimDailyBonus } from "@/server/actions";
import { prisma } from "@/lib/prisma";
import { settingNumber } from "@/lib/settings";
import { trendingIndex } from "@/lib/theme";
import Gallery from "@/components/Gallery";
import AuthForm from "@/components/AuthForm";
import LoginScene from "@/components/LoginScene";
import FloatingChips from "@/components/FloatingChips";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ref?: string }>;
}) {
  const { error } = await searchParams;
  const s = await getSession();

  // Signed out: the sign-in screen owns the whole viewport, so it bypasses the
  // app shell entirely (the layout falls back to a bare wrapper with no nav).
  if (!s) {
    return (
      <LoginScene>
        <AuthForm error={error} />
      </LoginScene>
    );
  }

  const user = await prisma.user.findUnique({ where: { email: s.email } });
  const userId = user?.id;
  const [recent, claimedToday, dailyBonus] = await Promise.all([
    userId
      ? prisma.spin.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    // Same period key `claimDailyBonus` writes, so the button disappears the
    // moment the claim succeeds.
    userId
      ? prisma.bonusClaim.findFirst({
          where: {
            userId,
            kind: "daily",
            claimKey: { endsWith: new Date().toISOString().slice(0, 10) },
          },
        })
      : Promise.resolve(null),
    settingNumber("bonus.daily", 1000),
  ]);

  let featured: { prov: string; name: string; sx: number; sy: number; rtp: number[]; trending?: boolean }[] = [];
  let engineError = false;
  try {
    const res = await fetch(`${ENGINE}/game/list?inc=slot&exc=~all&sort=true`, {
      cache: "no-store",
    });
    const list = (await res.json()).list ?? [];
    /* The promoted title is lifted to the head of this strip rather than left
       wherever the engine's sort put it. `trendingIndex` is the same lookup the
       lobby's grid uses, so the two sections cannot disagree about what is
       trending — and neither can a future keyword edit move one without the
       other. */
    const hot = trendingIndex(list.map((g: { prov: string; name: string }) => `${g.prov}/${g.name}`));
    if (hot > 0) list.unshift(...list.splice(hot, 1));
    // Exactly one card wears the badge — the head of the strip, and only when the
    // promoted title was in this fetch at all (a short list may not contain it).
    featured = list.slice(0, 12).map((g: { prov: string; name: string }, i: number) => ({
      ...g,
      trending: i === 0 && hot >= 0,
    }));
  } catch {
    // Kept as a flag rather than swallowed: it is the only difference between
    // "nothing is trending" and "the engine is down", and this section has no
    // local catalogue to fall back on the way /lobby does.
    engineError = true;
  }

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-r from-[#0b1a4b] via-[#122a6e] to-[#0b1a4b] p-10">
        <FloatingChips />
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
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* recent activity */}
        <section className="rounded-2xl border border-white/5 bg-[#35478a] p-5">
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
        <section className="rounded-2xl border border-amber-500/20 bg-[#35478a] p-5">
          <h3 className="mb-4 font-bold text-slate-200">DAILY BONUS</h3>
          <div className="text-5xl">🎁</div>
          {claimedToday ? (
            <>
              <p className="mt-2 text-sm text-emerald-300">
                Today&rsquo;s {dailyBonus.toLocaleString()} coin bonus is in your wallet.
              </p>
              <Link
                href="/wallet"
                className="mt-4 inline-block rounded-xl border border-amber-500/40 px-6 py-2 font-bold text-amber-300 transition hover:bg-amber-500/10"
              >
                VIEW WALLET
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-400">
                Claim your daily {dailyBonus.toLocaleString()} coin bonus.
              </p>
              <form action={claimDailyBonus}>
                <button className="mt-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-6 py-2 font-bold text-black transition hover:brightness-110">
                  CLAIM NOW
                </button>
              </form>
            </>
          )}
        </section>

        {/* hot picks */}
        <section className="rounded-2xl border border-white/5 bg-[#35478a] p-5">
          <h3 className="mb-4 font-bold text-slate-200">WHY NEXUS-K</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>💎 347+ games, 10 providers</li>
            <li>⚡ Real engine, provably fair math</li>
            <li>🔒 Secure JWT session</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/deposit"
              className="rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-2 text-xs font-bold text-sky-300 transition hover:bg-sky-900/50"
            >
              DEPOSIT
            </Link>
            <Link
              href="/withdraw"
              className="rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-2 text-xs font-bold text-sky-300 transition hover:bg-sky-900/50"
            >
              WITHDRAW
            </Link>
            <Link
              href="/account"
              className="rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-2 text-xs font-bold text-sky-300 transition hover:bg-sky-900/50"
            >
              MY ACCOUNT
            </Link>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-xl font-black">TRENDING NOW</h3>
          <Link href="/lobby" className="text-sm text-sky-400">View all →</Link>
        </div>
        {engineError ? (
          <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-200">
            The game engine is not answering right now, so trending games cannot be listed.
          </p>
        ) : (
          <Gallery games={featured} />
        )}
      </section>
    </div>
  );
}
