// Ticket queue: what players are waiting on, worst first.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Empty, PageTitle, Panel, StatusBadge, Table, formatDate } from "@/components/ui";
import { Flash, Pager, RowLink, pageOf } from "@/components/admin/parts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES = ["", "open", "answered", "closed"];
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; page?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const status = STATUSES.includes(sp.status ?? "") ? sp.status! : "";
  const priority = ["low", "normal", "high"].includes(sp.priority ?? "") ? sp.priority! : "";
  const page = pageOf(sp);

  const where = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  };

  const [rows, total, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ lastReply: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  // Sorting in JS keeps the DB index on lastReply while still surfacing the
  // high-priority tickets a player is waiting on.
  const sorted = [...rows].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
      b.lastReply.getTime() - a.lastReply.getTime(),
  );

  return (
    <div className="space-y-6">
      <PageTitle
        title="Tickets"
        subtitle={`${total.toLocaleString()} matching · ${byStatus.open ?? 0} open · ${byStatus.answered ?? 0} answered`}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <Panel>
        <form className="flex flex-wrap items-end gap-3">
          <label>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">STATUS</span>
            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">PRIORITY</span>
            <select
              name="priority"
              defaultValue={priority}
              className="rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="">All</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
          {(status || priority) && (
            <Link href="/admin/tickets" className="px-2 py-2.5 text-xs text-slate-400 hover:text-white">
              Clear
            </Link>
          )}
        </form>
      </Panel>

      <Panel bodyClass="p-0 sm:p-0">
        {sorted.length === 0 ? (
          <div className="p-5">
            <Empty>No tickets match those filters.</Empty>
          </div>
        ) : (
          <Table head={["Ticket", "Player", "Subject", "Category", "Priority", "Status", "Last reply"]}>
            {sorted.map((t) => (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-xs text-sky-300">
                  <RowLink href={`/admin/tickets/${t.ticket}`}>{t.ticket}</RowLink>
                </td>
                <td className="max-w-[190px] truncate px-4 py-3 text-xs">
                  <RowLink href={`/admin/users/${t.userId}`}>{t.user.email}</RowLink>
                </td>
                <td className="max-w-[280px] truncate px-4 py-3 text-xs text-slate-300">{t.subject}</td>
                <td className="px-4 py-3 text-xs capitalize text-slate-400">{t.category}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-bold uppercase ${
                      t.priority === "high"
                        ? "text-rose-300"
                        : t.priority === "low"
                          ? "text-slate-500"
                          : "text-amber-300"
                    }`}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(t.lastReply)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Pager page={page} total={total} base="/admin/tickets" label="tickets" />
    </div>
  );
}