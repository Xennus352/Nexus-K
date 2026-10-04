// Back-office overview: what needs a human, and how the day is going.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { engineHealthy } from "@/lib/engine";
import { setting } from "@/lib/settings";
import { fmt } from "@/lib/money";
import { Empty, PageTitle, Panel, Stat, StatusBadge, Table, formatDate } from "@/components/ui";
import { RowLink } from "@/components/admin/parts";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const since = new Date(Date.now() - DAY);

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireAdmin();

  const [
    currency,
    players,
    newToday,
    blocked,
    depPending,
    wdlPending,
    depSettled,
    wdlSettled,
    kycPending,
    netToday,
    recentDeposits,
    recentWithdrawals,
    latestSpins,
    engineUp,
  ] = await Promise.all([
    setting("site.currency"),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { status: "blocked" } }),
    prisma.deposit.count({ where: { status: "pending" } }),
    prisma.withdrawal.count({ where: { status: "pending" } }),
    // Separate count queries rather than reading `_count` off the aggregates
    // below: those are filtered to successful records only, so their length is
    // not "how many deposits were processed".
    prisma.deposit.count({ where: { paidAt: { gte: since } } }),
    prisma.withdrawal.count({ where: { paidAt: { gte: since } } }),
    prisma.kycSubmission.count({ where: { status: "pending" } }),
    // Summed in JS: these are separate collections and Prisma has no
    // cross-collection aggregate.
    Promise.all([
      prisma.deposit.findMany({ where: { paidAt: { gte: since } }, select: { amount: true, status: true } }),
      prisma.withdrawal.findMany({ where: { paidAt: { gte: since } }, select: { net: true, status: true } }),
    ]),
    prisma.deposit.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { email: true } } },
    }),
    prisma.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { email: true } }, method: { select: { name: true } } },
    }),
    prisma.spin.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { email: true } } },
    }),
    engineHealthy(),
  ]);

  const [depRows, wdlRows] = netToday;
  const depositIn = depRows.filter((d) => d.status === "success").reduce((a, d) => a + d.amount, 0);
  const withdrawOut = wdlRows.filter((w) => w.status === "success").reduce((a, w) => a + w.net, 0);

  // Anything an operator has to personally handle, worst first.
  const queue = [
    { label: "Pending deposits", count: depPending, href: "/admin/deposits?status=pending", tone: "warn" as const },
    { label: "Pending withdrawals", count: wdlPending, href: "/admin/withdrawals?status=pending", tone: "warn" as const },
    { label: "KYC to review", count: kycPending, href: "/admin/kyc", tone: "warn" as const },
    { label: "Suspended players", count: blocked, href: "/admin/users?status=blocked", tone: "bad" as const },
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Dashboard"
        subtitle={`Last 24 hours · ${engineUp ? "engine online" : "ENGINE OFFLINE"}`}
        action={
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              engineUp ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {engineUp ? "Engine connected" : "Engine unreachable"}
          </span>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Players" value={players.toLocaleString()} hint={`+${newToday} in 24h`} />
        <Stat label="Deposits 24h" value={fmt(depositIn, currency)} hint={`${depSettled} settled`} tone="good" />
        <Stat label="Withdrawals 24h" value={fmt(withdrawOut, currency)} hint={`${wdlSettled} paid`} tone="bad" />
        <Stat
          label="Net 24h"
          value={fmt(depositIn - withdrawOut, currency)}
          hint={depositIn - withdrawOut >= 0 ? "in profit" : "net payout"}
          tone={depositIn - withdrawOut >= 0 ? "good" : "bad"}
        />
      </div>

      <Panel title="NEEDS ATTENTION">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {queue.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className={`rounded-xl border px-4 py-3 transition hover:brightness-110 ${
                q.count > 0
                  ? q.tone === "bad"
                    ? "border-rose-500/40 bg-rose-500/10"
                    : "border-amber-500/40 bg-amber-500/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div
                className={`font-mono text-2xl font-bold ${
                  q.count > 0 ? (q.tone === "bad" ? "text-rose-300" : "text-amber-300") : "text-slate-400"
                }`}
              >
                {q.count}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{q.label}</div>
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="LATEST DEPOSITS" bodyClass="p-0 sm:p-0" action={<Link href="/admin/deposits" className="text-xs text-sky-400 hover:underline">All</Link>}>
          {recentDeposits.length === 0 ? (
            <div className="p-5">
              <Empty>No deposits yet.</Empty>
            </div>
          ) : (
            <Table head={["Reference", "Player", "Amount", "Status", "When"]}>
              {recentDeposits.map((d) => (
                <tr key={d.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <RowLink href={`/admin/deposits?trx=${d.trx}`}>{d.trx}</RowLink>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-slate-400">{d.user.email}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-200">
                    {fmt(d.amount, d.currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="LATEST WITHDRAWALS" bodyClass="p-0 sm:p-0" action={<Link href="/admin/withdrawals" className="text-xs text-sky-400 hover:underline">All</Link>}>
          {recentWithdrawals.length === 0 ? (
            <div className="p-5">
              <Empty>No withdrawals yet.</Empty>
            </div>
          ) : (
            <Table head={["Reference", "Player", "Amount", "Status", "When"]}>
              {recentWithdrawals.map((w) => (
                <tr key={w.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <RowLink href={`/admin/withdrawals?trx=${w.trx}`}>{w.trx}</RowLink>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-slate-400">{w.user.email}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-200">
                    {fmt(w.net, w.currency)}
                    <div className="text-[10px] text-slate-500">{w.method.name}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(w.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <Panel title="LATEST SPINS" bodyClass="p-0 sm:p-0">
        {latestSpins.length === 0 ? (
          <div className="p-5">
            <Empty>No spins recorded.</Empty>
          </div>
        ) : (
          <Table head={["Player", "Game", "Bet", "Win", "When"]}>
            {latestSpins.map((sp) => (
              <tr key={sp.id} className="hover:bg-white/5">
                <td className="max-w-[220px] truncate px-4 py-2.5 text-xs text-slate-400">{sp.user.email}</td>
                <td className="px-4 py-2.5 text-xs text-slate-300">{sp.alias || "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{sp.bet.toLocaleString()}</td>
                <td
                  className={`px-4 py-2.5 font-mono text-xs ${sp.win > 0 ? "text-emerald-300" : "text-slate-500"}`}
                >
                  {sp.win.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(sp.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}