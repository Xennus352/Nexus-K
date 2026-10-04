// Withdrawal queue.
//
// The coins were debited from the player's wallet when the request was made, so
// the two buttons here mean very different things: "paid" closes the request,
// while "cancel" *refunds* the reservation. Both go through src/lib/settle.ts,
// which re-reads the row before acting.

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
import { Flash, JsonView, Pager, RowLink, TextField, pageOf } from "@/components/admin/parts";
import { payWithdrawal, rejectWithdrawal } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES = ["", "pending", "success", "cancel"];

export default async function AdminWithdrawalsPage({
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
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } }, method: { select: { name: true, code: true } } },
    }),
    prisma.withdrawal.count({ where }),
    prisma.withdrawal.aggregate({ _sum: { net: true }, where: { status: "success" } }),
    setting("site.currency"),
  ]);

  const query = new URLSearchParams({ ...(status ? { status } : {}), ...(trx ? { trx } : {}) });
  const baseWithFilters = `/admin/withdrawals?${query.toString()}`;
  const pending = rows.filter((w) => w.status === "pending");

  return (
    <div className="space-y-6">
      <PageTitle
        title="Withdrawals"
        subtitle={`${total.toLocaleString()} matching · ${fmt(totals._sum.net ?? 0, currency)} paid out in total`}
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
              placeholder="WDL-XXXXXXXX"
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
              <option value="success">Paid</option>
              <option value="cancel">Cancelled</option>
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
          {(status || trx) && (
            <Link href="/admin/withdrawals" className="px-2 py-2.5 text-xs text-slate-400 hover:text-white">
              Clear
            </Link>
          )}
        </form>
      </Panel>

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No withdrawals match those filters.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Player", "Method", "Payout", "Charged", "Details", "Status", "When"]}>
            {rows.map((w) => (
              <tr key={w.id} className="align-top hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-xs text-sky-300">{w.trx}</td>
                <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-400">
                  <RowLink href={`/admin/users/${w.userId}`}>{w.user.email}</RowLink>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{w.method.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-200">{fmt(w.net, w.currency)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {w.amount.toLocaleString()}
                  <div className="text-[10px]">+{w.fee.toFixed(2)} fee</div>
                </td>
                <td className="min-w-[180px] px-4 py-3">
                  <JsonView raw={w.account} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={w.status} />
                  {w.adminNote && (
                    <div className="mt-1 max-w-[200px] text-[10px] text-slate-500">{w.adminNote}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(w.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Pager page={page} total={total} base={baseWithFilters} label="withdrawals" />

      {pending.length > 0 && (
        <Panel title="PENDING QUEUE">
          <p className="mb-4 text-xs text-slate-400">
            Send the payout first, then mark it paid. Cancelling refunds{" "}
            {pending.reduce((a, w) => a + w.charge, 0).toLocaleString()} reserved coins back to the
            players below.
          </p>
          <div className="space-y-4">
            {pending.map((w) => (
              <div key={w.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-sky-300">{w.trx}</span>
                  <span className="text-sm text-slate-300">
                    {w.user.email} ·{" "}
                    <span className="font-mono">{fmt(w.net, w.currency)}</span> via{" "}
                    {w.method.name}
                  </span>
                </div>
                <div className="mb-4 rounded-xl bg-black/20 p-3">
                  <JsonView raw={w.account} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <form action={payWithdrawal} className="space-y-2">
                    <input type="hidden" name="id" value={w.id} />
                    <TextField name="adminNote" label="NOTE" placeholder="Sent via SEPA, ref 88213" />
                    <Button type="submit" tone="good" className="w-full">
                      Mark as paid
                    </Button>
                  </form>
                  <form action={rejectWithdrawal} className="space-y-2">
                    <input type="hidden" name="id" value={w.id} />
                    <TextField name="adminNote" label="CANCEL REASON" placeholder="Account name mismatch" />
                    <Button type="submit" tone="danger" className="w-full">
                      Cancel & refund
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