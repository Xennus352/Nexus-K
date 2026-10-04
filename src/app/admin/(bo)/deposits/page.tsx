// Deposit queue. Filtering happens in the query so the table stays cheap, and
// each pending row carries the two buttons that actually move money (approve,
// cancel) — both of which re-read the row's status before touching the wallet,
// so a double-click or a stale tab cannot pay twice.

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
import { Flash, Pager, RowLink, TextField, pageOf } from "@/components/admin/parts";
import SlipThumb from "@/components/admin/SlipThumb";
import { approveDeposit, rejectDeposit } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES = ["", "pending", "success", "cancel"];

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; trx?: string; page?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const status = STATUSES.includes(sp.status ?? "") ? sp.status! : "";
  const trx = (sp.trx ?? "").trim().slice(0, 40);
  const page = pageOf(sp);

  const where = {
    ...(status ? { status } : {}),
    ...(trx ? { trx: { contains: trx.toUpperCase() } } : {}),
  };

  const [rows, total, totals, currency] = await Promise.all([
    prisma.deposit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.deposit.count({ where }),
    prisma.deposit.aggregate({
      _sum: { amount: true, coins: true },
      where: { status: "success" },
    }),
    setting("site.currency"),
  ]);

  const base = "/admin/deposits";
  const query = new URLSearchParams({ ...(status ? { status } : {}), ...(trx ? { trx } : {}) });
  const baseWithFilters = `${base}?${query.toString()}`;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Deposits"
        subtitle={`${total.toLocaleString()} matching · ${fmt(totals._sum.amount ?? 0, currency)} settled in total`}
      />

      <Flash ok={sp.ok} error={sp.error} />

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
          <label>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">STATUS</span>
            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="cancel">Cancelled</option>
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
          {(status || trx) && (
            <Link href={base} className="px-2 py-2.5 text-xs text-slate-400 hover:text-white">
              Clear
            </Link>
          )}
        </form>
      </Panel>

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No deposits match those filters.</Empty>
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

      {rows.some((d) => d.status === "pending") && (
        <Panel title="PENDING QUEUE">
          <p className="mb-4 text-xs text-slate-400">
            Approving credits the wallet immediately. Cancelling does nothing to the wallet — nothing
            was ever credited. Check the player&apos;s screenshot against the amount before approving.
          </p>
          <div className="space-y-4">
            {rows
              .filter((d) => d.status === "pending")
              .map((d) => (
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
                        Approve & credit {d.coins.toLocaleString()} coins
                      </Button>
                    </form>
                    <form action={rejectDeposit} className="space-y-2">
                      <input type="hidden" name="id" value={d.id} />
                      <TextField name="adminNote" label="CANCEL REASON" placeholder="Amount never received" />
                      <Button type="submit" tone="danger" className="w-full">
                        Cancel deposit
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