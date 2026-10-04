// Player list: search, filter, and a link into the per-player detail screen.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { setting } from "@/lib/settings";
import { fmt } from "@/lib/money";
import { Empty, PageTitle, Panel, StatusBadge, Table, formatDate } from "@/components/ui";
import { Pager, RowLink, pageOf } from "@/components/admin/parts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = ["active", "blocked"].includes(sp.status ?? "") ? sp.status! : "";
  const page = pageOf(sp);

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
            { refCode: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [rows, total, currency] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        totalDeposit: true,
        totalBet: true,
        refCode: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.user.count({ where }),
    setting("site.currency"),
  ]);

  const base = "/admin/users";

  return (
    <div className="space-y-6">
      <PageTitle title="Players" subtitle={`${total.toLocaleString()} account${total === 1 ? "" : "s"}`} />

      <Panel>
        <form className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">SEARCH</span>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Email, username or referral code"
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
              <option value="active">Active</option>
              <option value="blocked">Suspended</option>
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
        </form>
      </Panel>

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No players match those filters.</Empty>
          </div>
        ) : (
          <Table head={["Player", "Status", "Deposited", "Wagered", "Ref code", "Joined", "Last login"]}>
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-white/5">
                <td className="px-4 py-3">
                  <RowLink href={`/admin/users/${u.id}`}>{u.email}</RowLink>
                  {u.username && <div className="text-[10px] text-slate-500">@{u.username}</div>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.status} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-300">
                  {fmt(u.totalDeposit, currency)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-300">
                  {u.totalBet.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{u.refCode || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(u.lastLoginAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="flex items-center justify-between gap-3">
        <Pager page={page} total={total} base={base} label="players" />
        <Link
          href="/admin/reports"
          className="text-xs text-sky-400 hover:underline"
        >
          Aggregates in Reports →
        </Link>
      </div>
    </div>
  );
}