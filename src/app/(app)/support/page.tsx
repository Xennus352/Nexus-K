import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { settingBool } from "@/lib/settings";
import { ButtonLink, Empty, PageTitle, Panel, StatusBadge, Table, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const [tickets, enabled] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { lastReply: "desc" },
      take: 50,
    }),
    settingBool("tickets.enabled", true),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Support"
        subtitle="Questions about a deposit, payout or your account."
        action={
          enabled ? (
            <ButtonLink href="/support/new" tone="primary">
              New ticket
            </ButtonLink>
          ) : undefined
        }
      />

      {!enabled && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          New tickets are temporarily disabled. Existing tickets remain readable.
        </div>
      )}

      <Panel bodyClass="p-0 sm:p-0">
        {tickets.length === 0 ? (
          <div className="p-5">
            <Empty>You have no support tickets.</Empty>
          </div>
        ) : (
          <Table head={["Ticket", "Subject", "Status", "Last reply"]}>
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link href={`/support/${t.ticket}`} className="font-mono text-sky-300 hover:underline">
                    {t.ticket}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-200">{t.subject}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDate(t.lastReply)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}