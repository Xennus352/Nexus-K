// Identity verification queue.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { settingBool } from "@/lib/settings";
import { Button, Empty, PageTitle, Panel, StatusBadge, formatDate } from "@/components/ui";
import { Flash, JsonView } from "@/components/admin/parts";
import { reviewKyc } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const STATUSES = ["", "pending", "approved", "rejected"];

export default async function AdminKycPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const status = STATUSES.includes(sp.status ?? "") ? sp.status! : "";
  const gatesWithdrawals = await settingBool("kyc.required_for_withdraw", false);

  const rows = await prisma.kycSubmission.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    include: {
      user: {
        select: { id: true, email: true, totalDeposit: true, totalWithdraw: true, createdAt: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Identity verification"
        subtitle={
          gatesWithdrawals
            ? "Approved documents are required before a payout can be requested"
            : "Currently advisory — turn on “Require approved KYC to withdraw” in Settings to enforce it"
        }
      />

      <Flash ok={sp.ok} error={sp.error} />

      <Panel>
        <form className="flex items-end gap-3">
          <label>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">STATUS</span>
            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
        </form>
      </Panel>

      {rows.length === 0 ? (
        <Empty>No submissions to review.</Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((k) => (
            <Panel
              key={k.id}
              title={k.user.email}
              action={<StatusBadge status={k.status} />}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Submitted document
                  </div>
                  <JsonView raw={k.data} />
                  {k.reason && <p className="mt-2 text-xs text-rose-300">Reason sent: {k.reason}</p>}
                </div>

                <dl className="space-y-2 text-sm">
                  <Line k="Player" v={<Link href={`/admin/users/${k.userId}`} className="text-sky-300 hover:underline">{k.user.email}</Link>} />
                  <Line k="Deposited" v={k.user.totalDeposit.toFixed(2)} />
                  <Line k="Withdrawn" v={k.user.totalWithdraw.toFixed(2)} />
                  <Line k="Member since" v={formatDate(k.user.createdAt)} />
                  <Line k="Submitted" v={formatDate(k.submittedAt)} />
                  <Line k="Reviewed" v={formatDate(k.reviewedAt)} />
                </dl>

                <form action={reviewKyc} className="space-y-3">
                  <input type="hidden" name="id" value={k.id} />
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                      REASON (REQUIRED TO REJECT)
                    </span>
                    <input
                      name="reason"
                      defaultValue={k.reason}
                      placeholder="Document unreadable, name mismatch…"
                      className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="submit" name="status" value="approved" tone="good">
                      Approve
                    </Button>
                    <Button type="submit" name="status" value="rejected" tone="danger">
                      Reject
                    </Button>
                  </div>
                  {k.status !== "pending" && (
                    <Button type="submit" name="status" value="pending" tone="ghost" className="w-full">
                      Put back in review
                    </Button>
                  )}
                </form>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-400">{k}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-slate-200">{v}</dd>
    </div>
  );
}