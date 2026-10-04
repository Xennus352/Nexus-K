import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { currency } from "@/lib/money";
import {
  ButtonLink,
  Empty,
  PageTitle,
  Panel,
  Stat,
  StatusBadge,
  Table,
  formatDate,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function DepositHistory({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const { page, status } = await searchParams;
  const current = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const statuses = ["pending", "success", "cancel"];
  const filter = statuses.includes(status ?? "") ? status! : undefined;

  const [rows, total, totals] = await Promise.all([
    prisma.deposit.findMany({
      where: { userId: user.id, ...(filter ? { status: filter } : {}) },
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.deposit.count({ where: { userId: user.id, ...(filter ? { status: filter } : {}) } }),
    prisma.deposit.aggregate({
      where: { userId: user.id, status: "success" },
      _sum: { amount: true, coins: true },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Deposit history"
        subtitle={`${total} deposit${total === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/deposit" tone="primary">
            New deposit
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total deposited" value={currency("USD").symbol + (totals._sum.amount ?? 0).toFixed(2)} hint="across all currencies, as sent" />
        <Stat label="Coins credited" value={(totals._sum.coins ?? 0).toLocaleString()} tone="good" />
        <Stat label="Pending" value={(await prisma.deposit.count({ where: { userId: user.id, status: "pending" } }))} tone="warn" />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip href="/deposit/history" label="All" active={!filter} />
        {statuses.map((s) => (
          <FilterChip key={s} href={`/deposit/history?status=${s}`} label={s} active={filter === s} />
        ))}
      </div>

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No deposits match this filter yet.</Empty>
          </div>
        ) : (
          <Table
            head={["Reference", "Method", "Amount", "Coins", "Status", "Date"]}
          >
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link href={`/deposit/${d.trx}`} className="font-mono text-sky-300 hover:underline">
                    {d.trx}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-300">{d.gatewayAlias}</td>
                <td className="px-4 py-3 font-mono text-slate-200">
                  {currency(d.currency).symbol}
                  {d.amount.toLocaleString()} {d.currency}
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">
                  {d.coins.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDate(d.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {current} of {pages}
          </span>
          <div className="flex gap-2">
            {current > 1 && (
              <ButtonLink
                href={`/deposit/history?page=${current - 1}${filter ? `&status=${filter}` : ""}`}
                tone="ghost"
                className="px-3 py-1.5 text-xs"
              >
                Previous
              </ButtonLink>
            )}
            {current < pages && (
              <ButtonLink
                href={`/deposit/history?page=${current + 1}${filter ? `&status=${filter}` : ""}`}
                tone="ghost"
                className="px-3 py-1.5 text-xs"
              >
                Next
              </ButtonLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
        active ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40" : "bg-white/5 text-slate-400 hover:bg-white/10"
      }`}
    >
      {label}
    </Link>
  );
}