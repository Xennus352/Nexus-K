import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button, ButtonLink, Field, Notice, PageTitle, Panel, StatusBadge, formatDate, inputClass } from "@/components/ui";

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
          <form action={reply} className="space-y-3">
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
          <form action={reopen} className="mt-3">
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

async function reply(formData: FormData) {
  "use server";
  const { getSession } = await import("@/lib/session");
  const { prisma } = await import("@/lib/prisma");
  const { revalidatePath } = await import("next/cache");

  const session = await getSession();
  if (!session) return;
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) return;

  const ticketNo = String(formData.get("ticket") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return;

  const ticket = await prisma.supportTicket.findUnique({ where: { ticket: ticketNo } });
  if (!ticket || ticket.userId !== user.id || ticket.status === "closed") return;

  await prisma.supportMessage.create({
    data: { ticketId: ticket.id, userId: user.id, author: user.email, body, isAdmin: false },
  });
  // A player replying puts the ticket back in the queue for the operators.
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "open", lastReply: new Date() },
  });
  revalidatePath(`/support/${ticket.ticket}`);
}

async function reopen(formData: FormData) {
  "use server";
  const { getSession } = await import("@/lib/session");
  const { prisma } = await import("@/lib/prisma");
  const { revalidatePath } = await import("next/cache");

  const session = await getSession();
  if (!session) return;
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) return;

  const ticketNo = String(formData.get("ticket") ?? "");
  const ticket = await prisma.supportTicket.findUnique({ where: { ticket: ticketNo } });
  if (!ticket || ticket.userId !== user.id) return;

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "open", lastReply: new Date() },
  });
  revalidatePath(`/support/${ticket.ticket}`);
  revalidatePath("/support");
}