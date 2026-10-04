// Global wallet ledger.
//
// The audit view: every coin that entered or left any wallet, in the order it
// happened, with the balance immediately after each movement. Written by
// src/lib/wallet.ts, which is the only module permitted to move coins.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Empty, PageTitle, Panel, Table, formatDate } from "@/components/ui";
import { Pager, PAGE_SIZE, RowLink, Tabs, pageOf } from "@/components/admin/parts";

export const dynamic = "force-dynamic";

/** Tab keys are the ledger's own `type` values; "" is the unfiltered list. */
const TYPES = ["all", "deposit", "withdrawal", "bonus", "referral", "refund", "adjustment", "bet", "win"] as const;

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string; trx?: string; page?: string }>;
}) {
  const sp = await searchParams;

  const tab: (typeof TYPES)[number] = (TYPES as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as (typeof TYPES)[number])
    : (TYPES as readonly string[]).includes(sp.type ?? "")
      // `?type=` predates the tabs and is still linked from the player detail
      // screen; honour it rather than silently showing the wrong list.
      ? (sp.type as (typeof TYPES)[number])
      : "all";
  const type = tab === "all" ? "" : tab;
  const trx = (sp.trx ?? "").trim().slice(0, 40);
  const page = pageOf(sp);

  const where = {
    ...(type ? { type } : {}),
    ...(trx ? { OR: [{ trx: { contains: trx.toUpperCase() } }, { ref: { contains: trx.toUpperCase() } }] } : {}),
  };

  const [rows, total, credits, debits, byType] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true, status: true } } },
    }),
    prisma.transaction.count({ where }),
    // Net movement in coins, over the whole ledger. Split by sign because
    // `_sum` of a filtered set needs two queries and one of them would be zero
    // most of the time.
    prisma.transaction.findMany({ where: { amount: { gt: 0 } }, select: { amount: true } }),
    prisma.transaction.findMany({ where: { amount: { lt: 0 } }, select: { amount: true } }),
    prisma.transaction.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);

  const inCoins = credits.reduce((a, t) => a + t.amount, 0);
  const outCoins = Math.abs(debits.reduce((a, t) => a + t.amount, 0));
  const typeCount = (t: (typeof TYPES)[number]) =>
    t === "all"
      ? byType.reduce((a, g) => a + g._count._all, 0)
      : (byType.find((g) => g.type === t)?._count._all ?? 0);

  const base = "/admin/transactions";
  const query = new URLSearchParams({ ...(trx ? { trx } : {}) });
  const baseWithFilters = query.toString() ? `${base}?${query.toString()}` : base;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Ledger"
        subtitle={`${total.toLocaleString()} matching · ${inCoins.toLocaleString()} coins in / ${outCoins.toLocaleString()} coins out`}
      />

      <Tabs
        base={base}
        active={tab}
        keep={{ trx: trx || undefined }}
        tabs={TYPES.map((t) => ({
          key: t,
          label: t === "all" ? "All" : t[0].toUpperCase() + t.slice(1),
          count: typeCount(t),
        }))}
      />

      <Panel>
        <form className="flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
              REFERENCE
            </span>
            <input
              name="trx"
              defaultValue={sp.trx ?? ""}
              placeholder="TX-…, DEP-…, WDL-…"
              className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
          </label>
          <button className="cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
          {(tab !== "all" || trx) && (
            <Link href={base} className="px-2 py-2.5 text-xs text-slate-400 hover:text-white">
              Clear
            </Link>
          )}
        </form>
      </Panel>

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No ledger entries match those filters.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Player", "Type", "Amount", "Balance after", "Memo", "When"]}>
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{t.trx}</td>
                <td className="max-w-[190px] truncate px-4 py-2.5 text-xs">
                  <RowLink href={`/admin/users/${t.userId}`}>{t.user.email}</RowLink>
                  {t.user.status !== "active" && (
                    <span className="ml-1.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                      BANNED
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs capitalize text-slate-300">{t.type}</td>
                <td
                  className={`px-4 py-2.5 font-mono text-xs ${
                    t.amount > 0 ? "text-emerald-300" : t.amount < 0 ? "text-rose-300" : "text-slate-400"
                  }`}
                >
                  {t.amount > 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                  {t.balance.toLocaleString()}
                </td>
                <td className="max-w-[280px] truncate px-4 py-2.5 text-xs text-slate-500">{t.memo}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Pager page={page} total={total} base={baseWithFilters} label="entries" />
    </div>
  );
}