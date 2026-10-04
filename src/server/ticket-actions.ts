// Support tickets and KYC review actions (player-side replies).
//
// Both actions resolve the session, then re-read the ticket and check ownership
// before writing — a player must never be able to reply to, or reopen, somebody
// else's ticket by passing a different reference.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { settingBool } from "@/lib/settings";
import { ticketNumber } from "@/lib/ids";

/** The player behind the current session, or null. */
async function currentPlayer() {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { email: session.email } });
}

const CATEGORIES = ["general", "payment", "withdrawal", "bonus", "account", "game"];
const PRIORITIES = ["low", "normal", "high"];

/** Opens a new ticket with its first message in one round trip. */
export async function createTicket(formData: FormData) {
  const user = await currentPlayer();
  if (!user) redirect("/?error=Login+required");
  if (!(await settingBool("tickets.enabled", true))) redirect("/support");

  const subject = String(formData.get("subject") ?? "").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!subject || !body) redirect("/support/new?error=Subject+and+message+are+required");

  // The picklists are rendered from a fixed list, but a crafted POST could send
  // anything — clamp to known values so admin filters stay meaningful.
  const rawCategory = String(formData.get("category") ?? "general");
  const rawPriority = String(formData.get("priority") ?? "normal");
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : "general";
  const priority = PRIORITIES.includes(rawPriority) ? rawPriority : "normal";

  // Ticket numbers are unguessable, so a collision is a fluke — but it would be
  // a hard failure on a unique index, so retry rather than 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ticket = ticketNumber();
    const exists = await prisma.supportTicket.findUnique({ where: { ticket }, select: { id: true } });
    if (exists) continue;
    await prisma.supportTicket.create({
      data: {
        ticket,
        userId: user.id,
        subject,
        category,
        priority,
        messages: { create: { userId: user.id, author: user.email, body } },
      },
    });
    revalidatePath("/support");
    redirect(`/support/${ticket}`);
  }

  redirect("/support/new?error=Could+not+allocate+a+ticket+number");
}

export async function replyToTicket(formData: FormData) {
  const user = await currentPlayer();
  if (!user) return;

  const ticketNo = String(formData.get("ticket") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!ticketNo || !body) return;

  const ticket = await prisma.supportTicket.findUnique({ where: { ticket: ticketNo } });
  // Closed tickets and other people's tickets are both refused here.
  if (!ticket || ticket.userId !== user.id || ticket.status === "closed") return;

  await prisma.supportMessage.create({
    data: { ticketId: ticket.id, userId: user.id, author: user.email, body, isAdmin: false },
  });
  // A player reply puts the ticket back in the operators' queue.
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "open", lastReply: new Date() },
  });
  revalidatePath(`/support/${ticket.ticket}`);
  revalidatePath("/support");
}

export async function reopenTicket(formData: FormData) {
  const user = await currentPlayer();
  if (!user) return;
  if (!(await settingBool("tickets.enabled", true))) return;

  const ticketNo = String(formData.get("ticket") ?? "").trim();
  const ticket = await prisma.supportTicket.findUnique({ where: { ticket: ticketNo } });
  if (!ticket || ticket.userId !== user.id || ticket.status !== "closed") return;

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "open", lastReply: new Date() },
  });
  revalidatePath(`/support/${ticket.ticket}`);
  revalidatePath("/support");
}

export async function closeTicket(formData: FormData) {
  const user = await currentPlayer();
  if (!user) return;

  const ticketNo = String(formData.get("ticket") ?? "").trim();
  const ticket = await prisma.supportTicket.findUnique({ where: { ticket: ticketNo } });
  if (!ticket || ticket.userId !== user.id || ticket.status === "closed") return;

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "closed" },
  });
  revalidatePath(`/support/${ticket.ticket}`);
  revalidatePath("/support");
}

/** Submits (or resubmits) an identity-verification document for review. */
export async function submitKyc(formData: FormData) {
  const user = await currentPlayer();
  if (!user) return;

  const data: Record<string, string> = {};
  for (const key of ["fullName", "dob", "country", "document"]) {
    const value = String(formData.get(key) ?? "").trim().slice(0, 120);
    if (value) data[key] = value;
  }
  if (Object.keys(data).length === 0) return;

  // An approved submission is never reset to pending — otherwise the player
  // could withdraw from review by resubmitting.
  const existing = await prisma.kycSubmission.findUnique({ where: { userId: user.id } });
  if (existing?.status === "approved") return;

  await prisma.kycSubmission.upsert({
    where: { userId: user.id },
    update: {
      data: JSON.stringify(data),
      status: "pending",
      reason: "",
      reviewedAt: null,
      submittedAt: new Date(),
    },
    create: { userId: user.id, data: JSON.stringify(data), status: "pending" },
  });
  revalidatePath("/wallet");
}