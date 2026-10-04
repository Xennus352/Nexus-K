import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { settingBool } from "@/lib/settings";
import { supportLink } from "@/lib/telegram";
import { Button, ButtonLink, Field, Notice, PageTitle, Panel, StatusBadge, formatDate, inputClass } from "@/components/ui";
// The reply/reopen actions live in ticket-actions.ts alongside the other
// player-side ticket writes so the ownership checks and the Telegram
// notification cannot drift apart from the ones the rest of the app uses.
import { replyToTicket, reopenTicket } from "@/server/ticket-actions";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const ticket = await prisma.supportTicket.findUnique({
    where: { ticket: decodeURIComponent(id) },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket || ticket.userId !== user.id) notFound();

  // The bot receives this as its `/start` payload, so the operator opens the chat
  // already knowing which ticket it is about.
  const telegram = (await settingBool("support.telegram_enabled", true))
    ? await supportLink(ticket.ticket)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle
        title={ticket.subject}
        subtitle={`${ticket.ticket} · ${ticket.category} · opened ${formatDate(ticket.createdAt)}`}
        action={
          <ButtonLink href="/support" tone="ghost">
            All tickets
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={ticket.status} />
        <span className="text-xs text-slate-500">Priority: {ticket.priority}</span>
        </div>

      {ticket.status === "answered" && (
        <Notice tone="info">Our team replied. Add a message below to continue the conversation.</Notice>
      )}

      {telegram && (
        <a
          href={telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-[#2AABEE]/30 bg-[#1d3f5e]/50 px-4 py-3 text-sm text-slate-200 transition hover:border-[#2AABEE]/55 hover:brightness-110"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-[#2AABEE]" aria-hidden>
            <path d="M21.9 4.3 18.6 20c-.25 1.1-.9 1.37-1.83.85l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.15 9.37-8.47c.4-.36-.09-.56-.63-.2L5.77 13.3.72 11.7c-1.1-.34-1.12-1.1.23-1.63L20.55 2.7c.92-.34 1.72.2 1.35 1.6Z" />
          </svg>
          <span className="min-w-0 flex-1">
            Continue this on Telegram
            <span className="block text-xs text-slate-400">
              Opens the support chat with ticket <span className="font-mono">{ticket.ticket}</span> attached.
            </span>
          </span>
          <span className="shrink-0 text-slate-400">→</span>
        </a>
      )}

      <Panel bodyClass="space-y-4 p-5">
        {ticket.messages.map((m) => (
          <article
            key={m.id}
            className={`rounded-2xl border p-4 ${
              m.isAdmin
                ? "border-sky-500/25 bg-sky-500/5"
                : "border-white/10 bg-[#2b3a6e]"
            }`}
          >
            <header className="mb-2 flex items-center justify-between text-xs">
              <span className={`font-bold ${m.isAdmin ? "text-sky-300" : "text-slate-300"}`}>
                {m.isAdmin ? "Nexus-K support" : "You"}
              </span>
              <span className="text-slate-500">{formatDate(m.createdAt)}</span>
            </header>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{m.body}</p>
          </article>
        ))}
      </Panel>

      {ticket.status !== "closed" ? (
        <Panel title="REPLY">
          <form action={replyToTicket} className="space-y-3">
            <input type="hidden" name="ticket" value={ticket.ticket} />
            <Field label="MESSAGE">
              <textarea name="body" required rows={5} maxLength={4000} className={inputClass} />
            </Field>
            <Button type="submit">Send reply</Button>
          </form>
        </Panel>
      ) : (
        <Panel title="TICKET CLOSED">
          <p className="text-sm text-slate-400">
            This conversation is closed. Reopen it above if the issue is not resolved.
          </p>
          <form action={reopenTicket} className="mt-3">
            <input type="hidden" name="ticket" value={ticket.ticket} />
            <Button type="submit" tone="ghost">
              Reopen ticket
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}