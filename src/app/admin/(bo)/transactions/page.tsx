// Global wallet ledger.
//
// The audit view: every coin that entered or left any wallet, in the order it
// happened, with the balance immediately after each movement. Written by
// src/lib/wallet.ts, which is the only module permitted to move coins.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Empty, PageTitle, Panel, Table, formatDate } from "@/components/ui";
import { Pager, RowLink, pageOf } from "@/components/admin/parts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const TYPES = [
  "",
  "deposit",
  "withdrawal",
  "bonus",
  "referral",
  "refund",
  "adjustment",
  "bet",
  "win",
];

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; trx?: string; page?: string }>;
}) {
  const sp = await searchParams;

  const type = TYPES.includes(sp.type ?? "") ? sp.type! : "";
  const trx = (sp.trx ?? "").trim().slice(0, 40);
  const page = pageOf(sp);

  const where = {
    ...(type ? { type } : {}),
    ...(trx ? { OR: [{ trx: { contains: trx.toUpperCase() } }, { ref: { contains: trx.toUpperCase() } }] } : {}),
  };

  const [rows, total, credits, debits] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.transaction.count({ where }),
    // Net movement in coins, over the whole ledger. Split by sign because
    // `_sum` of a filtered set needs two queries and one of them would be zero
    // most of the time.
    prisma.transaction.findMany({ where: { amount: { gt: 0 } }, select: { amount: true } }),
    prisma.transaction.findMany({ where: { amount: { lt: 0 } }, select: { amount: true } }),
  ]);

  const inCoins = credits.reduce((a, t) => a + t.amount, 0);
  const outCoins = Math.abs(debits.reduce((a, t) => a + t.amount, 0));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Ledger"
        subtitle={`${total.toLocaleString()} matching · ${inCoins.toLocaleString()} coins in / ${outCoins.toLocaleString()} coins out`}
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
          <label>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">TYPE</span>
            <select
              name="type"
              defaultValue={type}
              className="rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="">All</option>
              {TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
          {(type || trx) && (
            <Link href="/admin/transactions" className="px-2 py-2.5 text-xs text-slate-400 hover:text-white">
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

      <Pager page={page} total={total} base="/admin/transactions" label="entries" />
    </div>
  );
}