import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { coinsToCash, currency } from "@/lib/money";
import {
  ButtonLink,
  Empty,
  PageTitle,
  Panel,
  StatusBadge,
  Table,
  formatDate,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WithdrawHistory() {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const rows = await prisma.withdrawal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { method: true },
  });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Withdrawal history"
        subtitle={`${rows.length} request${rows.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/withdraw" tone="primary">
            New withdrawal
          </ButtonLink>
        }
      />

      <Panel bodyClass="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No payout requests yet.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Method", "Coins", "Payout", "Status", "Date"]}>
            {rows.map((w) => (
              <tr key={w.id} className="align-top hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-sky-300">{w.trx}</td>
                <td className="px-4 py-3 text-slate-300">{w.method.name}</td>
                <td className="px-4 py-3 font-mono text-slate-200">
                  {w.amount.toLocaleString()}
                  {w.fee > 0 && (
                    <div className="text-[11px] text-slate-500">fee {w.fee.toFixed(2)}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">
                  {currency(w.currency).symbol}
                  {coinsToCash(w.amount, w.method.rate, w.currency).toFixed(2)} {w.currency}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={w.status} />
                  {w.adminNote && (
                    <div className="mt-1 max-w-[220px] text-[11px] text-slate-500">
                      {w.adminNote}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {formatDate(w.paidAt ?? w.createdAt)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <p className="text-xs text-slate-500">
        Questions about a payout? <Link href="/support" className="text-sky-400 hover:underline">Open a ticket</Link>.
      </p>
    </div>
  );
}