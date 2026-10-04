// One ticket thread, with the reply box.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Button,
  PageTitle,
  Panel,
  StatusBadge,
  formatDate,
} from "@/components/ui";
import { Flash, RowLink } from "@/components/admin/parts";
import { replyToTicket, setTicketStatus } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

export default async function AdminTicketDetail({
  params,
  searchParams,
}: {
  params: Promise<{ ticket: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ticket: ticketNo } = await params;
  const sp = await searchParams;

  const ticket = await prisma.supportTicket.findUnique({
    where: { ticket: ticketNo.toUpperCase() },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          totalDeposit: true,
          totalBet: true,
          createdAt: true,
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="space-y-6">
      <PageTitle
        title={ticket.subject}
        subtitle={
          <>
            <span className="font-mono">{ticket.ticket}</span> · opened {formatDate(ticket.createdAt)} ·{" "}
            <span className="capitalize">{ticket.category}</span> · {ticket.priority} priority
          </>
        }
        action={<StatusBadge status={ticket.status} />}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="THREAD">
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages on this ticket.</p>
            ) : (
              <ul className="space-y-4">
                {ticket.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-xl border p-4 ${
                      m.isAdmin
                        ? "border-sky-500/30 bg-sky-950/30"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className={`text-xs font-bold ${m.isAdmin ? "text-sky-300" : "text-slate-300"}`}>
                        {m.isAdmin ? `${m.author} · staff` : ticket.user.email}
                      </span>
                      <span className="text-[11px] text-slate-500">{formatDate(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                      {m.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="REPLY">
            {ticket.status === "closed" ? (
              <p className="text-sm text-slate-500">
                This ticket is closed. Reopen it from the panel on the right to answer again.
              </p>
            ) : (
              <form action={replyToTicket} className="space-y-3">
                <input type="hidden" name="ticket" value={ticket.ticket} />
                <textarea
                  name="body"
                  rows={6}
                  required
                  maxLength={4000}
                  placeholder="Type the answer the player will see…"
                  className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
                />
                <Button type="submit" className="w-full">
                  Send reply
                </Button>
              </form>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="PLAYER">
            <dl className="space-y-2 text-sm">
              <Line k="Email" v={<RowLink href={`/admin/users/${ticket.userId}`}>{ticket.user.email}</RowLink>} />
              <Line k="Status" v={<StatusBadge status={ticket.user.status} />} />
              <Line k="Total deposited" v={ticket.user.totalDeposit.toFixed(2)} />
              <Line k="Total wagered" v={ticket.user.totalBet.toLocaleString()} />
              <Line k="Member since" v={formatDate(ticket.user.createdAt)} />
              <Line k="Messages" v={ticket.messages.length} />
            </dl>
          </Panel>

          <Panel title="TICKET STATUS">
            <div className="space-y-2">
              {(["open", "answered", "closed"] as const)
                .filter((s) => s !== ticket.status)
                .map((s) => (
                  <form key={s} action={setTicketStatus}>
                    <input type="hidden" name="ticket" value={ticket.ticket} />
                    <input type="hidden" name="status" value={s} />
                    <Button
                      type="submit"
                      tone={s === "closed" ? "ghost" : "primary"}
                      className="w-full"
                    >
                      Mark {s}
                    </Button>
                  </form>
                ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Closing a ticket hides the reply box. The player can reopen it themselves, which puts it
              back in this queue.
            </p>
          </Panel>
        </div>
      </div>
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