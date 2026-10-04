import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { settingBool } from "@/lib/settings";
import { supportLink } from "@/lib/telegram";
import { ButtonLink, Empty, PageTitle, Panel, StatusBadge, Table, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const [tickets, enabled, telegram] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { lastReply: "desc" },
      take: 50,
    }),
    settingBool("tickets.enabled", true),
    // Null when no bot is configured, so the button disappears instead of
    // sending a player to a dead link.
    settingBool("support.telegram_enabled", true).then((on) => (on ? supportLink() : null)),
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

      {/* Fast lane: the ticket system is the record of the conversation, Telegram is
          the quicker way to start it. The deep link carries nothing identifying —
          the bot hands back whatever /start payload was sent, and the operator
          still resolves the player from the account. */}
      {telegram && (
        <a
          href={telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl border border-[#2AABEE]/35 bg-gradient-to-r from-[#1d3f5e]/70 to-[#16224d]/70 px-5 py-4 transition hover:border-[#2AABEE]/60 hover:brightness-110"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2AABEE]/15">
            {/* Telegram's mark is a trademark, so it is inlined rather than pulled
                from an icon set that would ship the wrong brand. */}
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-[#2AABEE]" aria-hidden>
              <path d="M21.9 4.3 18.6 20c-.25 1.1-.9 1.37-1.83.85l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.15 9.37-8.47c.4-.36-.09-.56-.63-.2L5.77 13.3.72 11.7c-1.1-.34-1.12-1.1.23-1.63L20.55 2.7c.92-.34 1.72.2 1.35 1.6Z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-100">Message us on Telegram</span>
            <span className="block text-xs text-slate-300/80">
              Faster than a ticket for anything urgent — it opens a chat with our support bot.
            </span>
          </span>
          <span className="shrink-0 text-slate-400">→</span>
        </a>
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