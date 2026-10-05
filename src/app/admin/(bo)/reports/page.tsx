// Business reports: daily totals, per-rail performance, the biggest movers and
// the bonus cost.
//
// Everything here is computed from the casino-side records rather than the
// engine, so a rail that has never been exercised still appears (with zeros)
// instead of silently vanishing from the comparison.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { setting } from "@/lib/settings";
import { fmt } from "@/lib/money";
import { Empty, PageTitle, Panel, Stat, Table, formatDate } from "@/components/ui";
import { RowLink } from "@/components/admin/parts";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const requested = Number.parseInt(sp.days ?? "30", 10);
  const days = [7, 30, 90].includes(requested) ? requested : 30;

  // A server component renders once per request, so "now" is captured once here
  // and every window in the report is measured from the same instant — otherwise
  // the daily buckets and the query ranges could straddle a midnight.
  const now = new Date();
  const from = new Date(now.getTime() - days * DAY);

  const [
    currency,
    deposits,
    withdrawals,
    perRail,
    bonusClaims,
    topDepositors,
    topWagerers,
    activePlayers,
    newPlayers,
  ] = await Promise.all([
    setting("site.currency"),
    prisma.deposit.findMany({
      where: { createdAt: { gte: from } },
      select: { amount: true, net: true, coins: true, status: true, currency: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({
      where: { createdAt: { gte: from } },
      select: { amount: true, net: true, charge: true, status: true, currency: true, createdAt: true },
    }),
    prisma.deposit.groupBy({
      by: ["gatewayAlias"],
      _count: { _all: true },
      _sum: { amount: true },
      where: { status: "success" },
    }),
    prisma.bonusClaim.groupBy({
      by: ["kind"],
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.user.findMany({
      orderBy: { totalDeposit: "desc" },
      take: 10,
      select: { id: true, email: true, totalDeposit: true, totalWithdraw: true },
    }),
    prisma.user.findMany({
      orderBy: { totalBet: "desc" },
      take: 10,
      select: { id: true, email: true, totalBet: true, totalWin: true },
    }),
    prisma.user.count({
      where: { transactions: { some: { createdAt: { gte: from } } } },
    }),
    prisma.user.count({ where: { createdAt: { gte: from } } }),
  ]);

  /* ---------------------------------------------------------------- totals */
  const okDeposits = deposits.filter((d) => d.status === "success");
  const okWithdrawals = withdrawals.filter((w) => w.status === "success");
  const depositTotal = okDeposits.reduce((a, d) => a + d.amount, 0);
  const withdrawTotal = okWithdrawals.reduce((a, w) => a + w.net, 0);
  const feeTotal = okDeposits.reduce((a, d) => a + (d.amount - d.net), 0);
  const bonusCoins = bonusClaims.reduce((a, b) => a + (b._sum.amount ?? 0), 0);

  /* ------------------------------------------------------------- per day */
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const buckets = Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getTime() - (days - 1 - i) * DAY);
    return dayKey(date);
  });
  const depByDay = new Map<string, number>();
  const wdlByDay = new Map<string, number>();
  const depCountByDay = new Map<string, number>();
  for (const d of okDeposits) {
    const k = dayKey(d.createdAt);
    depByDay.set(k, (depByDay.get(k) ?? 0) + d.amount);
    depCountByDay.set(k, (depCountByDay.get(k) ?? 0) + 1);
  }
  for (const w of okWithdrawals) {
    const k = dayKey(w.createdAt);
    wdlByDay.set(k, (wdlByDay.get(k) ?? 0) + w.net);
  }

  const maxIn = Math.max(1, ...buckets.map((k) => depByDay.get(k) ?? 0));
  const maxOut = Math.max(1, ...buckets.map((k) => wdlByDay.get(k) ?? 0));

  const totalSpins = await prisma.spin.count({ where: { createdAt: { gte: from } } });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Reports"
        subtitle={`Last ${days} days`}
        action={
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`/admin/reports?days=${d}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  days === d ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-slate-400"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Deposits" value={fmt(depositTotal, currency)} hint={`${okDeposits.length} settled`} tone="good" />
        <Stat label="Withdrawals" value={fmt(withdrawTotal, currency)} hint={`${okWithdrawals.length} paid`} tone="bad" />
        <Stat
          label="Net position"
          value={fmt(depositTotal - withdrawTotal, currency)}
          hint={depositTotal - withdrawTotal >= 0 ? "positive" : "negative"}
          tone={depositTotal - withdrawTotal >= 0 ? "good" : "bad"}
        />
        <Stat label="Fees collected" value={fmt(feeTotal, currency)} hint="deposit fees only" tone="warn" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="New players" value={newPlayers.toLocaleString()} hint="accounts opened" />
        <Stat label="Active players" value={activePlayers.toLocaleString()} hint="had wallet activity" />
        <Stat label="Spins recorded" value={totalSpins.toLocaleString()} hint="client-reported" />
      </div>

      <Panel title="DAILY IN / OUT">
        <div className="space-y-2">
          {buckets.map((k) => {
            const inAmt = depByDay.get(k) ?? 0;
            const outAmt = wdlByDay.get(k) ?? 0;
            const count = depCountByDay.get(k) ?? 0;
            return (
              <div key={k} className="grid grid-cols-[86px_1fr_1fr_120px] items-center gap-3">
                <span className="font-mono text-[11px] text-slate-500">{k}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-emerald-500/60"
                    style={{ width: `${(inAmt / maxIn) * 100}%` }}
                  />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-rose-500/60"
                    style={{ width: `${(outAmt / maxOut) * 100}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[11px] text-slate-400">
                  {inAmt.toFixed(0)} / {outAmt.toFixed(0)}
                  {count > 0 && <span className="text-slate-600"> · {count}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-emerald-500/60" /> deposits in
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-rose-500/60" /> withdrawals out
          </span>
        </div>
      </Panel>

      <div className="grid gap-6 sm:grid-cols-1 xl:grid-cols-2">
        <Panel title="PER RAIL (ALL TIME)" bodyClass="p-0 sm:p-0">
          {perRail.length === 0 ? (
            <div className="p-5">
              <Empty>No settled deposits yet.</Empty>
            </div>
          ) : (
            <Table head={["Rail", "Deposits", "Volume"]}>
              {[...perRail]
                .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
                .map((r) => (
                  <tr key={r.gatewayAlias || "—"} className="hover:bg-white/5">
                    <td className="px-4 py-2.5 text-xs text-slate-300">{r.gatewayAlias || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r._count._all}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-emerald-300">
                      {fmt(r._sum.amount ?? 0, currency)}
                    </td>
                  </tr>
                ))}
            </Table>
          )}
        </Panel>

        <Panel title="BONUS COST" bodyClass="p-0 sm:p-0">
          {bonusClaims.length === 0 ? (
            <div className="p-5">
              <Empty>No bonuses claimed yet.</Empty>
            </div>
          ) : (
            <Table head={["Kind", "Claims", "Coins issued"]}>
              {[...bonusClaims]
                .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
                .map((b) => (
                  <tr key={b.kind} className="hover:bg-white/5">
                    <td className="px-4 py-2.5 text-xs capitalize text-slate-300">{b.kind}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{b._count._all}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-300">
                      {(b._sum.amount ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
            </Table>
          )}
          <div className="border-t border-white/5 px-5 py-3 text-xs text-slate-400">
            Total issued:{" "}
            <span className="font-mono text-amber-300">{bonusCoins.toLocaleString()} coins</span>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 sm:grid-cols-1 xl:grid-cols-2">
        <Panel title="TOP DEPOSITORS" bodyClass="p-0 sm:p-0">
          {topDepositors.length === 0 ? (
            <div className="p-5">
              <Empty>No deposits recorded.</Empty>
            </div>
          ) : (
            <Table head={["Player", "Deposited", "Withdrawn"]}>
              {topDepositors.map((u) => (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-xs">
                    <RowLink href={`/admin/users/${u.id}`}>{u.email}</RowLink>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-emerald-300">
                    {fmt(u.totalDeposit, currency)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-rose-300">
                    {fmt(u.totalWithdraw, currency)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="TOP WAGERERS" bodyClass="p-0 sm:p-0">
          {topWagerers.length === 0 ? (
            <div className="p-5">
              <Empty>No bets recorded.</Empty>
            </div>
          ) : (
            <Table head={["Player", "Wagered", "Won", "Return"]}>
              {topWagerers.map((u) => (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-xs">
                    <RowLink href={`/admin/users/${u.id}`}>{u.email}</RowLink>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                    {Math.floor(u.totalBet).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-emerald-300">
                    {Math.floor(u.totalWin).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                    {u.totalBet > 0 ? `${((u.totalWin / u.totalBet) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <Panel title="RECENT DEPOSIT LEDGER">
        {deposits.length === 0 ? (
          <Empty>No deposits in this window.</Empty>
        ) : (
          <ul className="space-y-1 text-xs text-slate-500">
            {[...deposits]
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, 12)
              .map((d, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{formatDate(d.createdAt)}</span>
                  <span className="font-mono">
                    {d.status === "success" ? "+" : d.status === "cancel" ? "−" : "·"}{" "}
                    {d.amount.toFixed(2)} {d.currency}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}