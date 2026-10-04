// Player list: search, filter, and a link into the per-player detail screen.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { setting } from "@/lib/settings";
import { fmt } from "@/lib/money";
import { Empty, PageTitle, Panel, StatusBadge, Table, formatDate } from "@/components/ui";
import { Flash, PAGE_SIZE, Pager, RowLink, Tabs, pageOf } from "@/components/admin/parts";
import { createPlayer } from "@/server/admin-actions";
import NewPlayerForm from "@/components/admin/NewPlayerForm";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim().slice(0, 80);
  // "banned" is the word the rest of the app and the operator use; the column
  // has always said "blocked". Both spellings are accepted so a link written by
  // hand lands on the right tab instead of silently reverting to All.
  const status = (["active", "blocked", "banned"] as const).includes(sp.status as "active")
    ? sp.status === "banned"
      ? "blocked"
      : sp.status!
    : "";
  const page = pageOf(sp);

  // The banned tab filters on "not active" rather than on the literal "blocked",
  // so it matches exactly what its count claims and picks up any row whose status
  // went missing. See the note on the counts below.
  const where = {
    ...(status === "blocked" ? { status: { not: "active" } } : status ? { status } : {}),
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

  // The tab counts ignore the search box but respect nothing else, so they stay
  // honest: "3 banned" always means three banned accounts exist, not three that
  // happen to match the reference being typed.
  //
  // Counted rather than grouped, deliberately. `groupBy({ by: ["status"] })` throws
  // P2032 if a single document is missing the field, and this database has two
  // such rows — every other Prisma call in the app is happy to skip them, so the
  // group-by is the one query that turns a data blemish into a 500 on the whole
  // player list. Two counts cannot fail that way.
  //
  // "Banned" is `not: "active"` rather than `= "blocked"` for the same reason: a
  // row with no status is not usable — login refuses anything that is not exactly
  // "active" — so it belongs with the suspended ones rather than vanishing from
  // both tabs.
  const [rows, total, currency, allPlayers, activeCount, bannedCount] = await Promise.all([
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
        banReason: true,
        totalDeposit: true,
        totalBet: true,
        refCode: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.user.count({ where }),
    setting("site.currency"),
    prisma.user.count(),
    prisma.user.count({ where: { status: "active" } }),
    prisma.user.count({ where: { status: { not: "active" } } }),
  ]);

  const countOf = (s: string) => (s === "" ? allPlayers : s === "active" ? activeCount : bannedCount);

  const base = "/admin/users";
  const query = new URLSearchParams({ ...(q ? { q } : {}) });
  const baseWithFilters = query.toString() ? `${base}?${query.toString()}` : base;

  return (
    <div className="space-y-6">
      <PageTitle title="Players" subtitle={`${total.toLocaleString()} account${total === 1 ? "" : "s"}`} />

      <Flash ok={sp.ok} error={sp.error} />

      {/* Public registration is closed, so this is the only way an account comes
          into existence. Hidden from everyone but a superadmin, matching the
          permission the action itself enforces. */}
      {admin.role === "superadmin" && <NewPlayerForm action={createPlayer} />}

      {/* Bans are a tab rather than a dropdown because they are the thing an
          operator comes to this screen to check: a suspended player is the reason
          to open the player list in the first place, and it was previously a
          dropdown defaulting to "All" that reported nothing. */}
      <Tabs
        base={base}
        active={status || "all"}
        param="status"
        keep={{ q: q || undefined }}
        tabs={[
          { key: "all", label: "All players", count: countOf("") },
          { key: "active", label: "Active", count: countOf("active") },
          { key: "blocked", label: "Banned", count: countOf("blocked") },
        ]}
      />

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
          {status && <input type="hidden" name="status" value={status} />}
          <button className="cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold transition hover:brightness-110">
            Filter
          </button>
          {q && (
            // Clears the search but keeps the tab, so clearing a mistyped
            // reference does not also throw the operator out of the banned list
            // they were reading.
            <Link
              href={status ? `${base}?status=${status}` : base}
              className="px-2 py-2.5 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </Link>
          )}
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
                  {/* Anything that is not exactly "active" renders as Banned,
                      including the rare row whose status is missing entirely.
                      `StatusBadge` would paint those an unlabelled grey pill —
                      looking like a rendering fault rather than a player who
                      cannot log in. */}
                  <StatusBadge status={u.status === "active" ? "active" : "blocked"} />
                  {/* The reason travels with the row. An operator who bans a
                      player is asked for a reason and then, days later, cannot
                      remember it; a badge that says only "blocked" sends them to
                      the detail page to find out why they should have left it
                      alone. */}
                  {u.status !== "active" && u.banReason && (
                    <div className="mt-1 max-w-[180px] text-[10px] leading-snug text-rose-200/70">
                      {u.banReason}
                    </div>
                  )}
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
        <Pager page={page} total={total} base={baseWithFilters} label="players" />
        <div className="flex items-center gap-4">
          {/* Superadmin-only, matching `bulkSetPasswords`. */}
          {admin.role === "superadmin" && (
            <Link
              href={`/admin/users/credentials?q=${encodeURIComponent(q)}&status=${status}`}
              className="text-xs text-sky-400 hover:underline"
            >
              Set passwords in bulk →
            </Link>
          )}
          <Link href="/admin/reports" className="text-xs text-sky-400 hover:underline">
            Aggregates in Reports →
          </Link>
        </div>
      </div>
    </div>
  );
}