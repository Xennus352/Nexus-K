// Deposit queue.
//
// The tabs are the point of this screen: an operator opens it to answer one of
// three questions — what needs a decision, what have I already paid out, what
// did I turn down — and a single "All / Pending / Success / Cancelled" dropdown
// plus a combined table made all three the same amount of scrolling. Each tab is a
// link with its own URL, so a pending queue can be bookmarked or shared.
//
// Filtering happens in the query so the table stays cheap, and each pending row
// carries the two buttons that actually move money (approve, cancel) — both of
// which re-read the row's status before touching the wallet, so a double-click or
// a stale tab cannot pay twice.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { setting } from "@/lib/settings";
import { fmt } from "@/lib/money";
import {
  Button,
  Empty,
  PageTitle,
  Panel,
  StatusBadge,
  Table,
  formatDate,
} from "@/components/ui";
import { Flash, PAGE_SIZE, Pager, RowLink, Tabs, TextField, pageOf } from "@/components/admin/parts";
import SlipThumb from "@/components/admin/SlipThumb";
import { approveDeposit, rejectDeposit } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

/** Accepted values of ?tab=. Anything else falls back to "all". */
const TABS = ["all", "pending", "success", "cancel"] as const;
type Tab = (typeof TABS)[number];

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; trx?: string; page?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "all";
  const trx = (sp.trx ?? "").trim().slice(0, 40);
  const page = pageOf(sp);

  const where = {
    ...(tab !== "all" ? { status: tab } : {}),
    ...(trx ? { trx: { contains: trx.toUpperCase() } } : {}),
  };

  const [rows, total, totals, settled, currency] = await Promise.all([
    prisma.deposit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true, status: true } } },
    }),
    prisma.deposit.count({ where }),
    prisma.deposit.aggregate({ _sum: { amount: true, coins: true }, where: { status: "success" } }),
    prisma.deposit.groupBy({ by: ["status"], _count: { _all: true } }),
    setting("site.currency"),
  ]);

  // One groupBy answers all four tab counts, so the tabs can say how much is
  // waiting rather than making the operator switch to find out.
  const countOf = (status: Tab) =>
    status === "all"
      ? settled.reduce((a, g) => a + g._count._all, 0)
      : (settled.find((g) => g.status === status)?._count._all ?? 0);

  const base = "/admin/deposits";
  const query = new URLSearchParams({ ...(trx ? { trx } : {}) });
  const baseWithFilters = query.toString() ? `${base}?${query.toString()}` : base;

  const pending = rows.filter((d) => d.status === "pending");

  return (
    <div className="space-y-6">
      <PageTitle
        title="Deposits"
        subtitle={`${fmt(totals._sum.amount ?? 0, currency)} settled in total · ${countOf("pending").toLocaleString()} awaiting a decision`}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <Tabs
        base={base}
        active={tab}
        keep={{ trx: trx || undefined }}
        tabs={[
          { key: "all", label: "All", count: countOf("all") },
          { key: "pending", label: "Accept", count: countOf("pending") },
          { key: "success", label: "Accepted", count: countOf("success") },
          { key: "cancel", label: "Rejected", count: countOf("cancel") },
        ]}
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
              placeholder="DEP-XXXXXXXX"
              className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
          </label>
          {/* The tab travels with the form so filtering by reference keeps the
              operator in the view they were looking at. */}
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <button className="cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Find
          </button>
          {(trx || tab !== "all") && (
            <Link href={base} className="px-2 py-2.5 text-xs text-slate-400 hover:text-white">
              Clear
            </Link>
          )}
        </form>
      </Panel>

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>
              {tab === "pending"
                ? "Nothing waiting for a decision. Every deposit has been answered."
                : "No deposits match those filters."}
            </Empty>
          </div>
        ) : (
          <Table head={["Reference", "Player", "Rail", "Amount", "Fee", "Coins", "Status", "When"]}>
            {rows.map((d) => (
              <tr key={d.id} className="align-top hover:bg-white/5">
                <td className="px-4 py-3">
                  <RowLink href={`/deposit/${d.trx}`}>{d.trx}</RowLink>
                  {d.paidAt && (
                    <div className="text-[10px] text-slate-500">paid {formatDate(d.paidAt)}</div>
                  )}
                </td>
                <td className="max-w-[190px] truncate px-4 py-3 text-xs text-slate-400">
                  <RowLink href={`/admin/users/${d.userId}`}>{d.user.email}</RowLink>
                  {d.user.status !== "active" && (
                    <span className="mt-1 inline-block rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                      BANNED
                    </span>
                  )}
                  {d.slipAt && (
                    <div className="text-[10px] text-slate-500">
                      slip {formatDate(d.slipAt)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{d.gatewayAlias || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-200">{fmt(d.amount, d.currency)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.fee.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-xs text-emerald-300">
                  {d.coins.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                  {d.adminNote && (
                    <div className="mt-1 max-w-[220px] text-[10px] text-slate-500">{d.adminNote}</div>
                  )}
                  {/* The screenshot is the evidence for the whole row, so it goes
                      next to the status rather than on a separate page. */}
                  {d.slipPath && (
                    <div className="mt-2 w-52">
                      <SlipThumb trx={d.trx} name={d.slipName || "transfer screenshot"} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(d.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Pager page={page} total={total} base={baseWithFilters} label="deposits" />

      {pending.length > 0 && (
        <Panel title={`PENDING QUEUE — ${pending.length}`}>
          <p className="mb-4 text-xs text-slate-400">
            Approving credits the wallet immediately. Cancelling does nothing to the wallet — nothing
            was ever credited. Check the player&apos;s screenshot against the amount before approving.
          </p>
          <div className="space-y-4">
            {pending.map((d) => (
              <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-sky-300">{d.trx}</span>
                  <span className="text-sm text-slate-300">
                    {d.user.email} ·{" "}
                    <span className="font-mono">{fmt(d.amount, d.currency)}</span> →{" "}
                    <span className="font-mono text-emerald-300">{d.coins.toLocaleString()} coins</span>
                  </span>
                </div>
                {d.slipPath && (
                  <div className="mb-3 max-w-xs">
                    <SlipThumb trx={d.trx} name={d.slipName || "transfer screenshot"} />
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  <form action={approveDeposit} className="space-y-2">
                    <input type="hidden" name="id" value={d.id} />
                    <TextField
                      name="reference"
                      label="PROVIDER REFERENCE (OPTIONAL)"
                      placeholder="Bank receipt, Stripe payment id…"
                    />
                    <TextField name="adminNote" label="NOTE" placeholder="Checked against the statement" />
                    <Button type="submit" tone="good" className="w-full">
                      Accept & credit {d.coins.toLocaleString()} coins
                    </Button>
                  </form>
                  <form action={rejectDeposit} className="space-y-2">
                    <input type="hidden" name="id" value={d.id} />
                    <TextField name="adminNote" label="REJECT REASON" placeholder="Amount never received" />
                    <Button type="submit" tone="danger" className="w-full">
                      Reject deposit
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}